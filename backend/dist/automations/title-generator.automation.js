"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.titleGeneratorAutomation = exports.TitleGeneratorAutomation = void 0;
const prisma_service_1 = require("../services/shared/prisma.service");
const google_genai_1 = require("@langchain/google-genai");
const messages_1 = require("@langchain/core/messages");
class TitleGeneratorAutomation {
    /**
     * Tarea en segundo plano ("Fire and Forget") que genera un título
     * para la conversación si aún no lo tiene.
     * Ahora soporta los modos: LLM, Assistant, Meta.
     */
    async generateTitleAsync(sessionId, firstMessage, provider, idAssistant) {
        if (!sessionId || !firstMessage || firstMessage.trim() === '')
            return;
        try {
            const db = (0, prisma_service_1.getPrisma)();
            // ============================================================
            // Seleccionar la tabla correcta según el provider
            // ============================================================
            let dbTable;
            if (provider === 'assistant') {
                dbTable = db.chats_agentes;
            }
            else if (provider === 'meta-assistant') {
                dbTable = db.chatsmeta;
            }
            else {
                // LLMs: gemini, openai, anthropic, mistral, deepseek
                dbTable = db.chatsllms;
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
            const model = new google_genai_1.ChatGoogleGenerativeAI({
                apiKey: process.env.GEMINI_API_KEY,
                model: 'gemini-2.0-flash',
                temperature: 0.3,
            });
            const messages = [
                new messages_1.SystemMessage("Eres un experto catalogador. Tu única tarea es generar un título MUY CORTO (máximo 4 palabras) que resuma el tema principal del mensaje del usuario. NUNCA respondas a su pregunta, SOLAMENTE devuelve las 4 palabras del título, sin comillas, markdown ni puntos finales. Ejemplos de buenas respuestas: 'Ayuda con React', 'Receta de Cocina', 'Consulta de Pedido', 'Búsqueda en Wikipedia'."),
                new messages_1.HumanMessage(firstMessage)
            ];
            const response = await model.invoke(messages);
            let newTitle = response.content.replace(/["'\n*#]/g, '').trim();
            console.log(`[TitleGeneratorJob] ✨ Auto-title: "${newTitle}" [${provider}]`);
            // RE-EVALUAMOS el estado en BBDD después de la espera del LLM
            // para evitar duplicar entradas por concurrencia (ej. webhook guardando el Document Context a la vez)
            const latestChatRow = await dbTable.findFirst({
                where: { session_id: sessionId }
            });
            // 3. Crear o actualizar el registro de chat en la tabla correcta
            if (latestChatRow) {
                const updateData = { titulo: newTitle, updated_at: new Date() };
                if (provider === 'assistant' && idAssistant)
                    updateData.id_assistant = idAssistant;
                if (provider === 'meta-assistant' && idAssistant)
                    updateData.meta_id = idAssistant;
                await dbTable.update({ where: { id: latestChatRow.id }, data: updateData });
            }
            else {
                const createData = {
                    session_id: sessionId,
                    titulo: newTitle,
                    systemprompt_doc: ''
                };
                if (provider === 'assistant' && idAssistant)
                    createData.id_assistant = idAssistant;
                if (provider === 'meta-assistant' && idAssistant)
                    createData.meta_id = idAssistant;
                await dbTable.create({ data: createData });
            }
            console.log(`[TitleGeneratorJob] ✅ Title saved for session '${sessionId}' [${provider}].`);
        }
        catch (error) {
            console.error(`[TitleGeneratorJob] ⚠️ Error generating title: ${error.message}`);
        }
    }
}
exports.TitleGeneratorAutomation = TitleGeneratorAutomation;
exports.titleGeneratorAutomation = new TitleGeneratorAutomation();
