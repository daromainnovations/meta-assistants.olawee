import prisma from '../models/prisma';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

export class TitleGeneratorAutomation {
    /**
     * Tarea en segundo plano ("Fire and Forget") que genera un título
     * para la conversación si aún no lo tiene.
     * Exclusivo para Meta-Asistentes.
     */
    async generateTitleAsync(sessionId: string, firstMessage: string, provider: string, metaId?: string) {
        if (!sessionId || !firstMessage || firstMessage.trim() === '' || provider !== 'meta-assistant') return;

        try {
            const db = prisma;
            const dbTable = db.chatsmeta;

            // 1. Buscar la sesión en base de datos
            const chatRow = await dbTable.findFirst({
                where: { session_id: sessionId }
            });

            // Si ya tiene título generado, no hacemos nada
            if (chatRow && chatRow.titulo && chatRow.titulo !== sessionId && chatRow.titulo.trim() !== '') {
                console.log(`[TitleGeneratorJob] 💤 Session '${sessionId}' already has title: "${chatRow.titulo}". Skipping.`);
                return;
            }

            console.log(`[TitleGeneratorJob] 🚀 Generating title for session '${sessionId}' [meta-assistant]...`);

            // 2. Modelo rápido para generar el título
            const model = new ChatGoogleGenerativeAI({
                apiKey: process.env.GEMINI_API_KEY,
                model: 'gemini-2.0-flash',
                temperature: 0.3,
            });

            const messages = [
                new SystemMessage("Eres un experto catalogador. Tu única tarea es generar un título MUY CORTO (máximo 4 palabras) que resuma el tema principal del mensaje del usuario. NUNCA respondas a su pregunta, SOLAMENTE devuelve las 4 palabras del título, sin comillas, markdown ni puntos finales. Ejemplos de buenas respuestas: 'Ayuda con React', 'Receta de Cocina', 'Consulta de Pedido', 'Búsqueda en Wikipedia'."),
                new HumanMessage(firstMessage)
            ];

            const response = await model.invoke(messages);
            let newTitle = (response.content as string).replace(/["'\n*#]/g, '').trim();

            console.log(`[TitleGeneratorJob] ✨ Auto-title: "${newTitle}" [meta-assistant]`);

            const latestChatRow = await dbTable.findFirst({
                where: { session_id: sessionId }
            });

            // 3. Crear o actualizar el registro
            if (latestChatRow) {
                await dbTable.update({ 
                    where: { id: latestChatRow.id }, 
                    data: { titulo: newTitle, meta_id: metaId, updated_at: new Date() } 
                });
            } else {
                await dbTable.create({
                    data: {
                        session_id: sessionId,
                        titulo: newTitle,
                        meta_id: metaId,
                        systemprompt_doc: ''
                    }
                });
            }

            console.log(`[TitleGeneratorJob] ✅ Title saved for session '${sessionId}' [meta-assistant].`);

        } catch (error: any) {
            console.error(`[TitleGeneratorJob] ⚠️ Error generating title: ${error.message}`);
        }
    }
}

export const titleGeneratorAutomation = new TitleGeneratorAutomation();
