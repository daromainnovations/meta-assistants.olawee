import { chatHandlerService } from './chat/chat-handler.service';
import { documentService } from './shared/document.service';
import { titleGeneratorAutomation } from '../automations/title-generator.automation';
import { assistantHandlerService } from './assistants/assistant-handler.service';
import { metaHandlerService } from './meta-assistants/meta-handler.service';
import { executionLoggerService } from '../executions/execution-logger.service';
import { getPrisma } from './shared/prisma.service';

export enum WebhookType {
    DOCUMENT = 'document',
    TEXT = 'text'
}

/**
 * Obtiene el contexto previo guardado en la tabla de la base de datos
 * según el provider y sessionId aportados.
 */
async function getDocumentContext(provider: string, sessionId: string): Promise<string> {
    if (!sessionId) return '';
    const db = getPrisma();
    try {
        let dbTable: any;
        if (provider === 'assistant') dbTable = db.chats_agentes;
        else if (provider === 'meta-assistant') dbTable = db.chatsmeta;
        else dbTable = db.chatsllms;

        const existing = await dbTable.findFirst({ where: { session_id: sessionId } });
        return existing?.systemprompt_doc || '';
    } catch {
        return '';
    }
}

/**
 * Persiste el systemprompt_doc en la tabla de chats correcta
 * para que esté disponible en futuras peticiones via qa-doc-injector.
 */
async function saveDocumentContext(provider: string, sessionId: string, docContext: string): Promise<void> {
    if (!sessionId || !docContext) return;
    const db = getPrisma();
    try {
        let dbTable: any;
        if (provider === 'assistant') dbTable = db.chats_agentes;
        else if (provider === 'meta-assistant') dbTable = db.chatsmeta;
        else dbTable = db.chatsllms;

        const existing = await dbTable.findFirst({ where: { session_id: sessionId } });
        if (existing) {
            await dbTable.update({
                where: { id: existing.id },
                data: { systemprompt_doc: docContext, updated_at: new Date() }
            });
            console.log(`[WebhookService] 💾 systemprompt_doc updated in DB for session "${sessionId}" [${provider}]`);
        } else {
            await dbTable.create({
                data: { session_id: sessionId, systemprompt_doc: docContext, titulo: sessionId }
            });
            console.log(`[WebhookService] 💾 systemprompt_doc created in DB for session "${sessionId}" [${provider}]`);
        }
    } catch (err: any) {
        console.error(`[WebhookService] ❌ Error saving document context: ${err.message}`);
    }
}


export class WebhookService {

