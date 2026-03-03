"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assistantHandlerService = exports.AssistantHandlerService = void 0;
const messages_1 = require("@langchain/core/messages");
const assistant_provider_service_1 = require("./assistant-provider.service");
const assistant_memory_service_1 = require("./assistant-memory.service");
const tool_executor_service_1 = require("../shared/tool-executor.service");
class AssistantHandlerService {
    /**
     * Proceso principal del Sistema Paralelo de Asistentes.
     * Lee directamente los valores del payload (webhook) en lugar de la base de datos.
     */
    async processMessage(sessionId, userMessageContent, systemPrompt, modelStr, historyPayload, documentContext, toolsArray = []) {
        console.log(`\n[AssistantHandler] ▶ Start processing for Assistant (Model: '${modelStr}') - Session '${sessionId}'`);
        try {
            // 1. Instanciar el Modelo Optimizado del Asistente
            // La temperatura y maxTokens podrían venir del payload en el futuro,
            // por ahora usamos valores genéricos (0.7, null)
            const model = assistant_provider_service_1.assistantProviderService.getModel(modelStr, 0.7, null);
            // 2. Conectar Herramientas (Ahora soportando Filtrado para Asistentes en Prod)
            let finalModel = model;
            const tools = tool_executor_service_1.toolExecutorService.getTools(toolsArray);
            if (tools.length > 0) {
                finalModel = finalModel.bindTools(tools);
            }
            // 3. Aislar la Memoria Histórica del Asistente (Session ID)
            // Tratamos de obtener historial local de Prisma.
            const dbHistory = await assistant_memory_service_1.assistantMemoryService.getAssistantChatHistory(sessionId);
            // 4. Armar Cadena de Mensajes Base (@langchain/core/messages)
            const messages = [];
            // Preparar el System Prompt
            // =================================================================================
            // 📝 PROMPT DEL SISTEMA - CONFIGURABLE MANUALMENTE (ASISTENTES)
            // Edita este string para agregar reglas fijas manuales para todos tus Asistentes.
            // Las variables dinámicas se reemplazarán automáticamente si las respetas aquí.
            // =================================================================================
            let builderPrompt = `Eres un Agente Asistente Avanzado de OLAWEE.
Tienes permitido pensar y usar herramientas web si lo necesitas.
Abre tu mente y actúa basándote en esta personalidad / tarea exacta enviada por el usuario:
{{ $json.systemprompt }}

---
Contexto adicional subido desde Archivos o Base de Datos:
{{ $json.systemprompt_doc }}
`;
            // =================================================================================
            let finalSystemPrompt = builderPrompt;
            // 1. Reemplazamos la variable {{ $json.systemprompt }} por el prompt enviado por el usuario
            if (finalSystemPrompt.includes('{{ $json.systemprompt }}')) {
                finalSystemPrompt = finalSystemPrompt.replace(/\{\{\s*\$json\.systemprompt\s*\}\}/gi, systemPrompt || "");
            }
            // 2. Reemplazamos la variable {{ $json.systemprompt_doc }} por el contexto del documento o BD
            if (finalSystemPrompt.includes('{{ $json.systemprompt_doc }}')) {
                finalSystemPrompt = finalSystemPrompt.replace(/\{\{\s*\$json\.systemprompt_doc\s*\}\}/gi, documentContext || "");
            }
            console.log(`[AssistantHandler] 📝 Injecting Assistant Custom System Prompt`);
            messages.push(new messages_1.SystemMessage(finalSystemPrompt.trim()));
            // Historial (Inyectamos el historial de Base de datos, luego si llega algo por webhook adicional...)
            if (dbHistory.length > 0) {
                messages.push(...dbHistory);
            }
            // Mapeamos array `history` del Webhook (por si el frontend lo envía fresco en vez de guardarlo de BD)
            if (historyPayload && historyPayload.length > 0) {
                for (const msg of historyPayload) {
                    if (msg.role === 'user' || msg.type === 'human')
                        messages.push(new messages_1.HumanMessage(msg.content));
                    if (msg.role === 'assistant' || msg.type === 'ai')
                        messages.push(new messages_1.AIMessage(msg.content));
                }
            }
            // Añadir el nuevo mensaje del usuario
            messages.push(new messages_1.HumanMessage(userMessageContent));
            // Guardar asíncronamente el mensaje Humano en la DB
            await assistant_memory_service_1.assistantMemoryService.saveMessage(sessionId, 'human', userMessageContent);
            console.log(`[AssistantHandler] Interacting with LLM (${modelStr}). Context size: ${messages.length} messages.`);
            // 5. Primera Invocación al LLM
            let response = await finalModel.invoke(messages);
            messages.push(response);
            // 6. 🔁 LOOP DINÁMICO DE TOOL CALLS (Protegido por MAX_ITERATIONS)
            const MAX_ITERATIONS = 5;
            let iteration = 0;
            while (response.tool_calls && response.tool_calls.length > 0 && iteration < MAX_ITERATIONS) {
                console.log(`[AssistantHandler] ⚙️ LLM requests ${response.tool_calls.length} tools. (Iteration ${iteration + 1})`);
                for (const toolCall of response.tool_calls) {
                    const selectedTool = tools.find((t) => t.name === toolCall.name);
                    if (selectedTool) {
                        try {
                            const result = await selectedTool.invoke(toolCall.args);
                            messages.push(new messages_1.ToolMessage({
                                content: typeof result === 'string' ? result : JSON.stringify(result),
                                tool_call_id: toolCall.id
                            }));
                            console.log(`[AssistantHandler] ✅ Tool '${toolCall.name}' Executed.`);
                        }
                        catch (err) {
                            messages.push(new messages_1.ToolMessage({
                                content: `Error executing tool: ${err}`,
                                tool_call_id: toolCall.id
                            }));
                        }
                    }
                    else {
                        messages.push(new messages_1.ToolMessage({
                            content: `Tool ${toolCall.name} not found.`,
                            tool_call_id: toolCall.id
                        }));
                    }
                }
                // Se realimenta a la IA con los datos de web / tools y piensa de nuevo
                response = await finalModel.invoke(messages);
                messages.push(response);
                iteration++;
            }
            // 7. Generar Resultado Final de la IA Asistente
            const aiResponseContent = response.content;
            // Guardado final en Base de Datos de manera Asíncrona
            await assistant_memory_service_1.assistantMemoryService.saveMessage(sessionId, 'ai', aiResponseContent);
            console.log(`[AssistantHandler] 🏁 Assistant Execution Complete. Status returned.`);
            return {
                status: 'success',
                type: 'assistant_response',
                model_used: modelStr,
                ai_response: aiResponseContent,
                timestamp: new Date().toISOString()
            };
        }
        catch (error) {
            console.error('[AssistantHandler] ❌ Error in Assistant Handler:', error);
            return {
                status: 'error',
                message: error.message || 'Error processing assistant response'
            };
        }
    }
}
exports.AssistantHandlerService = AssistantHandlerService;
exports.assistantHandlerService = new AssistantHandlerService();
