"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pymesMemoryService = exports.PymesMemoryService = void 0;
const messages_1 = require("@langchain/core/messages");
const prisma_service_1 = require("../shared/prisma.service");
/**
 * ============================================================
 * 🏢 PYMES MEMORY SERVICE
 * Gestiona el historial de conversaciones del modo Pymes
 * Tablas: prueba_chatspymes / prueba_mensajespymes
 * ============================================================
 */
class PymesMemoryService {
    /**
     * Recupera el historial de chat de una sesión Pymes desde la BD
     */
    async getPymesChatHistory(sessionId) {
        const db = (0, prisma_service_1.getPrisma)();
        console.log(`[PymesMemory] Loading chat history for session: ${sessionId}`);
        try {
            const mensajes = await db.prueba_mensajespymes.findMany({
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
            console.log(`[PymesMemory] Loaded ${langChainMessages.length} messages for session.`);
            return langChainMessages;
        }
        catch (error) {
            console.error(`[PymesMemory] Error fetching history for session ${sessionId}:`, error);
            return [];
        }
    }
    /**
     * Lee el systemprompt_doc guardado para esta sesión desde prueba_chatspymes
     */
    async getDocumentContext(sessionId) {
        const db = (0, prisma_service_1.getPrisma)();
        try {
            const row = await db.prueba_chatspymes.findFirst({ where: { session_id: sessionId } });
            return row?.systemprompt_doc || '';
        }
        catch (error) {
            console.error(`[PymesMemory] Error fetching document context for ${sessionId}:`, error);
            return '';
        }
    }
    /**
     * Guarda un mensaje de la conversación Pymes en la BD
     */
    async saveMessage(sessionId, type, content) {
        const db = (0, prisma_service_1.getPrisma)();
        try {
            await db.prueba_mensajespymes.create({
                data: {
                    session_id: sessionId,
                    message: {
                        type,
                        content,
                        timestamp: new Date().toISOString()
                    }
                }
            });
            console.log(`[PymesMemory] Message (${type}) saved for session: ${sessionId}`);
        }
        catch (error) {
            console.error(`[PymesMemory] Error saving ${type} message for session ${sessionId}:`, error);
        }
    }
}
exports.PymesMemoryService = PymesMemoryService;
exports.pymesMemoryService = new PymesMemoryService();
