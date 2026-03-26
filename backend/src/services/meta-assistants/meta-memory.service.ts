import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { getPrisma } from '../shared/prisma.service';

/**
 * ============================================================
 * 🧪 META MEMORY SERVICE
 * Gestiona el historial de conversaciones del modo Meta
 * Tablas: chatsmeta / mensajesmeta
 * ============================================================
 */
export class MetaMemoryService {

    /**
     * Recupera el historial de chat de una sesión Meta desde la BD
     */
    async getMetaChatHistory(sessionId: string): Promise<BaseMessage[]> {
        const db = getPrisma();
        console.log(`[MetaMemory] Loading chat history for session: ${sessionId}`);

        try {
            const mensajes = await db.mensajesmeta.findMany({
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

            console.log(`[MetaMemory] Loaded ${langChainMessages.length} messages for session.`);
            return langChainMessages;

        } catch (error) {
            console.error(`[MetaMemory] Error fetching history for session ${sessionId}:`, error);
            return [];
        }
    }

    /**
     * Lee el systemprompt_doc guardado para esta sesión desde chatsmeta
     */
    async getDocumentContext(sessionId: string): Promise<string> {
        const db = getPrisma();
        try {
            const row = await db.chatsmeta.findFirst({ where: { session_id: sessionId } });
            return row?.systemprompt_doc || '';
        } catch (error) {
            console.error(`[MetaMemory] Error fetching document context for ${sessionId}:`, error);
            return '';
        }
    }

    /**
     * Guarda un mensaje de la conversación Meta en la BD
     */
    async saveMessage(sessionId: string, type: 'human' | 'ai' | 'system', content: string) {
        const db = getPrisma();

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
        } catch (error) {
            console.error(`[MetaMemory] Error saving ${type} message for session ${sessionId}:`, error);
        }
    }
}

export const metaMemoryService = new MetaMemoryService();
