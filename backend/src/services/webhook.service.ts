import { documentService } from './shared/document.service';
import { titleGeneratorAutomation } from '../automations/title-generator.automation';
import { metaHandlerService } from './meta-assistants/meta-handler.service';
import { executionLoggerService } from '../executions/execution-logger.service';
import { getPrisma } from './shared/prisma.service';

export enum WebhookType {
    DOCUMENT = 'document',
    TEXT = 'text'
}

/**
 * Obtiene el contexto previo guardado en la tabla de la base de datos
 * según el provider (meta-assistant) y sessionId aportados.
 */
async function getDocumentContext(sessionId: string): Promise<string> {
    if (!sessionId) return '';
    const db = getPrisma();
    try {
        const existing = await db.chatsmeta.findFirst({ 
            where: { session_id: sessionId },
            orderBy: { created_at: 'desc' }
        });
        return existing?.systemprompt_doc || '';
    } catch {
        return '';
    }
}

/**
 * Persiste el systemprompt_doc en la tabla de chatsmeta
 * para que esté disponible en futuras peticiones.
 */
async function saveDocumentContext(sessionId: string, docContext: string): Promise<void> {
    if (!sessionId || !docContext) return;
    const db = getPrisma();
    try {
        const existing = await db.chatsmeta.findFirst({ 
            where: { session_id: sessionId },
            orderBy: { created_at: 'desc' }
        });
        if (existing) {
            await db.chatsmeta.update({
                where: { id: existing.id },
                data: { systemprompt_doc: docContext, updated_at: new Date() }
            });
            console.log(`[WebhookService] 💾 systemprompt_doc updated in DB for session "${sessionId}" [meta-assistant]`);
        } else {
            await db.chatsmeta.create({
                data: { session_id: sessionId, systemprompt_doc: docContext, titulo: sessionId }
            });
            console.log(`[WebhookService] 💾 systemprompt_doc created in DB for session "${sessionId}" [meta-assistant]`);
        }
    } catch (err: any) {
        console.error(`[WebhookService] ❌ Error saving document context: ${err.message}`);
    }
}


export class WebhookService {

    /**
     * Procesa la solicitud entrante exclusivamente para Meta-Asistentes.
     * @param metaId El ID del especialista Meta
     * @param body El cuerpo de la solicitud (JSON o form-data fields)
     * @param files Archivos adjuntos si existen (array via Multer)
     */
    async handleIncomingRequest(metaId: string, body: any, files?: Express.Multer.File[]): Promise<any> {
        console.log(`[WebhookService] Handling request for Meta Specialist: ${metaId}`);

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

        const transformedBody = {
            chatInput: body.chatInput,
            model: body.model || 'gemini-2.0-flash',
            session_id: body.session_id,
            systemprompt_doc: body.systemprompt_doc,
            systemPrompt: body.systemPrompt,
            history: body.history || [],
            tools: parsedTools,
            meta_id: metaId
        };

        // 👻 Autonaming del Título
        if (transformedBody.chatInput) {
            titleGeneratorAutomation.generateTitleAsync(transformedBody.session_id, transformedBody.chatInput, 'meta-assistant', metaId).catch((e: any) => {
                console.error("[TitleGenerator] Background error:", e);
            });
        }

        let finalDocumentContext = transformedBody.systemprompt_doc || '';

        // MEMORY RAG: Meta Document Processing
        if (!finalDocumentContext) {
            finalDocumentContext = await getDocumentContext(transformedBody.session_id);
        }

        if (files && files.length > 0) {
            console.log(`[WebhookService] Detected ${files.length} BINARY files — routing through documentService`);
            const docResult = await documentService.processDocuments('meta-assistant', files, transformedBody);

            if (docResult.status === 'success') {
                if (finalDocumentContext) {
                    finalDocumentContext = `${finalDocumentContext}\n\n---\n\n[Nueva transcripción de archivos]\n${docResult.transcription}`;
                } else {
                    finalDocumentContext = docResult.transcription;
                }

                saveDocumentContext(transformedBody.session_id, finalDocumentContext).catch((e: any) => {
                    console.error('[WebhookService] Error saving document context:', e.message);
                });
            } else {
                return docResult;
            }
        }

        // Routing exclusively to Meta Handler
        const startTime = Date.now();
        let result: any;
        try {
            console.log(`[WebhookService] Routing to META SPECIALIST: "${metaId}"`);
            result = await metaHandlerService.processMessage(
                transformedBody.session_id, transformedBody.chatInput, '',
                transformedBody.model, transformedBody.history,
                finalDocumentContext, transformedBody.tools, metaId, files
            );

            executionLoggerService.logExecution(`meta:${metaId}`, transformedBody, result, 'SUCCESS', Date.now() - startTime);
            return result;

        } catch (error: any) {
            const errorOutput = { status: 'error', message: error.message || error };
            executionLoggerService.logExecution(`meta:${metaId}`, transformedBody, errorOutput, 'ERROR', Date.now() - startTime, error);
            throw error;
        }
    }
}

export const webhookService = new WebhookService();
