import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { assistantProviderService } from '../assistants/assistant-provider.service';
import { assistantMemoryService } from '../assistants/assistant-memory.service';
import { toolExecutorService } from '../shared/tool-executor.service';
import { pymesToolsService } from './pymes-tools.service';

export class PymesHandlerService {

    /**
     * Proceso principal del Sistema Paralelo de PYMES.
     */
    async processMessage(
        sessionId: string,
        userMessageContent: string,
        systemPrompt: string,
        modelStr: string,
        historyPayload: any[],
        documentContext: string
    ): Promise<any> {
        console.log(`\n[PymesHandler] ▶ Start processing for PYMES Assistant (Model: '${modelStr}') - Session '${sessionId}'`);

        try {
            // 1. Instanciar el Modelo Optimizado
            const model = assistantProviderService.getModel(modelStr, 0.7, null);

            // 2. Conectar Herramientas Base (Internet, Wikipedia) + Nuevas Tools (Pymes)
            let finalModel = model as any;
            const externalTools = toolExecutorService.getTools();
            const pymesTools = pymesToolsService.getAllTools();
            const allTools = [...externalTools, ...pymesTools];

            if (allTools.length > 0) {
                finalModel = finalModel.bindTools(allTools);
            }

            // 3. Aislar la Memoria Histórica del Asistente (Session ID)
            const dbHistory = await assistantMemoryService.getAssistantChatHistory(sessionId);

            // 4. Armar Cadena de Mensajes Base (@langchain/core/messages)
            const messages: any[] = [];

            // =================================================================================
            // 📝 PROMPT DEL SISTEMA - CONFIGURABLE MANUALMENTE (PYMES)
            // =================================================================================
            let builderPrompt = `Eres el Agente Asistente OLAWEE especializado en PYMES y Autónomos.
Tienes a tu disposición herramientas para crear FACTURAS en PDF, calcular IMPUESTOS (IVA/IRPF), generar CONTRATOS (Word/PDF) y crear contenido de MARKETING altamente persuasivo.
No inventes un PDF. Siempre usa la herramienta necesaria si el usuario pide alguna de esas cuatro acciones.

Instrucción actual enviada por el usuario (Personalidad dinámica): 
{{ $json.systemprompt }}

---
Contexto adicional subido desde Archivos o Base de Datos:
{{ $json.systemprompt_doc }}
`;
            // =================================================================================

            let finalSystemPrompt = builderPrompt;

            // Reemplazos de Variables
            if (finalSystemPrompt.includes('{{ $json.systemprompt }}')) {
                finalSystemPrompt = finalSystemPrompt.replace(/\{\{\s*\$json\.systemprompt\s*\}\}/gi, systemPrompt || "");
            }
            if (finalSystemPrompt.includes('{{ $json.systemprompt_doc }}')) {
                finalSystemPrompt = finalSystemPrompt.replace(/\{\{\s*\$json\.systemprompt_doc\s*\}\}/gi, documentContext || "");
            }

            console.log(`[PymesHandler] 📝 Injecting PYMES Custom System Prompt`);
            messages.push(new SystemMessage(finalSystemPrompt.trim()));

            // Historial
            if (dbHistory.length > 0) messages.push(...dbHistory);

            if (historyPayload && historyPayload.length > 0) {
                for (const msg of historyPayload) {
                    if (msg.role === 'user' || msg.type === 'human') messages.push(new HumanMessage(msg.content));
                    if (msg.role === 'assistant' || msg.type === 'ai') messages.push(new AIMessage(msg.content));
                }
            }

            messages.push(new HumanMessage(userMessageContent));

            // Guardar asíncronamente
            await assistantMemoryService.saveMessage(sessionId, 'human', userMessageContent);

            console.log(`[PymesHandler] Interacting with LLM (${modelStr}). Context size: ${messages.length} messages.`);

            // 5. Primera Invocación al LLM
            let response = await finalModel.invoke(messages);
            messages.push(response);

            // 6. 🔁 LOOP DINÁMICO DE TOOL CALLS
            const MAX_ITERATIONS = 5;
            let iteration = 0;

            while (response.tool_calls && response.tool_calls.length > 0 && iteration < MAX_ITERATIONS) {
                console.log(`[PymesHandler] ⚙️ LLM requests ${response.tool_calls.length} tools. (Iteration ${iteration + 1})`);

                for (const toolCall of response.tool_calls) {
                    // Buscar la herramienta tanto en las base como en las de pyme
                    const selectedTool = allTools.find((t: any) => t.name === toolCall.name);

                    if (selectedTool) {
                        try {
                            const result = await (selectedTool as any).invoke(toolCall.args);
                            messages.push(new ToolMessage({
                                content: typeof result === 'string' ? result : JSON.stringify(result),
                                tool_call_id: toolCall.id!
                            }));
                            console.log(`[PymesHandler] ✅ Tool '${toolCall.name}' Executed.`);
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

                response = await finalModel.invoke(messages);
                messages.push(response);
                iteration++;
            }

            // 7. Resultado Final
            const aiResponseContent = response.content as string;

            await assistantMemoryService.saveMessage(sessionId, 'ai', aiResponseContent);

            console.log(`[PymesHandler] 🏁 Execution Complete.`);

            return {
                status: 'success',
                type: 'assistant_response',
                model_used: modelStr,
                ai_response: aiResponseContent,
                context_used: !!documentContext || dbHistory.length > 0,
                timestamp: new Date().toISOString()
            };

        } catch (error: any) {
            console.error(`[PymesHandler] ❌ Global LangChain Error:`, error.message);

            return {
                status: 'error',
                error: error.message,
                message: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

export const pymesHandlerService = new PymesHandlerService();
