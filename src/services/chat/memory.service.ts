import { getPrisma } from '../shared/prisma.service';
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";

export class MemoryService {

    /**
     * Recupera el historial de chat para una sesión desde PostgreSQL
     * convirtiéndolo a mensajes de LangChain
     */
    async getChatHistory(idUserChat: string): Promise<BaseMessage[]> {
        const db = getPrisma();
        console.log(`[MemoryService] Loading chat history for: ${idUserChat}`);

        try {
            const mensajes = await db.prueba_mensajesllms.findMany({
                where: { session_id: idUserChat },
                orderBy: { id: 'asc' }
            });

            const langChainMessages: BaseMessage[] = [];

            for (const msg of mensajes) {
                if (!msg.message) continue;

                // Extraer el contenido de la columna JSONB
                const payload = msg.message as { type?: string; content?: string, systemContext?: string };

                if (payload.type === 'human' && payload.content) {
                    langChainMessages.push(new HumanMessage(payload.content));
                } else if (payload.type === 'ai' && payload.content) {
                    langChainMessages.push(new AIMessage(payload.content));
                } else if (payload.type === 'system' && payload.content) {
                    langChainMessages.push(new SystemMessage(payload.content));
                }
            }

            console.log(`[MemoryService] Loaded ${langChainMessages.length} previous messages for context.`);
            return langChainMessages;

        } catch (error) {
            console.error(`[MemoryService] Error fetching history for ${idUserChat}:`, error);
            return []; // Retorna historial vacío en caso de error para no quebrar el flujo
        }
    }

    /**
     * Recupera el documento/texto preprocesado desde la tabla de documentos
     */
    async getDocumentContext(idUserChat: string): Promise<string> {
        const db = getPrisma();
        try {
            const doc = await db.prueba_chatsllms.findFirst({
                where: { id_user_chat: idUserChat }
            });
            return doc?.systemprompt_doc || '';
        } catch (error) {
            console.error(`[MemoryService] Error fetching document context for ${idUserChat}:`, error);
            return '';
        }
    }

    /**
     * Guarda un nuevo mensaje (Humano o AI) en PostgreSQL
     */
    async saveMessage(idUserChat: string, type: 'human' | 'ai' | 'system', content: string) {
        const db = getPrisma();

        try {
            const messageJson = {
                type: type,
                content: content,
                timestamp: new Date().toISOString()
            };

            await db.prueba_mensajesllms.create({
                data: {
                    session_id: idUserChat,
                    message: messageJson
                }
            });

            console.log(`[MemoryService] Message (${type}) saved successfully to DB.`);
        } catch (error) {
            console.error(`[MemoryService] Error saving ${type} message for ${idUserChat}:`, error);
        }
    }
}

export const memoryService = new MemoryService();
