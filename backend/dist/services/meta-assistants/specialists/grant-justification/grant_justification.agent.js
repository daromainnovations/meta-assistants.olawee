"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.grantJustificationAgent = exports.GrantJustificationAgent = void 0;
const google_genai_1 = require("@langchain/google-genai");
const tools_1 = require("@langchain/core/tools");
const messages_1 = require("@langchain/core/messages");
const zod_1 = require("zod");
const excel_generator_1 = require("./excel_generator");
const meta_memory_service_1 = require("../../meta-memory.service");
// --- HELPER FUNCTION: Fusión (Mergeo) de Excel existente ---
function extractExistingExcelData(contextStr) {
    const result = { gastos: [], justificantes: [] };
    if (!contextStr)
        return result;
    try {
        const jsonBlocks = contextStr.match(/\[\s*\{[\s\S]*?\}\s*\]/g);
        if (!jsonBlocks)
            return result;
        for (const block of jsonBlocks) {
            const arr = JSON.parse(block);
            if (!Array.isArray(arr))
                continue;
            for (const row of arr) {
                const rowStr = JSON.stringify(row).toLowerCase();
                // Skip obvious header or empty formatting rows
                if (rowStr.includes('anexo 2 relación') || rowStr.includes('anexo 3 documentos') || rowStr.includes('base imponible') || rowStr.includes('retención irpf'))
                    continue;
                const vals = Object.values(row);
                if (vals.length < 4)
                    continue;
                const isAnexo3 = rowStr.includes('tipo de documento') || (vals.length <= 8 && !rowStr.includes('base'));
                const getVal = (keywords, idx) => {
                    for (const key of Object.keys(row)) {
                        if (keywords.some(kw => key.toLowerCase().includes(kw)))
                            return row[key];
                    }
                    return vals[idx] !== undefined ? vals[idx] : '';
                };
                const numVal = (v) => isNaN(parseFloat(String(v).replace(',', '.'))) ? 0 : parseFloat(String(v).replace(',', '.'));
                if (!isAnexo3) {
                    const g = {
                        refGasto: String(getVal(['ref', 'gasto'], 0)),
                        numFactura: String(getVal(['factura', 'doc'], 1)),
                        proveedor: String(getVal(['proveedor', 'emisor'], 2)),
                        partida: String(getVal(['partida'], 3)),
                        actividad: String(getVal(['actividad'], 4)),
                        fecha: String(getVal(['fecha'], 5)),
                        concepto: String(getVal(['concepto'], 6)),
                        baseImponible: numVal(getVal(['base', 'imponible'], 7)),
                        iva: numVal(getVal(['iva'], 8)),
                        retencion: numVal(getVal(['retencion', 'irpf'], 9)),
                        total: numVal(getVal(['total'], 10)),
                        importeImputado: numVal(getVal(['imputado'], 11)),
                        observacionesFactura: String(getVal(['observaciones', 'factura'], 12)),
                        refJustificante: String(getVal(['justificante'], 13)),
                        fechaPago: String(getVal(['pago', 'fecha'], 14)),
                        importePagado: numVal(getVal(['pagado'], 15)),
                        observacionesPago: String(getVal(['observaciones', 'pago'], 16)),
                    };
                    if (g.proveedor || g.baseImponible > 0 || g.concepto)
                        result.gastos.push(g);
                }
                else {
                    const j = {
                        refJustificante: String(getVal(['justificante', 'ref'], 0)),
                        refGastoVinculado: String(getVal(['gasto'], 1)),
                        partida: String(getVal(['partida'], 2)),
                        actividad: String(getVal(['actividad'], 3)),
                        tipoDocumento: String(getVal(['tipo'], 4)),
                        descripcion: String(getVal(['desc'], 5)),
                        fecha: String(getVal(['fecha'], 6)),
                        observaciones: String(getVal(['observaciones'], 7))
                    };
                    if (j.descripcion || j.tipoDocumento)
                        result.justificantes.push(j);
                }
            }
        }
    }
    catch (e) {
        console.warn('[GrantJustifier] Fusión automática de Excel abortada por fallo de parseo:', e);
    }
    return result;
}
class GrantJustificationAgent {
    async run(userMessage, files, sessionId, docContext) {
        console.log(`[GrantJustifier] 🧠 MEMORY CHECK: Se han recibido ${docContext.length} caracteres de contexto documental unificado.`);
        // Variables de estado para compartir datos LLM -> Salida
        let generatedBuffer = null;
        let excelFileName = '';
        // 3. Definición de Herramientas
        const generarExcelTool = new tools_1.DynamicStructuredTool({
            name: 'generar_excel_justificacion',
            description: 'Genera un archivo Excel (.xlsx) con nuevas filas para el Anexo 2 (Gastos) y Anexo 3 (Justificantes). Úsala cuando el usuario te pida rellenar el excel o añadir facturas. Se encargará de crear el búfer en memoria.',
            schema: zod_1.z.object({
                filename: zod_1.z.string().describe('El nombre que tendrá el archivo generado. (Ej: Anexos_Subvencion_Actualizados.xlsx)'),
                nuevosGastos: zod_1.z.array(zod_1.z.object({
                    refGasto: zod_1.z.string().optional().default('Pendiente'),
                    numFactura: zod_1.z.string().optional().default('Pendiente'),
                    proveedor: zod_1.z.string().optional().default('Pendiente'),
                    partida: zod_1.z.string().optional().default('Pendiente'),
                    actividad: zod_1.z.string().optional().default('Pendiente'),
                    fecha: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]).optional().default('Pendiente'),
                    concepto: zod_1.z.string().optional().default('Pendiente'),
                    baseImponible: zod_1.z.number().optional().default(0),
                    iva: zod_1.z.number().optional().default(0),
                    retencion: zod_1.z.number().optional().default(0),
                    total: zod_1.z.number().optional().default(0),
                    importeImputado: zod_1.z.number().optional().default(0),
                    observacionesFactura: zod_1.z.string().optional().default(''),
                    refJustificante: zod_1.z.string().optional().default('Pendiente'),
                    fechaPago: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]).optional().default(''),
                    importePagado: zod_1.z.number().optional().default(0),
                    observacionesPago: zod_1.z.string().optional().default('')
                })).describe('Array SOLO con las NUEVAS líneas que vas a añadir al Anexo 2 (No pongas las antiguas).'),
                nuevosJustificantes: zod_1.z.array(zod_1.z.object({
                    refJustificante: zod_1.z.string().optional().default('Pendiente'),
                    refGastoVinculado: zod_1.z.string().optional().default('Pendiente'),
                    partida: zod_1.z.string().optional().default('Pendiente'),
                    actividad: zod_1.z.string().optional().default('Pendiente'),
                    tipoDocumento: zod_1.z.string().optional().default('TRANSFERENCIA'),
                    descripcion: zod_1.z.string().optional().default('Pendiente'),
                    fecha: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]).optional().default('Pendiente'),
                    observaciones: zod_1.z.string().optional().default('')
                })).describe('Array SOLO con los NUEVOS justificantes de pago (Anexo 3, no incluyas los antiguos).')
            }),
            func: async (args) => {
                try {
                    const { filename, nuevosGastos, nuevosJustificantes } = args;
                    // 1. Fusión en vivo: Extraer datos del Excel histórico provisto en la memoria
                    const existingData = extractExistingExcelData(docContext);
                    // 2. Concatenar los arrays (Antiguos + Nuevos)
                    const finalGastos = [...existingData.gastos, ...nuevosGastos];
                    const finalJustificantes = [...existingData.justificantes, ...nuevosJustificantes];
                    generatedBuffer = (0, excel_generator_1.generateExcelBuffer)(finalGastos, finalJustificantes);
                    excelFileName = filename;
                    return "El Excel se ha generado en memoria correctamente y entregado a la plataforma OLAWEE. Dile al usuario que puede descargar el archivo en el enlace o interfaz proporcionado.";
                }
                catch (error) {
                    return `Error al generar el Excel: ${error.message}`;
                }
            }
        });
        const tools = [generarExcelTool];
        // 4. Configurar LangChain (Modelo Gemini 2.0 Flash)
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey)
            throw new Error('GEMINI_API_KEY no configurado en el entorno (.env)');
        const llm = new google_genai_1.ChatGoogleGenerativeAI({
            apiKey,
            model: "gemini-2.0-flash",
            temperature: 0
        });
        const llmWithTools = llm.bindTools(tools);
        const promptText = `Eres un auditor experto en Subvenciones Españolas. Tu nombre es "Asistente Justificador".
Recibes facturas en PDF y hojas Excel (Anexo 2 de gastos, Anexo 3 de justificantes y resúmenes).
Tu trabajo es responder a la petición del usuario, comprobando si las facturas emitidas por proveedores coinciden con los Excels,
o usando la herramienta "generar_excel_justificacion" para crear los Anexos 2 y 3 si el usuario lo exige.
Comunícate siempre en español claro y profesional.
Alerta de incongruencias (IVA que no cuadra, facturas sin justificante).

CONTEXTO DOCUMENTAL:
${docContext || '⚠️ AVISO: No hay documentos disponibles aún. Solicita al usuario el Excel de gastos y las facturas.'}
`;
        // 5. Ejecutar Agente
        console.log(`[GrantJustificationAgent] Iniciando Invocación Manual. Sesión: ${sessionId}`);
        const safeInput = userMessage && userMessage.trim().length > 0
            ? userMessage
            : "Revisa los documentos adjuntos y dime si está todo en orden o si necesitas algo más.";
        // Usando llamadas manuales interconectadas con el Historial conversacional real
        const history = await meta_memory_service_1.metaMemoryService.getMetaChatHistory(sessionId);
        const messages = [
            new messages_1.SystemMessage(promptText),
            ...history
        ];
        // Si el usuario subió documentos vacíos sin texto, el Handler no lo guardó en BD, así que lo añadimos aquí en memoria:
        if (!userMessage || userMessage.trim().length === 0) {
            messages.push(new messages_1.HumanMessage("Revisa los documentos adjuntos y dime si está todo en orden o si necesitas algo más."));
        }
        let finalAiResponse = "";
        try {
            const response = await llmWithTools.invoke(messages);
            if (response.tool_calls && response.tool_calls.length > 0) {
                console.log(`[GrantJustificationAgent] Herramienta invocada por el modelo: ${response.tool_calls[0].name}`);
                for (const toolCall of response.tool_calls) {
                    if (toolCall.name === 'generar_excel_justificacion') {
                        // Invocamos la tool manualmente pasándole los args
                        const toolResult = await generarExcelTool.invoke(toolCall.args);
                        console.log(`[GrantJustificationAgent] Resultado Tool:`, toolResult);
                        finalAiResponse = "He procesado los datos, añadido la nueva información y generado el archivo Excel actualizado con los Anexos 2 y 3. Aquí tienes el documento listo para descargar:";
                    }
                }
            }
            else {
                finalAiResponse = response.content;
            }
        }
        catch (e) {
            console.error("[GrantJustificationAgent] Error llamando a Gemini:", e);
            finalAiResponse = "Ocurrió un error procesando la documentación: " + e.message;
        }
        // 6. Preparar Respuesta
        const returnObj = {
            ai_response: finalAiResponse,
            status: 'success',
            specialist: 'grant_justification',
            timestamp: new Date().toISOString()
        };
        // Si la Tool fue llamada y construyó un Buffer
        if (generatedBuffer) {
            returnObj.generated_files = [
                {
                    filename: excelFileName || 'Anexos_Subvencion.xlsx',
                    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    buffer: generatedBuffer
                }
            ];
        }
        return returnObj;
    }
}
exports.GrantJustificationAgent = GrantJustificationAgent;
exports.grantJustificationAgent = new GrantJustificationAgent();
