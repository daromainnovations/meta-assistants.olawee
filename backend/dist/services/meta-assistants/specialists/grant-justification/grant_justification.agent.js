"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.grantJustificationAgent = exports.GrantJustificationAgent = void 0;
// @ts-nocheck
const google_genai_1 = require("@langchain/google-genai");
const prompts_1 = require("@langchain/core/prompts");
// @ts-ignore
const agents_1 = require("langchain/agents");
const tools_1 = require("@langchain/core/tools");
const zod_1 = require("zod");
const excel_generator_1 = require("./excel_generator");
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
                    refGasto: zod_1.z.string().describe('Ej: G28'),
                    numFactura: zod_1.z.string(),
                    proveedor: zod_1.z.string(),
                    partida: zod_1.z.string(),
                    actividad: zod_1.z.string(),
                    fecha: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]),
                    concepto: zod_1.z.string(),
                    baseImponible: zod_1.z.number(),
                    iva: zod_1.z.number(),
                    retencion: zod_1.z.number().default(0),
                    total: zod_1.z.number(),
                    importeImputado: zod_1.z.number(),
                    observacionesFactura: zod_1.z.string().optional().default(''),
                    refJustificante: zod_1.z.string().describe('Ej: J28'),
                    fechaPago: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]),
                    importePagado: zod_1.z.number(),
                    observacionesPago: zod_1.z.string().optional().default('')
                })).describe('Array de objetos representando cada nueva línea que irá al Anexo 2'),
                nuevosJustificantes: zod_1.z.array(zod_1.z.object({
                    refJustificante: zod_1.z.string().describe('Ej: J28'),
                    refGastoVinculado: zod_1.z.string().describe('Ej: G28'),
                    partida: zod_1.z.string(),
                    actividad: zod_1.z.string(),
                    tipoDocumento: zod_1.z.string().default('TRANSFERENCIA'),
                    descripcion: zod_1.z.string(),
                    fecha: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]),
                    observaciones: zod_1.z.string().optional().default('')
                })).describe('Array de objetos representando la justificación de pago (Anexo 3)')
            }),
            func: async (args) => {
                try {
                    const { filename, nuevosGastos, nuevosJustificantes } = args;
                    generatedBuffer = (0, excel_generator_1.generateExcelBuffer)(nuevosGastos, nuevosJustificantes);
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
        const promptText = `Eres un auditor experto en Subvenciones Españolas. Tu nombre es "Asistente Justificador".
Recibes facturas en PDF y hojas Excel (Anexo 2 de gastos, Anexo 3 de justificantes y resúmenes).
Tu trabajo es responder a la petición del usuario, comprobando si las facturas emitidas por proveedores coinciden con los Excels,
o usando la herramienta "generar_excel_justificacion" para crear los Anexos 2 y 3 si el usuario lo exige.
Comunícate siempre en español claro y profesional.
Alerta de incongruencias (IVA que no cuadra, facturas sin justificante).

{document_context}
`;
        const prompt = prompts_1.ChatPromptTemplate.fromMessages([
            ["system", promptText],
            ["user", "{input}"],
            new prompts_1.MessagesPlaceholder("agent_scratchpad"),
        ]);
        const agent = (0, agents_1.createToolCallingAgent)({
            llm,
            tools,
            prompt,
        });
        const agentExecutor = new agents_1.AgentExecutor({
            agent,
            tools,
            verbose: true // Ideal para ver los logs en el backend de servidor
        });
        // 5. Ejecutar Agente
        console.log(`[GrantJustificationAgent] Iniciando Invocación. Sesión: ${sessionId}`);
        const safeInput = userMessage && userMessage.trim().length > 0
            ? userMessage
            : "Revisa los documentos adjuntos y dime si está todo en orden o si necesitas algo más.";
        const agentResult = await agentExecutor.invoke({
            input: safeInput,
            document_context: docContext || '⚠️ AVISO: No hay documentos disponibles aún. Solicita al usuario el Excel de gastos y las facturas.'
        });
        // 6. Preparar Respuesta
        const returnObj = {
            ai_response: agentResult.output,
            status: 'success',
            specialist: 'grant_justification',
            timestamp: new Date().toISOString()
        };
        // Si la Tool fue llamada y construyó un Buffer, lo empaquetamos aquí en Raw Data (Capa limpia de Arquitectura)
        if (generatedBuffer) {
            returnObj.generated_files = [
                {
                    filename: excelFileName || 'Anexos_Subvencion.xlsx',
                    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    // base64: generatedBuffer.toString('base64') -> (Si preferis base64 lo podéis descomentar)
                    buffer: generatedBuffer // Lo dejamos como raw buffer para que OLAWEE haga de las suyas (ej. Supabase)
                }
            ];
        }
        return returnObj;
    }
}
exports.GrantJustificationAgent = GrantJustificationAgent;
exports.grantJustificationAgent = new GrantJustificationAgent();
