"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assistantMemoryService = exports.AssistantMemoryService = void 0;
const messages_1 = require("@langchain/core/messages");
const prisma_service_1 = require("../shared/prisma.service");
class AssistantMemoryService {
    /**
     * Recupera el historial de chat para una sesión atada a un asistente.
     * En este caso usamos el mismo session_id genérico,
     * pero la lógica aisla la memoria por sesión en la tabla separada.
     */
    async getAssistantChatHistory(sessionId) {
        const db = (0, prisma_service_1.getPrisma)();
        console.log(`[AssistantMemory] Loading chat history for session: ${sessionId}`);
        try {
            const mensajes = await db.mensajes_agentes.findMany({
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
            console.log(`[AssistantMemory] Loaded ${langChainMessages.length} previous messages for assistant context.`);
            return langChainMessages;
        }
        catch (error) {
            console.error(`[AssistantMemory] Error fetching history for session ${sessionId}:`, error);
            return [];
        }
    }
    /**
     * Lee el systemprompt_doc guardado para esta sesión desde chats_agentes
     */
    async getDocumentContext(sessionId) {
        const db = (0, prisma_service_1.getPrisma)();
        try {
            const row = await db.chats_agentes.findFirst({ where: { session_id: sessionId } });
            return row?.systemprompt_doc || '';
        }
        catch (error) {
            console.error(`[AssistantMemory] Error fetching document context for ${sessionId}:`, error);
            return '';
        }
    }
    /**
     * Guarda un nuevo mensaje de asistente en PostgreSQL
     */
    async saveMessage(sessionId, type, content) {
        const db = (0, prisma_service_1.getPrisma)();
        try {
            const messageJson = {
                type: type,
                content: content,
                timestamp: new Date().toISOString()
            };
            await db.mensajes_agentes.create({
                data: {
                    session_id: sessionId,
                    message: messageJson
                }
            });
            console.log(`[AssistantMemory] Message (${type}) saved successfully to DB for Assistant Session.`);
        }
        catch (error) {
            console.error(`[AssistantMemory] Error saving ${type} message for session ${sessionId}:`, error);
        }
    }
}
exports.AssistantMemoryService = AssistantMemoryService;
exports.assistantMemoryService = new AssistantMemoryService();
