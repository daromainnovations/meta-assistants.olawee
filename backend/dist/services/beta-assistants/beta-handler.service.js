"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.betaHandlerService = exports.BetaHandlerService = exports.SPECIALIST_REGISTRY = void 0;
const messages_1 = require("@langchain/core/messages");
const assistant_provider_service_1 = require("../assistants/assistant-provider.service");
const beta_memory_service_1 = require("./beta-memory.service");
const beta_tools_service_1 = require("./beta-tools.service");
// ============================================================
// 🤖 IMPORTAR TODOS LOS AGENTES ESPECIALISTAS AQUÍ
// ============================================================
const invoice_checker_agent_1 = require("./specialists/invoice-checker/invoice-checker.agent");
const doc_comparator_agent_1 = require("./specialists/doc-comparator/doc-comparator.agent");
/**
 * ============================================================
 * 🔀 BETA HANDLER — Router de Asistentes Especializados
 * ============================================================
 * Este handler tiene DOS modos de funcionamiento:
 *
 * MODO 1 — Con beta_id en el payload:
 *   → Despacha al agente especialista que corresponda.
 *   → El agente tiene su propio prompt fijo, modelo y tools.
 *
 * MODO 2 — Sin beta_id en el payload:
 *   → Funciona como asistente genérico Beta (modo laboratorio).
 *
 * Para añadir un nuevo especialista:
 *   1. Crea su carpeta en /specialists/mi-agente/
 *   2. Importa el agente arriba
 *   3. Añade su ID al switch de routeToSpecialist()
 * ============================================================
 */
