"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.grantJustificationAgent = exports.GrantJustificationAgent = void 0;
const google_genai_1 = require("@langchain/google-genai");
const tools_1 = require("@langchain/core/tools");
const messages_1 = require("@langchain/core/messages");
const zod_1 = require("zod");
const excel_editor_1 = require("./excel_editor");
const meta_memory_service_1 = require("../../meta-memory.service");
class GrantJustificationAgent {
    async run(userMessage, files, sessionId, docContext) {
        // --- 🧬 FALLBACK DE MEMORIA (DOC CONTEXT) ---
        // Si por algún error de sincronización el contexto llega vacío, lo recuperamos de la BD
        let finalDocContext = docContext;
        if (!finalDocContext || finalDocContext.length < 10) {
            console.log(`[GrantJustifier] 🔄 Contexto vacío o corto detectado. Intentando fallback desde BD...`);
            finalDocContext = await meta_memory_service_1.metaMemoryService.getDocumentContext(sessionId);
        }
        console.log(`[GrantJustifier] 🧠 MEMORY CHECK: Contexto final tiene ${finalDocContext.length} caracteres.`);
        let generatedBuffer = null;
        let excelFileName = '';
        // 1. Recuperar archivos de la sesión (Caché + Actuales)
        const sessionFiles = meta_memory_service_1.metaMemoryService.getSessionFiles(sessionId);
        const allFiles = [...sessionFiles];
        // Si han venido archivos nuevos en esta petición Multer, los añadimos (evitando duplicados)
        if (files && files.length > 0) {
            for (const f of files) {
                if (!allFiles.some(af => af.originalname === f.originalname)) {
                    allFiles.push(f);
                }
            }
        }
        const excelFiles = allFiles.filter(f => f.originalname.toLowerCase().endsWith('.xlsx') ||
            f.originalname.toLowerCase().endsWith('.xls'));
        // 2. Definición de Herramienta Genérica
        const actualizarHojaExcelTool = new tools_1.DynamicStructuredTool({
            name: 'actualizar_hoja_excel',
            description: 'Añade nuevas filas a un archivo Excel existente. Puede añadir al final (por defecto) o insertar en una posición específica desplazando las filas existentes.',
            schema: zod_1.z.object({
                targetFilename: zod_1.z.string().describe('Nombre del archivo Excel que se usará como base/plantilla.'),
                sheetName: zod_1.z.string().optional().describe('Nombre de la pestaña a modificar.'),
                newRows: zod_1.z.array(zod_1.z.any()).describe('Lista de objetos con los datos a añadir.'),
                insertionMode: zod_1.z.enum(['append', 'after_value', 'at_index']).optional().default('append').describe('Modo de inserción. "append" añade al final, "after_value" busca un texto (ej: un ID de gasto) e inserta debajo.'),
                referenceValue: zod_1.z.any().optional().describe('El valor a buscar si el modo es "after_value" o el índice de fila si es "at_index".')
            }),
            func: async (args) => {
                try {
                    const { targetFilename, sheetName, newRows, insertionMode, referenceValue } = args;
                    const templateFile = allFiles.find(f => f.originalname.toLowerCase() === targetFilename.toLowerCase());
                    if (!templateFile) {
                        return `Error: No encuentro el archivo "${targetFilename}".`;
                    }
                    generatedBuffer = (0, excel_editor_1.editExcel)(templateFile.buffer, sheetName || null, newRows, { mode: insertionMode, value: referenceValue });
                    excelFileName = `Actualizado_${targetFilename}`;
                    return `He procesado los datos y actualizado el archivo "${targetFilename}" con éxito.`;
                }
                catch (error) {
                    return `Error técnico editando el Excel: ${error.message}`;
                }
            }
        });
        const tools = [actualizarHojaExcelTool];
        // 3. Configurar LLM
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey)
            throw new Error('GEMINI_API_KEY no configurado.');
        const llm = new google_genai_1.ChatGoogleGenerativeAI({
            apiKey,
            model: "gemini-2.0-flash",
            temperature: 0
        }).bindTools(tools);
        // 4. Prompt Adaptativo
        const hasExcel = excelFiles.length > 0;
        const promptText = `Eres un Auditor experto y Asistente de Gestión de Datos. Tu misión es analizar facturas (PDF) y compararlas con tablas de datos (Excel).

CAPACIDADES:
1. **Auditoría:** Comprueba si los datos de las facturas coinciden con lo registrado en el Excel. Alerta de discrepancias.
2. **Edición Flexible y Precisa:** Puedes añadir filas a CUALQUIER tabla usando "actualizar_hoja_excel".
   - **IMPORTANTE:** Ya no estás limitado a insertar al final. Puedes insertar en cualquier posición.
   - Si el usuario te pide poner un gasto "después del G67", busca ese valor usando \`insertionMode: "after_value"\` y \`referenceValue: "G67"\`. El sistema desplazará las filas inferiores automáticamente.
   - Recuerda usar las "keys" EXACTAS de las cabeceras que veas en el contexto del Excel.

DIRECTRICES:
- Si el usuario subió un Excel, léelo y detecta sus columnas. Úsalas para mapear los datos de las facturas.
- Si no hay un Excel base, solicita uno o una plantilla.
- Sé profesional, claro y directo en español.

CONTEXTO ACTUAL:
${finalDocContext || 'No hay documentos cargados.'}
${!hasExcel ? '\n⚠️ NOTA: No hay ningún Excel de base en la sesión. Si el usuario pide registrar algo, solicítale el archivo primero.' : ''}
`;
        // 5. Invocación
        const history = await meta_memory_service_1.metaMemoryService.getMetaChatHistory(sessionId);
        const messages = [
            new messages_1.SystemMessage(promptText),
            ...history
        ];
        if (!userMessage || userMessage.trim().length === 0) {
            messages.push(new messages_1.HumanMessage("Analiza los documentos y dime si hay algo que deba saber o si necesitas que actualice alguna tabla con las facturas enviadas."));
        }
        let finalAiResponse = "";
        try {
            const response = await llm.invoke(messages);
            if (response.tool_calls && response.tool_calls.length > 0) {
                for (const toolCall of response.tool_calls) {
                    if (toolCall.name === 'actualizar_hoja_excel') {
                        const toolResult = await actualizarHojaExcelTool.invoke(toolCall.args);
                        console.log(`[GrantJustifier] Tool Result:`, toolResult);
                        finalAiResponse = typeof toolResult === 'string' ? toolResult : String(toolResult?.content || toolResult);
                    }
                }
            }
            else {
                finalAiResponse = response.content;
            }
        }
        catch (e) {
            console.error("[GrantJustifier] Error:", e);
            finalAiResponse = "Ocurrió un error en el procesamiento: " + e.message;
        }
        // 6. Respuesta
        const returnObj = {
            ai_response: finalAiResponse,
            status: 'success',
            specialist: 'grant_justification',
            timestamp: new Date().toISOString()
        };
        if (generatedBuffer) {
            returnObj.generated_files = [
                {
                    filename: excelFileName,
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
