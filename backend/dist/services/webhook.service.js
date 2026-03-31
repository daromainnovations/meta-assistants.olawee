"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookService = exports.WebhookService = exports.WebhookType = void 0;
const chat_handler_service_1 = require("./chat/chat-handler.service");
const document_service_1 = require("./shared/document.service");
const title_generator_automation_1 = require("../automations/title-generator.automation");
const assistant_handler_service_1 = require("./assistants/assistant-handler.service");
const meta_handler_service_1 = require("./meta-assistants/meta-handler.service");
const execution_logger_service_1 = require("../executions/execution-logger.service");
const prisma_service_1 = require("./shared/prisma.service");
var WebhookType;
(function (WebhookType) {
    WebhookType["DOCUMENT"] = "document";
    WebhookType["TEXT"] = "text";
})(WebhookType || (exports.WebhookType = WebhookType = {}));
/**
 * Obtiene el contexto previo guardado en la tabla de la base de datos
 * según el provider y sessionId aportados.
 */
async function getDocumentContext(provider, sessionId) {
    if (!sessionId)
        return '';
    const db = (0, prisma_service_1.getPrisma)();
    try {
        let dbTable;
        if (provider === 'assistant')
            dbTable = db.chats_agentes;
        else if (provider === 'meta-assistant')
            dbTable = db.chatsmeta;
        else
            dbTable = db.chatsllms;
        const existing = await dbTable.findFirst({
            where: { session_id: sessionId },
            orderBy: { created_at: 'desc' }
        });
        return existing?.systemprompt_doc || '';
    }
    catch {
        return '';
    }
}
/**
 * Persiste el systemprompt_doc en la tabla de chats correcta
 * para que esté disponible en futuras peticiones via qa-doc-injector.
 */