// Mapa de IDs de especialistas disponibles
exports.SPECIALIST_REGISTRY = {
    'invoice_checker': 'Verificador de Facturas vs Excel',
    'doc_comparator': 'Comparador de Documentos (Genérico)',
    // Aquí irán los futuros especialistas:
    // 'contract_analyzer': 'Analizador de Contratos',
    // 'financial_advisor': 'Asesor Financiero',
};
class BetaHandlerService {
    /**
     * Despacha la petición al agente especialista según el beta_id
     */
    async routeToSpecialist(betaId, userMessage, files, sessionId, body) {
        console.log(`[BetaHandler] 🎯 Routing to SPECIALIST: "${betaId}"`);
        switch (betaId) {
            case 'invoice_checker':
                return await invoice_checker_agent_1.invoiceCheckerAgent.run(userMessage, files, sessionId);
            case 'doc_comparator':
                return await doc_comparator_agent_1.docComparatorAgent.run(userMessage, files, sessionId);
            // case 'contract_analyzer':
            //     return await contractAnalyzerAgent.run(userMessage, files, sessionId);
            default:
                return {
                    status: 'error',
                    message: `Agente especialista "${betaId}" no encontrado. Especialistas disponibles: ${Object.keys(exports.SPECIALIST_REGISTRY).join(', ')}`,
                    timestamp: new Date().toISOString()
                };
        }
    }
    /**
     * Punto de entrada principal del sistema Beta
     */
    async processMessage(sessionId, userMessageContent, systemPrompt, modelStr, historyPayload, documentContext, toolsArray = [], betaId, files) {
        // ============================================================
        // MODO 1: Despacho a agente especialista
        // ============================================================
        if (betaId && exports.SPECIALIST_REGISTRY[betaId]) {
            console.log(`\n[BetaHandler] ▶ SPECIALIST MODE — ID: "${betaId}", Session: "${sessionId}"`);
            // 💾 Guardar mensaje del usuario en tabla de mensajes beta
            await beta_memory_service_1.betaMemoryService.saveMessage(sessionId, 'human', userMessageContent);
            const specialistResult = await this.routeToSpecialist(betaId, userMessageContent, files || [], sessionId, {});
            // 💾 Guardar respuesta del especialista en tabla de mensajes beta
            if (specialistResult?.ai_response) {
                await beta_memory_service_1.betaMemoryService.saveMessage(sessionId, 'ai', specialistResult.ai_response);
            }
            return specialistResult;
        }
        // ============================================================
        // MODO 2: Asistente Beta genérico (laboratorio)
        // ============================================================
        console.log(`\n[BetaHandler] ▶ GENERIC BETA MODE — Model: "${modelStr}", Session: "${sessionId}"`);
        try {
            const model = assistant_provider_service_1.assistantProviderService.getModel(modelStr, 0.7, null);
            let finalModel = model;
            // betaToolsService.getAllTools() ya incluye las herramientas base (get_current_time, etc.)
            // NO llamar a toolExecutorService.getTools() por separado — causaría duplicados
            const allTools = beta_tools_service_1.betaToolsService.getAllTools(toolsArray);
            if (allTools.length > 0) {
                finalModel = finalModel.bindTools(allTools);
            }
            const dbHistory = await beta_memory_service_1.betaMemoryService.getBetaChatHistory(sessionId);
            const messages = [];
            // =================================================================================
            // 📝 PROMPT DEL SISTEMA — BETA GENÉRICO (Laboratorio)
            // =================================================================================
            let builderPrompt = `Eres el Agente Asistente OLAWEE en el entorno BETA (Laboratorio B).
Estás aquí para probar las herramientas más avanzadas y especializadas antes de que pasen a Producción.
Actúa estrictamente según el rol que el usuario te defina a continuación.

Instrucción actual enviada por el usuario (Personalidad dinámica): 
{{ $json.systemprompt }}

---
Contexto adicional subido desde Archivos o Base de Datos:
{{ $json.systemprompt_doc }}
`;
            // =================================================================================
            let finalSystemPrompt = builderPrompt
                .replace(/\{\{\s*\$json\.systemprompt\s*\}\}/gi, systemPrompt || '')
                .replace(/\{\{\s*\$json\.systemprompt_doc\s*\}\}/gi, documentContext || '');
            messages.push(new messages_1.SystemMessage(finalSystemPrompt.trim()));
            if (dbHistory.length > 0)
                messages.push(...dbHistory);
            if (historyPayload && historyPayload.length > 0) {
                for (const msg of historyPayload) {
                    if (msg.role === 'user' || msg.type === 'human')
                        messages.push(new messages_1.HumanMessage(msg.content));
                    if (msg.role === 'assistant' || msg.type === 'ai')
                        messages.push(new messages_1.AIMessage(msg.content));
                }
            }
            messages.push(new messages_1.HumanMessage(userMessageContent));
            await beta_memory_service_1.betaMemoryService.saveMessage(sessionId, 'human', userMessageContent);
            let response = await finalModel.invoke(messages);
            messages.push(response);
            const MAX_ITERATIONS = 5;
            let iteration = 0;
            while (response.tool_calls && response.tool_calls.length > 0 && iteration < MAX_ITERATIONS) {
                console.log(`[BetaHandler] ⚙️ Tool call iteration ${iteration + 1}`);
                for (const toolCall of response.tool_calls) {
                    const selectedTool = allTools.find((t) => t.name === toolCall.name);
                    if (selectedTool) {
                        try {
                            const result = await selectedTool.invoke(toolCall.args);
                            messages.push(new messages_1.ToolMessage({
                                content: typeof result === 'string' ? result : JSON.stringify(result),
                                tool_call_id: toolCall.id
                            }));
                            console.log(`[BetaHandler] ✅ Tool '${toolCall.name}' executed.`);
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
                            content: `Tool ${toolCall.name} no encontrada.`,
                            tool_call_id: toolCall.id
                        }));
                    }
                }
                response = await finalModel.invoke(messages);
                messages.push(response);
                iteration++;
            }
            const aiResponseContent = response.content;
            await beta_memory_service_1.betaMemoryService.saveMessage(sessionId, 'ai', aiResponseContent);
            return {
                status: 'success',
                type: 'beta_generic_response',
                model_used: modelStr,
                ai_response: aiResponseContent,
                context_used: !!documentContext || dbHistory.length > 0,
                timestamp: new Date().toISOString()
            };
        }
        catch (error) {
            console.error(`[BetaHandler] ❌ Error:`, error.message);
            return {
                status: 'error',
                error: error.message,
                message: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}
exports.BetaHandlerService = BetaHandlerService;
exports.betaHandlerService = new BetaHandlerService();
