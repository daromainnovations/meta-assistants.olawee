"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryService = exports.MemoryService = void 0;
const prisma_service_1 = require("../shared/prisma.service");
const messages_1 = require("@langchain/core/messages");
class MemoryService {
    /**
     * Recupera el historial de chat para una sesión desde PostgreSQL
     * convirtiéndolo a mensajes de LangChain
     */
    async getChatHistory(sessionId) {
        const db = (0, prisma_service_1.getPrisma)();
        console.log(`[MemoryService] Loading chat history for: ${sessionId}`);
        try {
            const mensajes = await db.prueba_mensajesllms.findMany({
                where: { session_id: sessionId },
                orderBy: { id: 'asc' }
            });
            const langChainMessages = [];
            for (const msg of mensajes) {
                if (!msg.message)
                    continue;
                // Extraer el contenido de la columna JSONB
                const payload = msg.message;
                if (payload.type === 'human' && payload.content) {
                    langChainMessages.push(new messages_1.HumanMessage(payload.content));
                }
                else if (payload.type === 'ai' && payload.content) {
                    langChainMessages.push(new messages_1.AIMessage(payload.content));
                }
                else if (payload.type === 'system' && payload.content) {
                    langChainMessages.push(new messages_1.SystemMessage(payload.content));
                }
            }
            console.log(`[MemoryService] Loaded ${langChainMessages.length} previous messages for context.`);
            return langChainMessages;
        }
        catch (error) {
            console.error(`[MemoryService] Error fetching history for ${sessionId}:`, error);
            return []; // Retorna historial vacío en caso de error para no quebrar el flujo
        }
    }
    /**
     * Recupera el documento/texto preprocesado desde la tabla de documentos
     */
    async getDocumentContext(sessionId) {
        const db = (0, prisma_service_1.getPrisma)();
        try {
            const doc = await db.prueba_chatsllms.findFirst({
                where: { session_id: sessionId }
            });
            return doc?.systemprompt_doc || '';
        }
        catch (error) {
            console.error(`[MemoryService] Error fetching document context for ${sessionId}:`, error);
            return '';
        }
    }
    /**
     * Guarda un nuevo mensaje (Humano o AI) en PostgreSQL
     */
    async saveMessage(sessionId, type, content) {
        const db = (0, prisma_service_1.getPrisma)();
        try {
            const messageJson = {
                type: type,
                content: content,
                timestamp: new Date().toISOString()
            };
            await db.prueba_mensajesllms.create({
                data: {
                    session_id: sessionId,
                    message: messageJson
                }
            });
            console.log(`[MemoryService] Message (${type}) saved successfully to DB.`);
        }
        catch (error) {
            console.error(`[MemoryService] Error saving ${type} message for ${sessionId}:`, error);
        }
    }
}
exports.MemoryService = MemoryService;
exports.memoryService = new MemoryService();
