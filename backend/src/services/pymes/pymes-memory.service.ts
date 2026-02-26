import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { getPrisma } from '../shared/prisma.service';

/**
 * ============================================================
 * 🏢 PYMES MEMORY SERVICE
 * Gestiona el historial de conversaciones del modo Pymes
 * Tablas: prueba_chatspymes / prueba_mensajespymes
 * ============================================================
 */
export class PymesMemoryService {

    /**
     * Recupera el historial de chat de una sesión Pymes desde la BD
     */
    async getPymesChatHistory(sessionId: string): Promise<BaseMessage[]> {
        const db = getPrisma();
        console.log(`[PymesMemory] Loading chat history for session: ${sessionId}`);

        try {
            const mensajes = await db.prueba_mensajespymes.findMany({
                where: { session_id: sessionId },
                orderBy: { id: 'asc' }
            });

            const langChainMessages: BaseMessage[] = [];

            for (const msg of mensajes) {
                if (!msg.message) continue;
                const payload = msg.message as { type?: string; content?: string };

                if (payload.type === 'human' && payload.content) {
                    langChainMessages.push(new HumanMessage(payload.content));
                } else if (payload.type === 'ai' && payload.content) {
                    langChainMessages.push(new AIMessage(payload.content));
                } else if (payload.type === 'system' && payload.content) {
                    langChainMessages.push(new SystemMessage(payload.content));
                }
            }

            console.log(`[PymesMemory] Loaded ${langChainMessages.length} messages for session.`);
            return langChainMessages;

        } catch (error) {
            console.error(`[PymesMemory] Error fetching history for session ${sessionId}:`, error);
            return [];
        }
    }

    /**
     * Lee el systemprompt_doc guardado para esta sesión desde prueba_chatspymes
     */
    async getDocumentContext(sessionId: string): Promise<string> {
        const db = getPrisma();
        try {
            const row = await db.prueba_chatspymes.findFirst({ where: { session_id: sessionId } });
            return row?.systemprompt_doc || '';
        } catch (error) {
            console.error(`[PymesMemory] Error fetching document context for ${sessionId}:`, error);
            return '';
        }
    }

    /**
     * Guarda un mensaje de la conversación Pymes en la BD
     */
    async saveMessage(sessionId: string, type: 'human' | 'ai' | 'system', content: string) {
        const db = getPrisma();

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
        } catch (error) {
            console.error(`[PymesMemory] Error saving ${type} message for session ${sessionId}:`, error);
        }
    }
}

export const pymesMemoryService = new PymesMemoryService();
