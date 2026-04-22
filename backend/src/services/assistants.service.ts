import { documentService, GenericFile } from './shared/document.service';
import { titleGeneratorAutomation } from '../automations/title-generator.automation';
import { metaHandlerService } from './meta-assistants/meta-handler.service';
import { executionLoggerService } from '../executions/execution-logger.service';
import prisma from '../models/prisma';

/**
 * Obtiene el contexto previo guardado en la tabla de la base de datos
 * según el provider (meta-assistant) y sessionId aportados.
 */
async function getDocumentContext(sessionId: string): Promise<string> {
    if (!sessionId) return '';
    const db = prisma;
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
    const db = prisma;
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
            console.log(`[AssistantsService] 💾 systemprompt_doc updated in DB for session "${sessionId}"`);
        } else {
            await db.chatsmeta.create({
                data: { session_id: sessionId, systemprompt_doc: docContext, titulo: sessionId }
            });
            console.log(`[AssistantsService] 💾 systemprompt_doc created in DB for session "${sessionId}"`);
        }
    } catch (err: any) {
        console.error(`[AssistantsService] ❌ Error saving document context: ${err.message}`);
    }
}


export class AssistantsService {

    /**
     * Procesa la ejecución de un Meta-Asistente.
     * @param metaId El ID del especialista Meta
     * @param body El cuerpo de la solicitud (JSON o form-data fields)
     * @param files Archivos adjuntos si existen
     */
    async executeAssistant(metaId: string, body: any, files?: GenericFile[]): Promise<any> {
        console.log(`[AssistantsService] 🚀 Executing Assistant: ${metaId}`);

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
            chatInput: body.chatInput || body.message || body.query || '',
            model: body.model || 'gemini-2.0-flash',
            session_id: body.session_id || body.sessionId || body.idUserChat || `session_${Date.now()}`,
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
            console.log(`[AssistantsService] Detected ${files.length} binary files — processing via documentService`);
            const docResult = await documentService.processDocuments('meta-assistant', files, transformedBody);

            if (docResult.status === 'success') {
                if (finalDocumentContext) {
                    finalDocumentContext = `${finalDocumentContext}\n\n---\n\n[Nueva transcripción de archivos]\n${docResult.transcription}`;
                } else {
                    finalDocumentContext = docResult.transcription;
                }

                saveDocumentContext(transformedBody.session_id, finalDocumentContext).catch((e: any) => {
                    console.error('[AssistantsService] Error saving document context:', e.message);
                });
            } else {
                return docResult;
            }
        }

        // Routing exclusively to Meta Handler
        const startTime = Date.now();
        let result: any;
        try {
            console.log(`[AssistantsService] Routing to Specialist Engine: "${metaId}"`);
            result = await metaHandlerService.processMessage(
                transformedBody.session_id, transformedBody.chatInput, '',
                transformedBody.model, transformedBody.history,
                finalDocumentContext, transformedBody.tools, metaId, files
            );

            let loggableResult = result;
            if (result instanceof ReadableStream) {
                loggableResult = { status: 'success', message: 'ReadableStream SSE Active' };
            }
            executionLoggerService.logExecution(`assistants:${metaId}`, transformedBody, loggableResult, 'SUCCESS', Date.now() - startTime);
            return result;

        } catch (error: any) {
            const errorOutput = { status: 'error', message: error.message || error };
            executionLoggerService.logExecution(`assistants:${metaId}`, transformedBody, errorOutput, 'ERROR', Date.now() - startTime, error);
            throw error;
        }
    }
}

export const assistantsService = new AssistantsService();
