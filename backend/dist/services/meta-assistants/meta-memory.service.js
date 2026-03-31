"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metaMemoryService = exports.MetaMemoryService = void 0;
const messages_1 = require("@langchain/core/messages");
const prisma_service_1 = require("../shared/prisma.service");
/**
 * ============================================================
 * 🧪 META MEMORY SERVICE
 * Gestiona el historial de conversaciones del modo Meta
 * Tablas: chatsmeta / mensajesmeta
 * ============================================================
 */
class MetaMemoryService {
    /**
     * Recupera el historial de chat de una sesión Meta desde la BD
     */
    async getMetaChatHistory(sessionId) {
        const db = (0, prisma_service_1.getPrisma)();
        console.log(`[MetaMemory] Loading chat history for session: ${sessionId}`);
        try {
            const mensajes = await db.mensajesmeta.findMany({
                where: { session_id: sessionId },
                orderBy: { id: 'asc' }
            });
            const langChainMessages = [];
            for (const msg of mensajes) {
                if (!msg.message)
                    continue;
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
            console.log(`[MetaMemory] Loaded ${langChainMessages.length} messages for session.`);
            return langChainMessages;
        }
        catch (error) {
            console.error(`[MetaMemory] Error fetching history for session ${sessionId}:`, error);
            return [];
        }
    }
    /**
     * Lee el systemprompt_doc guardado para esta sesión desde chatsmeta
     */
    async getDocumentContext(sessionId) {
        const db = (0, prisma_service_1.getPrisma)();
        try {
            const row = await db.chatsmeta.findFirst({
                where: { session_id: sessionId },
                orderBy: { created_at: 'desc' }
            });
            return row?.systemprompt_doc || '';
        }
        catch (error) {
            console.error(`[MetaMemory] Error fetching document context for ${sessionId}:`, error);
            return '';
        }
    }
    /**
     * Guarda un mensaje de la conversación Meta en la BD
     */
    async saveMessage(sessionId, type, content) {
        const db = (0, prisma_service_1.getPrisma)();
        try {
            await db.mensajesmeta.create({
                data: {
                    session_id: sessionId,
                    message: {
                        type,
                        content,
                        timestamp: new Date().toISOString()
                    }
                }
            });
            console.log(`[MetaMemory] Message (${type}) saved for session: ${sessionId}`);
        }
        catch (error) {
            console.error(`[MetaMemory] Error saving ${type} message for session ${sessionId}:`, error);
        }
    }
}
exports.MetaMemoryService = MetaMemoryService;
exports.metaMemoryService = new MetaMemoryService();