    /**
     * Procesa la solicitud entrante y determina si es un documento o texto.
     * @param provider El servicio de LLM (ej: 'openai', 'gemini')
     * @param body El cuerpo de la solicitud (JSON o form-data fields)
     * @param files Archivos adjuntos si existen (array via Multer)
     */
    async handleIncomingRequest(provider: string, body: any, files?: Express.Multer.File[]): Promise<any> {
        console.log(`[WebhookService] Handling request for ${provider}`);

        let parsedTools: number[] = [];
        if (body.tools) {
            try {
                const arr = (typeof body.tools === 'string') ? JSON.parse(body.tools) : body.tools;
                if (Array.isArray(arr)) parsedTools = arr.map(Number).filter(n => !isNaN(n));
                else parsedTools = [Number(arr)].filter(n => !isNaN(n));
            } catch {
                parsedTools = [];
            }
        }

        // Simula el nodo 'Edit Fields' de n8n para mapear las variables
        const transformedBody = {
            chatInput: body.chatInput,
            model: body.model,
            session_id: body.session_id,
            id_assistant: body.id_assistant || body.assistant_id,
            systemprompt_doc: body.systemprompt_doc,
            systemPrompt: body.systemPrompt,
            history: body.history || [],
            tools: parsedTools,
            meta_id: body.meta_id || null  // 🎯 ID del especialista Meta (si se provee)
        };

        // 👻 LANZAMIENTO DEL TRABAJO DE FONDO: Autonaming del Título ("Fire and Forget")
        // Para meta-assistant usamos meta_id como identificador del especialista
        if (transformedBody.chatInput) {
            const assistantId = provider === 'meta-assistant'
                ? (transformedBody.meta_id || undefined)
                : transformedBody.id_assistant;
            titleGeneratorAutomation.generateTitleAsync(transformedBody.session_id, transformedBody.chatInput, provider, assistantId).catch((e: any) => {
                console.error("[TitleGenerator] Background error:", e);
            });
        }

        let finalDocumentContext = transformedBody.systemprompt_doc || '';

        // ============================================================
        // META SPECIALISTS — Saltar documentService: reciben archivos crudos
        // Los agentes especialistas (invoice_checker, etc.) procesan los
        // buffers binarios directamente (Excel, PDF, imágenes). Si el
        // documentService los intercepta primero, los convierte en texto
        // y los agentes pierden acceso a los archivos originales.
        // ============================================================
        const isMetaSpecialist = provider === 'meta-assistant' && !!transformedBody.meta_id;

        if (!isMetaSpecialist) {
            // 1. Si hay archivos, los procesamos (se extrae transcripción de todos)
            if (files && files.length > 0) {
                console.log(`[WebhookService] Detected ${files.length} BINARY files — routing through documentService`);
                const docResult = await documentService.processDocuments(provider, files, transformedBody);

                if (docResult.status === 'success') {
                    // CONCATENAR: preservar contexto previo y añadir el nuevo
                    // Si el payload no trajo contexto, lo buscamos de la BD para no sobreescribirlo
                    if (!finalDocumentContext) {
                        finalDocumentContext = await getDocumentContext(provider, transformedBody.session_id);
                    }

                    if (finalDocumentContext) {
                        finalDocumentContext = `${finalDocumentContext}\n\n---\n\n[Nueva transcripción de archivos]\n${docResult.transcription}`;
                    } else {
                        finalDocumentContext = docResult.transcription;
                    }

                    // 💾 PERSISTIR en BD (fire-and-forget para no bloquear)
                    saveDocumentContext(provider, transformedBody.session_id, finalDocumentContext).catch((e: any) => {
                        console.error('[WebhookService] Error saving document context:', e.message);
                    });
                } else {
                    return docResult;
                }
            }

            // 2. Si no es documento binario, pero detectamos base64/url en el JSON
            if ((!files || files.length === 0) && this.isDocumentMetadata(transformedBody)) {
                console.log(`[WebhookService] Detected document reference in JSON.`);
            }
        } else {
            console.log(`[WebhookService] ⚡ Meta Specialist mode — skipping documentService, passing raw files to agent.`);
        }

        // 3. Routing
        const startTime = Date.now();
        let result: any;
        try {
            if (provider === 'assistant') {
                if (!transformedBody.model || !transformedBody.systemPrompt) {
                    result = { status: 'error', message: 'Se requiere model y systemPrompt en el payload para usar el sistema de Asistentes.' };
                } else {
                    console.log(`[WebhookService] Routing to ASSISTANT Handler (${transformedBody.model})`);
                    result = await assistantHandlerService.processMessage(
                        transformedBody.session_id, transformedBody.chatInput, transformedBody.systemPrompt,
                        transformedBody.model, transformedBody.history, finalDocumentContext, transformedBody.tools
                    );
                }

            } else if (provider === 'meta-assistant') {
                const metaId = transformedBody.meta_id;

                if (!metaId) {
                    result = { status: 'error', message: 'Se requiere un meta_id válido para acceder a los asistentes especialistas Meta.' };
                } else {
                    console.log(`[WebhookService] Routing to META SPECIALIST: "${metaId}"`);
                    result = await metaHandlerService.processMessage(
                        transformedBody.session_id, transformedBody.chatInput, '',
                        transformedBody.model || 'gemini-2.0-flash', transformedBody.history,
                        finalDocumentContext, transformedBody.tools, metaId, files
                    );
                }
            } else {
                console.log(`[WebhookService] Routing to AI Agent ${finalDocumentContext ? 'WITH' : 'WITHOUT'} context.`);
                result = await chatHandlerService.processMessage(provider, transformedBody, finalDocumentContext);
            }

        // Log successful execution with duration
            executionLoggerService.logExecution(provider, transformedBody, result, 'SUCCESS', Date.now() - startTime);
            return result;

        } catch (error: any) {
            // Log failed execution with error trace
            const errorOutput = { status: 'error', message: error.message || error };
            executionLoggerService.logExecution(provider, transformedBody, errorOutput, 'ERROR', Date.now() - startTime, error);
            throw error;
        }
    }

    private isDocumentMetadata(body: any): boolean {
        // Implementar lógica personalizada si se espera documentos via JSON
        return body && body.type === 'document_reference';
    }
}

export const webhookService = new WebhookService();
