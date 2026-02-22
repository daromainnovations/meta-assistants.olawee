import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { aiProviderService } from './ai-provider.service';
import { memoryService } from './memory.service';
import { toolExecutorService } from '../shared/tool-executor.service';
import { ChatMessageData, ChatResult } from '../../types/chat.types';

export class ChatHandlerService {

    /**
     * Proceso Principal del LangChain Agente LLM
     */
    async processMessage(provider: string, messageData: ChatMessageData, systemContext?: string): Promise<ChatResult> {
        console.log(`\n[ChatHandler] ▶ Start processing model '${messageData.model}' via provider '${provider}'`);

        // Normalizar entrada
        const userMessageContent = messageData.chatInput || messageData.message || messageData.query || "No message provided";
        const idUserChat = messageData.session_id || "default_session";

        try {
            // 1. Obtener Instancia de Modelo LangChain Configurado
            const model = aiProviderService.getModel(provider, messageData.model);

            // 2. Obtener Tools Base Dinámicas e Inyectarlas al Modelo
            const tools = toolExecutorService.getTools();
            const modelWithTools = (model as any).bindTools(tools);

            // 3. Obtener Context Session (Memoria) desde Database usando Prisma
            const history = await memoryService.getChatHistory(idUserChat);

            // 4. Armar Cadena de Mensajes Base (@langchain/core/messages)
            const messages: any[] = [];

            // El System Context principal (manual template y documento subido o recibido por webhook)
            // 1. Obtiene contexto de documento (viene del doc procesado, del payload del webhook, o sino saca de la bd).
            let finalDocumentContext = systemContext;
            if (!finalDocumentContext) {
                finalDocumentContext = await memoryService.getDocumentContext(idUserChat);
            }

            // 2. Establecer el prompt base
            // =================================================================================
            // 📝 PROMPT DEL SISTEMA - CONFIGURABLE MANUALMENTE
            // Edita este string para cambiar la personalidad, instrucciones y formato de la IA
            // =================================================================================
            let finalSystemPrompt = `Eres un asistente de Inteligencia Artificial de OLAWEE super inteligente.
Tus instrucciones principales son:
1. Responde siempre de forma amable.
2. Si existe información en el documento proporcionado, úsala obligatoriamente para responder y no inventes.

Contexto del documento proporcionado (si aplica):
{{ $json.body.systemprompt_doc }}
`;
            // =================================================================================

            // 3. Reemplazar tags n8n (ej: {{ $json.body.systemprompt_doc }}) con la info de la bd
            if (finalDocumentContext) {
                finalSystemPrompt = finalSystemPrompt.replace(/\{\{\s*\$json\.body\.systemprompt_doc\s*\}\}/gi, finalDocumentContext);
            } else {
                // Si no hay doc, simplemente quitamos el tag para no ensuciar el prompt
                finalSystemPrompt = finalSystemPrompt.replace(/\{\{\s*\$json\.body\.systemprompt_doc\s*\}\}/gi, "");
            }

            // Limpiamos espacios extra
            finalSystemPrompt = finalSystemPrompt.trim();

            if (finalSystemPrompt) {
                console.log(`[ChatHandler] Adding SystemMessage (Interpolated) of length: ${finalSystemPrompt.length}`);
                messages.push(new SystemMessage(finalSystemPrompt));
            }

            // Todo el historial persistido
            if (history.length > 0) {
                messages.push(...history);
            }

            // El nuevo Prompt o Mensaje a procesar
            messages.push(new HumanMessage(userMessageContent));

            // Salvaguardamos Asíncronamente el nuevo mensaje del usuario en BD
            await memoryService.saveMessage(idUserChat, 'human', userMessageContent);

            console.log(`[ChatHandler] Interacting with LLM. Context size: ${messages.length} messages.`);

            // 5. Invocación al LLM con Tools Enabled
            let response = await modelWithTools.invoke(messages);
            messages.push(response); // La respuesta se empuja temporalmente a la cadena

            // 6. 🔁 LOOP DINÁMICO DE TOOL CALLS
            // Si el modelo decide que no sabe algo, llamará a las "Tool_calls" que le expusimos.
            const MAX_ITERATIONS = 5; // Evita bucles infinitos por alucinaciones LLM
            let iteration = 0;

            while (response.tool_calls && response.tool_calls.length > 0 && iteration < MAX_ITERATIONS) {
                console.log(`[ChatHandler] ⚙️ LLM requests ${response.tool_calls.length} tools. (Iteration ${iteration + 1})`);

                // Procesamos cada llamada de herramienta (en paralelo si se requiere)
                for (const toolCall of response.tool_calls) {
                    const selectedTool = tools.find(t => t.name === toolCall.name);

                    if (selectedTool) {
                        try {
                            const result = await (selectedTool as any).invoke(toolCall.args);
                            // La estructura requiere responder con un "ToolMessage" con tool_call_id
                            messages.push(new ToolMessage({
                                content: typeof result === 'string' ? result : JSON.stringify(result),
                                tool_call_id: toolCall.id!
                            }));
                            console.log(`[ChatHandler] ✅ Tool '${toolCall.name}' Executed with Output Length:`, typeof result === 'string' ? result.length : 'JSON');
                        } catch (err) {
                            messages.push(new ToolMessage({
                                content: `Error executing tool: ${err}`,
                                tool_call_id: toolCall.id!
                            }));
                        }
                    } else {
                        messages.push(new ToolMessage({
                            content: `Tool ${toolCall.name} no encontrada.`,
                            tool_call_id: toolCall.id!
                        }));
                    }
                }

                // Retornamos el resultado de las herramientas al cerebro (LLM) para analizar la respuesta.
                response = await modelWithTools.invoke(messages);
                messages.push(response);
                iteration++;
            }

            // 7. Generar e Insertar Resultado Final de la IA
            const aiResponseContent = response.content as string;

            // Guardar respuesta del asistente a la base de datos de manera Asíncrona  
            await memoryService.saveMessage(idUserChat, 'ai', aiResponseContent);

            console.log(`[ChatHandler] 🏁 AI Execution Complete. Status returned.`);

            return {
                status: 'success',
                type: 'chat_response',
                provider: provider,
                ai_response: aiResponseContent,
                context_used: !!systemContext || history.length > 0,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            console.error(`[ChatHandler] ❌ Global LangChain Error for ${provider}:`, errMsg);

            return {
                status: 'error',
                provider: provider,
                error: errMsg,
                message: errMsg,
                timestamp: new Date().toISOString()
            };
        }
    }
}

// Singleton de Inversión de control base
export const chatHandlerService = new ChatHandlerService();
