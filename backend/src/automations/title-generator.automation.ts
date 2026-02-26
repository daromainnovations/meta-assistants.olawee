import { getPrisma } from '../services/shared/prisma.service';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

export class TitleGeneratorAutomation {
    /**
     * Tarea en segundo plano ("Fire and Forget") que genera un título
     * para la conversación si aún no lo tiene.
     * Ahora soporta los 4 modos: LLM, Assistant, Pymes, Beta.
     */
    async generateTitleAsync(sessionId: string, firstMessage: string, provider: string, idAssistant?: string) {
        if (!sessionId || !firstMessage || firstMessage.trim() === '') return;

        try {
            const db = getPrisma();

            // ============================================================
            // Seleccionar la tabla correcta según el provider
            // ============================================================
            let dbTable: any;
            if (provider === 'assistant') {
                dbTable = db.prueba_chatsassistants;
            } else if (provider === 'pymes-assistant') {
                dbTable = db.prueba_chatspymes;
            } else if (provider === 'beta-assistant') {
                dbTable = db.prueba_chatsbeta;
            } else {
                // LLMs: gemini, openai, anthropic, mistral, deepseek
                dbTable = db.prueba_chatsllms;
            }

            // 1. Buscar la sesión en base de datos
            const chatRow = await dbTable.findFirst({
                where: { session_id: sessionId }
            });

            // Si ya tiene título generado, no hacemos nada
            if (chatRow && chatRow.titulo && chatRow.titulo !== sessionId && chatRow.titulo.trim() !== '') {
                console.log(`[TitleGeneratorJob] 💤 Session '${sessionId}' already has title: "${chatRow.titulo}". Skipping.`);
                return;
            }

            console.log(`[TitleGeneratorJob] 🚀 Generating title for session '${sessionId}' [${provider}]...`);

            // 2. Modelo rápido y barato para generar el título
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

            console.log(`[TitleGeneratorJob] ✨ Auto-title: "${newTitle}" [${provider}]`);

            // 3. Crear o actualizar el registro de chat en la tabla correcta
            if (chatRow) {
                const updateData: any = { titulo: newTitle, updated_at: new Date() };
                if (provider === 'assistant' && idAssistant) updateData.id_assistant = idAssistant;
                if (provider === 'pymes-assistant' && idAssistant) updateData.id_assistant = idAssistant;
                if (provider === 'beta-assistant' && idAssistant) updateData.beta_id = idAssistant;
                await dbTable.update({ where: { id: chatRow.id }, data: updateData });
            } else {
                const createData: any = {
                    session_id: sessionId,
                    titulo: newTitle,
                    systemprompt_doc: ''
                };
                if (provider === 'assistant' && idAssistant) createData.id_assistant = idAssistant;
                if (provider === 'pymes-assistant' && idAssistant) createData.id_assistant = idAssistant;
                if (provider === 'beta-assistant' && idAssistant) createData.beta_id = idAssistant;
                await dbTable.create({ data: createData });
            }

            console.log(`[TitleGeneratorJob] ✅ Title saved for session '${sessionId}' [${provider}].`);

        } catch (error: any) {
            console.error(`[TitleGeneratorJob] ⚠️ Error generating title: ${error.message}`);
        }
    }
}

export const titleGeneratorAutomation = new TitleGeneratorAutomation();