async function saveDocumentContext(provider, sessionId, docContext) {
    if (!sessionId || !docContext)
        return;
    const db = (0, prisma_service_1.getPrisma)();
    try {
        let dbTable;
        if (provider === 'assistant')
            dbTable = db.chats_agentes;
        else if (provider === 'meta-assistant')
            dbTable = db.chatsmeta;
        else
            dbTable = db.chatsllms;
        const existing = await dbTable.findFirst({
            where: { session_id: sessionId },
            orderBy: { created_at: 'desc' }
        });
        if (existing) {
            await dbTable.update({
                where: { id: existing.id },
                data: { systemprompt_doc: docContext, updated_at: new Date() }
            });
            console.log(`[WebhookService] 💾 systemprompt_doc updated in DB for session "${sessionId}" [${provider}]`);
        }
        else {
            await dbTable.create({
                data: { session_id: sessionId, systemprompt_doc: docContext, titulo: sessionId }
            });
            console.log(`[WebhookService] 💾 systemprompt_doc created in DB for session "${sessionId}" [${provider}]`);
        }
    }
    catch (err) {
        console.error(`[WebhookService] ❌ Error saving document context: ${err.message}`);
    }
}
class WebhookService {
    /**
     * Procesa la solicitud entrante y determina si es un documento o texto.
     * @param provider El servicio de LLM (ej: 'openai', 'gemini')
     * @param body El cuerpo de la solicitud (JSON o form-data fields)
     * @param files Archivos adjuntos si existen (array via Multer)
     */
    async handleIncomingRequest(provider, body, files) {
        console.log(`[WebhookService] Handling request for ${provider}`);
        let parsedTools = [];
        if (body.tools) {
            try {
                const arr = (typeof body.tools === 'string') ? JSON.parse(body.tools) : body.tools;
                if (Array.isArray(arr))
                    parsedTools = arr.map(Number).filter(n => !isNaN(n));
                else
                    parsedTools = [Number(arr)].filter(n => !isNaN(n));
            }
            catch {
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
            meta_id: body.meta_id || null // 🎯 ID del especialista Meta (si se provee)
        };
        // 👻 LANZAMIENTO DEL TRABAJO DE FONDO: Autonaming del Título ("Fire and Forget")
        // Para meta-assistant usamos meta_id como identificador del especialista
        if (transformedBody.chatInput) {
            const assistantId = provider === 'meta-assistant'
                ? (transformedBody.meta_id || undefined)
                : transformedBody.id_assistant;
            title_generator_automation_1.titleGeneratorAutomation.generateTitleAsync(transformedBody.session_id, transformedBody.chatInput, provider, assistantId).catch((e) => {
                console.error("[TitleGenerator] Background error:", e);
            });
        }
        let finalDocumentContext = transformedBody.systemprompt_doc || '';
        // ============================================================
        // MEMORY RAG: Unified Document Processing
        // ============================================================
        if (!finalDocumentContext) {
            // Load previous context from DB explicitly if not provided
            finalDocumentContext = await getDocumentContext(provider, transformedBody.session_id);
        }
        if (files && files.length > 0) {
            console.log(`[WebhookService] Detected ${files.length} BINARY files — routing through documentService`);
            const docResult = await document_service_1.documentService.processDocuments(provider, files, transformedBody);
            if (docResult.status === 'success') {
                if (finalDocumentContext) {
                    finalDocumentContext = `${finalDocumentContext}\n\n---\n\n[Nueva transcripción de archivos]\n${docResult.transcription}`;
                }
                else {
                    finalDocumentContext = docResult.transcription;
                }
                // 💾 PERSISTIR en BD (fire-and-forget para no bloquear)
                saveDocumentContext(provider, transformedBody.session_id, finalDocumentContext).catch((e) => {
                    console.error('[WebhookService] Error saving document context:', e.message);
                });
            }
            else {
                return docResult;
            }
        }
        // 3. Routing
        const startTime = Date.now();
        let result;
        try {
            if (provider === 'assistant') {
                if (!transformedBody.model || !transformedBody.systemPrompt) {
                    result = { status: 'error', message: 'Se requiere model y systemPrompt en el payload para usar el sistema de Asistentes.' };
                }
                else {
                    console.log(`[WebhookService] Routing to ASSISTANT Handler (${transformedBody.model})`);
                    result = await assistant_handler_service_1.assistantHandlerService.processMessage(transformedBody.session_id, transformedBody.chatInput, transformedBody.systemPrompt, transformedBody.model, transformedBody.history, finalDocumentContext, transformedBody.tools);
                }
            }
            else if (provider === 'meta-assistant') {
                const metaId = transformedBody.meta_id;
                if (!metaId) {
                    result = { status: 'error', message: 'Se requiere un meta_id válido para acceder a los asistentes especialistas Meta.' };
                }
                else {
                    console.log(`[WebhookService] Routing to META SPECIALIST: "${metaId}"`);
                    result = await meta_handler_service_1.metaHandlerService.processMessage(transformedBody.session_id, transformedBody.chatInput, '', transformedBody.model || 'gemini-2.0-flash', transformedBody.history, finalDocumentContext, transformedBody.tools, metaId, files);
                }
            }
            else {
                console.log(`[WebhookService] Routing to AI Agent ${finalDocumentContext ? 'WITH' : 'WITHOUT'} context.`);
                result = await chat_handler_service_1.chatHandlerService.processMessage(provider, transformedBody, finalDocumentContext);
            }
            // Log successful execution with duration
            execution_logger_service_1.executionLoggerService.logExecution(provider, transformedBody, result, 'SUCCESS', Date.now() - startTime);
            return result;
        }
        catch (error) {
            // Log failed execution with error trace
            const errorOutput = { status: 'error', message: error.message || error };
            execution_logger_service_1.executionLoggerService.logExecution(provider, transformedBody, errorOutput, 'ERROR', Date.now() - startTime, error);
            throw error;
        }
    }
    isDocumentMetadata(body) {
        // Implementar lógica personalizada si se espera documentos via JSON
        return body && body.type === 'document_reference';
    }
}
exports.WebhookService = WebhookService;
exports.webhookService = new WebhookService();
