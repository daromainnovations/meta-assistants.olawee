import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { assistantProviderService } from '../assistants/assistant-provider.service';
import { betaMemoryService } from './beta-memory.service';
import { betaToolsService } from './beta-tools.service';

// ============================================================
// 🤖 IMPORTAR TODOS LOS AGENTES ESPECIALISTAS AQUÍ
// ============================================================
import { invoiceCheckerAgent } from './specialists/invoice-checker/invoice-checker.agent';

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
export const SPECIALIST_REGISTRY: Record<string, string> = {
    'invoice_checker': 'Verificador de Facturas vs Excel',
    // Aquí irán los futuros especialistas:
    // 'contract_analyzer': 'Analizador de Contratos',
    // 'financial_advisor': 'Asesor Financiero',
};

export class BetaHandlerService {

    /**
     * Despacha la petición al agente especialista según el beta_id
     */
    private async routeToSpecialist(
        betaId: string,
        userMessage: string,
        files: Express.Multer.File[],
        sessionId: string,
        body: any
    ): Promise<any> {
        console.log(`[BetaHandler] 🎯 Routing to SPECIALIST: "${betaId}"`);

        switch (betaId) {
            case 'invoice_checker':
                return await invoiceCheckerAgent.run(userMessage, files, sessionId);

            // case 'contract_analyzer':
            //     return await contractAnalyzerAgent.run(userMessage, files, sessionId);

            default:
                return {
                    status: 'error',
                    message: `Agente especialista "${betaId}" no encontrado. Especialistas disponibles: ${Object.keys(SPECIALIST_REGISTRY).join(', ')}`,
                    timestamp: new Date().toISOString()
                };
        }
    }

    /**
     * Punto de entrada principal del sistema Beta
     */
    async processMessage(
        sessionId: string,
        userMessageContent: string,
        systemPrompt: string,
        modelStr: string,
        historyPayload: any[],
        documentContext: string,
        toolsArray: number[] = [],
        betaId?: string,
        files?: Express.Multer.File[]
    ): Promise<any> {

        // ============================================================
        // MODO 1: Despacho a agente especialista
        // ============================================================
        if (betaId && SPECIALIST_REGISTRY[betaId]) {
            console.log(`\n[BetaHandler] ▶ SPECIALIST MODE — ID: "${betaId}", Session: "${sessionId}"`);

            // 💾 Guardar mensaje del usuario en tabla de mensajes beta
            await betaMemoryService.saveMessage(sessionId, 'human', userMessageContent);

            const specialistResult = await this.routeToSpecialist(betaId, userMessageContent, files || [], sessionId, {});

            // 💾 Guardar respuesta del especialista en tabla de mensajes beta
            if (specialistResult?.ai_response) {
                await betaMemoryService.saveMessage(sessionId, 'ai', specialistResult.ai_response);
            }

            return specialistResult;
        }

        // ============================================================
        // MODO 2: Asistente Beta genérico (laboratorio)
        // ============================================================
        console.log(`\n[BetaHandler] ▶ GENERIC BETA MODE — Model: "${modelStr}", Session: "${sessionId}"`);

        try {
            const model = assistantProviderService.getModel(modelStr, 0.7, null);

            let finalModel = model as any;
            // betaToolsService.getAllTools() ya incluye las herramientas base (get_current_time, etc.)
            // NO llamar a toolExecutorService.getTools() por separado — causaría duplicados
            const allTools = betaToolsService.getAllTools(toolsArray);

            if (allTools.length > 0) {
                finalModel = finalModel.bindTools(allTools);
            }

            const dbHistory = await betaMemoryService.getBetaChatHistory(sessionId);
            const messages: any[] = [];

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

            messages.push(new SystemMessage(finalSystemPrompt.trim()));

            if (dbHistory.length > 0) messages.push(...dbHistory);

            if (historyPayload && historyPayload.length > 0) {
                for (const msg of historyPayload) {
                    if (msg.role === 'user' || msg.type === 'human') messages.push(new HumanMessage(msg.content));
                    if (msg.role === 'assistant' || msg.type === 'ai') messages.push(new AIMessage(msg.content));
                }
            }

            messages.push(new HumanMessage(userMessageContent));
            await betaMemoryService.saveMessage(sessionId, 'human', userMessageContent);

            let response = await finalModel.invoke(messages);
            messages.push(response);

            const MAX_ITERATIONS = 5;
            let iteration = 0;

            while (response.tool_calls && response.tool_calls.length > 0 && iteration < MAX_ITERATIONS) {
                console.log(`[BetaHandler] ⚙️ Tool call iteration ${iteration + 1}`);

                for (const toolCall of response.tool_calls) {
                    const selectedTool = allTools.find((t: any) => t.name === toolCall.name);
                    if (selectedTool) {
                        try {
                            const result = await (selectedTool as any).invoke(toolCall.args);
                            messages.push(new ToolMessage({
                                content: typeof result === 'string' ? result : JSON.stringify(result),
                                tool_call_id: toolCall.id!
                            }));
                            console.log(`[BetaHandler] ✅ Tool '${toolCall.name}' executed.`);
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

            const aiResponseContent = response.content as string;
            await betaMemoryService.saveMessage(sessionId, 'ai', aiResponseContent);

            return {
                status: 'success',
                type: 'beta_generic_response',
                model_used: modelStr,
                ai_response: aiResponseContent,
                context_used: !!documentContext || dbHistory.length > 0,
                timestamp: new Date().toISOString()
            };

        } catch (error: any) {
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

export const betaHandlerService = new BetaHandlerService();
