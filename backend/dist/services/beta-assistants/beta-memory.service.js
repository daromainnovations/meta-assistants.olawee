"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.betaMemoryService = exports.BetaMemoryService = void 0;
const messages_1 = require("@langchain/core/messages");
const prisma_service_1 = require("../shared/prisma.service");
/**
 * ============================================================
 * 🧪 BETA MEMORY SERVICE
 * Gestiona el historial de conversaciones del modo Beta
 * Tablas: prueba_chatsbeta / prueba_mensajesbeta
 * ============================================================
 */
class BetaMemoryService {
    /**
     * Recupera el historial de chat de una sesión Beta desde la BD
     */
    async getBetaChatHistory(sessionId) {
        const db = (0, prisma_service_1.getPrisma)();
        console.log(`[BetaMemory] Loading chat history for session: ${sessionId}`);
        try {
            const mensajes = await db.prueba_mensajesbeta.findMany({
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
            console.log(`[BetaMemory] Loaded ${langChainMessages.length} messages for session.`);
            return langChainMessages;
        }
        catch (error) {
            console.error(`[BetaMemory] Error fetching history for session ${sessionId}:`, error);
            return [];
        }
    }
    /**
     * Lee el systemprompt_doc guardado para esta sesión desde prueba_chatsbeta
     */
    async getDocumentContext(sessionId) {
        const db = (0, prisma_service_1.getPrisma)();
        try {
            const row = await db.prueba_chatsbeta.findFirst({ where: { session_id: sessionId } });
            return row?.systemprompt_doc || '';
        }
        catch (error) {
            console.error(`[BetaMemory] Error fetching document context for ${sessionId}:`, error);
            return '';
        }
    }
    /**
     * Guarda un mensaje de la conversación Beta en la BD
     */
    async saveMessage(sessionId, type, content) {
        const db = (0, prisma_service_1.getPrisma)();
        try {
            await db.prueba_mensajesbeta.create({
                data: {
                    session_id: sessionId,
                    message: {
                        type,
                        content,
                        timestamp: new Date().toISOString()
                    }
                }
            });
            console.log(`[BetaMemory] Message (${type}) saved for session: ${sessionId}`);
        }
        catch (error) {
            console.error(`[BetaMemory] Error saving ${type} message for session ${sessionId}:`, error);
        }
    }
}
exports.BetaMemoryService = BetaMemoryService;
exports.betaMemoryService = new BetaMemoryService();
