import { getPrisma } from '../services/shared/prisma.service';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

export class TitleGeneratorAutomation {
    /**
     * Tarea en segundo plano ("Fire and Forget") que genera un título 
     * para la conversación si aún no lo tiene. Se independiza del flujo principal.
     */
    async generateTitleAsync(idUserChat: string, firstMessage: string, provider: string, idAssistant?: string) {
        if (!idUserChat || !firstMessage || firstMessage.trim() === '') return;

        try {
            const db = getPrisma();
            const isAssistant = provider === 'assistant' || provider === 'pymes-assistant';
            const dbTable = isAssistant ? db.prueba_chatsassistants : db.prueba_chatsllms;

            // 1. Buscar la sesión en base de datos
            const chatRow = await (dbTable as any).findFirst({
                where: { id_user_chat: idUserChat }
            });

            // Si ya existe la fila y su título no es igual al id (que es el fallback default)
            // y tampoco está vacío, significa que ya le generamos un título antes.
            if (chatRow && chatRow.titulo && chatRow.titulo !== idUserChat && chatRow.titulo.trim() !== '') {
                // Ya tiene un título custom generado, el job se "suicida" silenciosamente :)
                console.log(`[TitleGeneratorJob] 💤 Session '${idUserChat}' already has a title: "${chatRow.titulo}". Skipping.`);
                return;
            }

            console.log(`[TitleGeneratorJob] 🚀 Generating new title for session '${idUserChat}' in background...`);

            // 2. Instanciar un modelo ultra rápido y barato (Gemini 2.0 Flash) independientemente de qué modelo use el usuario.
            const model = new ChatGoogleGenerativeAI({
                apiKey: process.env.GEMINI_API_KEY,
                model: 'gemini-2.0-flash',
                temperature: 0.3, // Temperatura baja para que sea conciso y directo, sin ponerse creativo
            });

            const messages = [
                new SystemMessage("Eres un experto catalogador. Tu única tarea es generar un título MUY CORTO (máximo 4 palabras) que resuma el tema principal del mensaje del usuario. NUNCA respondas a su pregunta, SOLAMENTE devuelve las 4 palabras del título, sin comillas, markdown ni puntos finales. Ejemplos de buenas respuestas: 'Ayuda con React', 'Receta de Cocina', 'Consulta de Pedido', 'Búsqueda en Wikipedia'."),
                new HumanMessage(firstMessage)
            ];

            // 3. Generar el título invocando al modelo en el hilo secundario
            const response = await model.invoke(messages);
            let newTitle = response.content as string;

            // Limpiar posibles comillas, asteriscos, y saltos de línea que la IA a veces incluye
            newTitle = newTitle.replace(/["'\n*#]/g, '').trim();

            console.log(`[TitleGeneratorJob] ✨ New auto-title generated: "${newTitle}"`);

            // 4. Guardar en Base de Datos (Si existe la fila la actualizamos, si no, la creamos)
            if (chatRow) {
                const updateData: any = { titulo: newTitle };
                if (isAssistant && idAssistant) updateData.id_assistant = idAssistant;
                await (dbTable as any).update({
                    where: { id: chatRow.id },
                    data: updateData
                });
            } else {
                const createData: any = {
                    id_user_chat: idUserChat,
                    titulo: newTitle,
                    systemprompt_doc: ''
                };
                if (isAssistant && idAssistant) createData.id_assistant = idAssistant;
                await (dbTable as any).create({
                    data: createData
                });
            }

            console.log(`[TitleGeneratorJob] ✅ Title updated in database for session '${idUserChat}'.`);

        } catch (error: any) {
            console.error(`[TitleGeneratorJob] ⚠️ Error generating title: ${error.message}`);
        }
    }
}

export const titleGeneratorAutomation = new TitleGeneratorAutomation();
