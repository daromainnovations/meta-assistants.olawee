"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.invoiceCheckerAgent = exports.InvoiceCheckerAgent = void 0;
const messages_1 = require("@langchain/core/messages");
const google_genai_1 = require("@langchain/google-genai");
const xlsx = __importStar(require("xlsx"));
/**
 * ============================================================
 * 🔍 AGENTE ESPECIALISTA: INVOICE CHECKER (Verificador de Facturas)
 * ID: "invoice_checker"
 * ============================================================
 * Este agente recibe un Excel y una o más facturas (PDF / imagen).
 * Su misión es comparar los datos de cada factura contra los
 * registros del Excel e informar de coincidencias y discrepancias.
 *
 * FASE 1: Comparación y auditoría (implementado aquí)
 * FASE 2 (futura): Auto-generación de Excel desde facturas
 * ============================================================
 */
// ============================================================
// 📝 SYSTEM PROMPT — MODO AUDITORÍA (con documentos nuevos)
// ============================================================
const INVOICE_CHECKER_SYSTEM_PROMPT = `Eres OLAWEE InvoiceChecker, un auditor contable automatizado de precisión absoluta.

Tu única misión es comparar los datos de las facturas recibidas contra los registros de la hoja de cálculo Excel provista.

REGLAS DE AUDITORÍA:
1. Del Excel extrae: número de factura, proveedor/emisor, fecha, importe total, concepto (si existe).
2. De cada factura (PDF o imagen) extrae los mismos campos.
3. Compara campo a campo. Sé estricto: diferencias de céntimos o formato de fecha también cuentan.
4. Emite un informe estructurado por factura con: COINCIDE / NO COINCIDE / PENDIENTE (si falta en el Excel).
5. Al final del informe, incluye un resumen ejecutivo con: total revisadas, total OK, total con error, total no localizadas.

FORMATO DE RESPUESTA OBLIGATORIO:
---
## 📊 INFORME DE AUDITORÍA DE FACTURAS

### Factura: [nombre del archivo o número detectado]
- **Número de factura**: [valor factura] vs [valor Excel] → ✅ COINCIDE / ❌ NO COINCIDE / ⚠️ NO LOCALIZADA EN EXCEL
- **Emisor/Proveedor**: [valor factura] vs [valor Excel] → ...
- **Fecha**: [valor factura] vs [valor Excel] → ...
- **Importe Total**: [valor factura] vs [valor Excel] → ...
- **Observaciones**: [cualquier anomalía o campo faltante]

---
## 📋 RESUMEN EJECUTIVO
- Total facturas revisadas: X
- ✅ Correctas (100% coincidencia): X
- ❌ Con discrepancias: X
- ⚠️ No localizadas en Excel: X
---

No hagas suposiciones. Si un dato no es legible, indícalo claramente como "NO LEGIBLE".
Si te falta el Excel o te falta la factura, pide exactamente qué archivo falta.`;
// ============================================================
// 💬 SYSTEM PROMPT — MODO CONVERSACIONAL (preguntas de seguimiento)
// ============================================================
const INVOICE_CHECKER_CHAT_PROMPT = `Eres OLAWEE InvoiceChecker, un auditor contable especializado.
Tienes acceso al contenido completo de los documentos (Excel y facturas) que el usuario ha proporcionado en esta sesión.
Tu especialidad es la auditoría contable: comparación de facturas vs registros, detección de errores, identificación de datos en el Excel.

Responde de forma directa y concisa a las preguntas del usuario sobre esos documentos.
Por ejemplo: puedes indicar en qué fila del Excel aparece una factura, cuál es su importe, si hay alguna discrepancia, quién es el proveedor, etc.
Solo responde sobre temas contables y de los documentos proporcionados.
No uses el formato de informe estructurado a menos que el usuario lo pida explícitamente — responde en lenguaje natural.`;
// ============================================================
// Modelo fijo para este agente
// ============================================================
const INVOICE_CHECKER_MODEL = 'gemini-2.0-flash';
class InvoiceCheckerAgent {
    /**
     * Extrae todas las filas de un Excel como texto estructurado.
     * Usa cellDates:true para que las fechas salgan como Date, no como serial numérico.
     */
    extractExcelData(buffer) {
        try {
            const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
            const lines = ['[CONTENIDO DEL EXCEL]'];
            for (const sheetName of workbook.SheetNames) {
                const sheet = workbook.Sheets[sheetName];
                const rows = xlsx.utils.sheet_to_json(sheet, { raw: false }); // raw:false aplica formato de celda
                lines.push(`\n--- Hoja: ${sheetName} (${rows.length} registros) ---`);
                rows.forEach((row, i) => {
                    lines.push(`Registro ${i + 1}: ${JSON.stringify(row)}`);
                });
            }
            return lines.join('\n');
        }
        catch (err) {
            return `[ERROR leyendo Excel: ${err.message}]`;
        }
    }
    /**
     * Prepara un PDF para enviarlo a Gemini como inline media (base64).
     * Usa el formato de LangChain { type: "media" } que se traduce automáticamente
     * al formato nativo de Google API (inlineData).
     * Gemini 2.0 Flash lee PDFs nativamente, incluyendo PDFs escaneados.
     */
    buildPdfInlinePart(buffer, filename) {
        return {
            type: 'media',
            mimeType: 'application/pdf',
            data: buffer.toString('base64')
        };
    }
    /**
     * Punto de entrada principal del agente
     */
    async run(userMessage, files, sessionId, docContext) {
        console.log(`\n[InvoiceChecker] ▶ Starting audit. Files: ${files.length}, Session: ${sessionId}`);
        try {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey)
                throw new Error('GEMINI_API_KEY no configurado en .env');
            const model = new google_genai_1.ChatGoogleGenerativeAI({
                apiKey,
                model: INVOICE_CHECKER_MODEL,
                temperature: 0.1
            });
            // Separar archivos por tipo
            const excelFiles = files.filter(f => f.mimetype.includes('spreadsheet') ||
                f.mimetype.includes('excel') ||
                f.originalname.endsWith('.xlsx') ||
                f.originalname.endsWith('.xls') ||
                f.originalname.endsWith('.csv'));
            const invoiceFiles = files.filter(f => f.mimetype === 'application/pdf' ||
                f.mimetype.startsWith('image/'));
            console.log(`[InvoiceChecker] Excel files: ${excelFiles.length}, Invoice files: ${invoiceFiles.length}`);
            // ============================================================
            // El docContext ya incluye el histórico y los nuevos archivos texto (procesados por webhook/documentService)
            // ============================================================
            // ============================================================
            // 🤖 CONSTRUIR EL MENSAJE PARA GEMINI
            // ============================================================
            const contentParts = [];
            // ℹ️ Determinar el MODO:
            // — AUDITORÍA: hay archivos nuevos en este mensaje → usar prompt de informe estructurado
            // — CONVERSACIONAL: solo texto, el usuario pregunta sobre datos ya procesados
            const isAuditMode = files.length > 0 || invoiceFiles.some(f => f.mimetype.startsWith('image/'));
            const activeSystemPrompt = isAuditMode ? INVOICE_CHECKER_SYSTEM_PROMPT : INVOICE_CHECKER_CHAT_PROMPT;
            console.log(`[InvoiceChecker] Mode: ${isAuditMode ? '🔍 AUDIT' : '💬 CHAT'}`);
            let textContext = '';
            if (userMessage) {
                textContext += `Pregunta/Instrucción del usuario: ${userMessage}\n\n`;
            }
            if (docContext) {
                textContext += `Datos de documentos disponibles:\n${docContext}\n\n`;
            }
            else {
                textContext += '⚠️ AVISO: No se han proporcionado documentos aún (ni Excel ni facturas). Por favor solicita ambos al usuario.\n\n';
            }
            if (isAuditMode) {
                textContext += '\nAhora realiza la auditoría completa según tus reglas.';
            }
            contentParts.push({ type: 'text', text: textContext });
            // PDFs → inline para que Gemini los lea nativamente (funciona con PDFs escaneados)
            for (const invFile of invoiceFiles.filter(f => f.mimetype === 'application/pdf')) {
                console.log(`[InvoiceChecker] 📄 Attaching PDF inline for Gemini: ${invFile.originalname}`);
                contentParts.push(this.buildPdfInlinePart(invFile.buffer, invFile.originalname));
                contentParts.push({ type: 'text', text: `(El documento anterior es la factura: ${invFile.originalname})` });
            }
            // Imágenes → Gemini Vision
            const imageInvoices = invoiceFiles.filter(f => f.mimetype.startsWith('image/'));
            for (const imgFile of imageInvoices) {
                console.log(`[InvoiceChecker] Adding image to vision: ${imgFile.originalname}`);
                contentParts.push({
                    type: 'image_url',
                    image_url: {
                        url: `data:${imgFile.mimetype};base64,${imgFile.buffer.toString('base64')}`
                    }
                });
                contentParts.push({
                    type: 'text',
                    text: `(La imagen anterior es la factura: ${imgFile.originalname})`
                });
            }
            // Invocar al modelo
            const messages = [
                new messages_1.SystemMessage(activeSystemPrompt),
                new messages_1.HumanMessage({ content: contentParts })
            ];
            console.log(`[InvoiceChecker] Invoking ${INVOICE_CHECKER_MODEL} with ${contentParts.length} content parts...`);
            const response = await model.invoke(messages);
            const auditReport = response.content;
            console.log(`[InvoiceChecker] ✅ Audit complete. Report length: ${auditReport.length} chars`);
            return {
                status: 'success',
                type: 'invoice_audit_response',
                specialist: 'invoice_checker',
                model_used: INVOICE_CHECKER_MODEL,
                files_analyzed: {
                    excel: excelFiles.map(f => f.originalname),
                    invoices: invoiceFiles.map(f => f.originalname)
                },
                ai_response: auditReport,
                context_used: docContext.length > 0,
                timestamp: new Date().toISOString()
            };
        }
        catch (error) {
            console.error(`[InvoiceChecker] ❌ Error:`, error.message);
            return {
                status: 'error',
                specialist: 'invoice_checker',
                error: error.message,
                message: `Error en el verificador de facturas: ${error.message}`,
                timestamp: new Date().toISOString()
            };
        }
    }
}
exports.InvoiceCheckerAgent = InvoiceCheckerAgent;
exports.invoiceCheckerAgent = new InvoiceCheckerAgent();
