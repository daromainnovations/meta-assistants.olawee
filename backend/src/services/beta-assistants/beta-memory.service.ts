import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { getPrisma } from '../shared/prisma.service';

/**
 * ============================================================
 * 🧪 BETA MEMORY SERVICE
 * Gestiona el historial de conversaciones del modo Beta
 * Tablas: prueba_chatsbeta / prueba_mensajesbeta
 * ============================================================
 */
export class BetaMemoryService {

    /**
     * Recupera el historial de chat de una sesión Beta desde la BD
     */
    async getBetaChatHistory(sessionId: string): Promise<BaseMessage[]> {
        const db = getPrisma();
        console.log(`[BetaMemory] Loading chat history for session: ${sessionId}`);

        try {
            const mensajes = await db.prueba_mensajesbeta.findMany({
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

            console.log(`[BetaMemory] Loaded ${langChainMessages.length} messages for session.`);
            return langChainMessages;

        } catch (error) {
            console.error(`[BetaMemory] Error fetching history for session ${sessionId}:`, error);
            return [];
        }
    }

    /**
     * Lee el systemprompt_doc guardado para esta sesión desde prueba_chatsbeta
     */
    async getDocumentContext(sessionId: string): Promise<string> {
        const db = getPrisma();
        try {
            const row = await db.prueba_chatsbeta.findFirst({ where: { session_id: sessionId } });
            return row?.systemprompt_doc || '';
        } catch (error) {
            console.error(`[BetaMemory] Error fetching document context for ${sessionId}:`, error);
            return '';
        }
    }

    /**
     * Guarda un mensaje de la conversación Beta en la BD
     */
    async saveMessage(sessionId: string, type: 'human' | 'ai' | 'system', content: string) {
        const db = getPrisma();

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
        } catch (error) {
            console.error(`[BetaMemory] Error saving ${type} message for session ${sessionId}:`, error);
        }
    }
}

export const betaMemoryService = new BetaMemoryService();
