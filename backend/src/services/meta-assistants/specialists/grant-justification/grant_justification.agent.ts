import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { metaMemoryService } from '../../meta-memory.service';
import { BaseMetaSpecialist } from '../../base-specialist';
import { MetaContext, MetaResult, MetaStreamEvent } from '../../meta.types';
import { extractDataFromFiles, InvoiceData } from './document_parser';
import { editExcel } from './excel_editor';
import * as fs from 'fs';
import * as path from 'path';

const DEBUG_LOG = path.join(process.cwd(), 'justification_debug.log');
const writeLog = (msg: string) => {
  try { fs.appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] [AGENT] ${msg}\n`); } catch { }
};

// ============================================================
// ⚖️ SYSTEM PROMPT — AUDITOR PRO DE SUBVENCIONES
// ============================================================
const SYSTEM_PROMPT = `⚖️ Eres OLAWEE GrantJustifier, el auditor especializado en justificación de subvenciones públicas (CDTI, AEI, fondos europeos, etc.).

## TUS CAPACIDADES
1. **Extracción de justificantes**: Lees facturas, tickets y recibos (PDF/imagen) y extraes todos los datos relevantes.
2. **Registro en Excel**: Insertas los gastos extraídos en la hoja de seguimiento Excel del proyecto, mapeando campos con inteligencia semántica.
3. **Auditoría de coherencia**: Detectas y alertas de descuadres (IVA incorrecto, fechas fuera de período, importes no coincidentes).

## REGLAS CRÍTICAS
- SIEMPRE menciona qué archivos has procesado y qué datos has extraído.
- Si detectas una DISCREPANCIA (ej: "el PDF dice 1.210€ pero el usuario quiere imputar 1.000€"), AVISA claramente con ⚠️.
- Si un campo no está claro en el justificante, indícalo con "No determinado".
- NUNCA inventes importes. Si no puedes leerlos claramente, dilo.
- Cuando el usuario pide insertar un gasto, usa la herramienta \`actualizar_hoja_excel\` INMEDIATAMENTE con todos los datos extraídos.
- Confirma siempre los datos que vas a registrar ANTES de ejecutar la herramienta.

## CAMPOS REQUERIDOS PARA SUBVENCIONES
- Nº Factura, Proveedor, Fecha, Concepto, Base Imponible, IVA (%), IVA (€), Total, Importe Imputado, Ref. Justificante de Pago, Fecha de Pago.

## FORMATO DE RESPUESTA
Cuando hayas procesado documentos, responde con:
1. 📄 **Documentos procesados**: lista de archivos y sus datos principales
2. ⚠️ **Alertas detectadas**: discrepancias o datos faltantes  
3. ✅ **Acción recomendada**: qué hacer con los datos extraídos`;

/**
 * ⚖️ AGENTE ESPECIALISTA: GRANT JUSTIFICATION (v2 — Gasto-Pro)
 */
export class GrantJustificationAgent extends BaseMetaSpecialist {

  protected getName(): string { return 'GrantJustifier'; }

  protected async *execute(context: MetaContext): AsyncGenerator<MetaStreamEvent, any, unknown> {
    const { userMessage, files, sessionId, docContext, metaId, model: modelName } = context;
    writeLog(`=== NUEVA EJECUCIÓN | Session: ${sessionId} | Archivos: ${files?.length || 0} ===`);
    console.log(`\n[GrantJustifier] ▶ Starting. Session: ${sessionId} | Files: ${files?.length || 0}`);

    try {
      // ─────────────────────────────────────────
      // PASO 1: EXTRAER DATOS DE ARCHIVOS (OCR)
      // ─────────────────────────────────────────
      let extractedContext = '';
      const invoicesExtracted: { filename: string; data: InvoiceData }[] = [];

      if (files && files.length > 0) {
        writeLog(`Extrayendo datos de ${files.length} archivos...`);
        yield { type: 'status', message: `Extrayendo datos analíticos de ${files.length} archivos...` };
        const extractedData = await extractDataFromFiles(files);

        // Construir contexto de facturas
        if (extractedData.pdfTexts.length > 0) {
          extractedContext += `\n\n=== JUSTIFICANTES PROCESADOS (${extractedData.pdfTexts.length}) ===\n`;
          for (const pdf of extractedData.pdfTexts) {
            extractedContext += `\n📄 **${pdf.filename}**\n`;
            if (pdf.structured) {
              const d = pdf.structured;
              invoicesExtracted.push({ filename: pdf.filename, data: d });
              extractedContext += `  - Nº Factura: ${d.numFactura || 'No determinado'}\n`;
              extractedContext += `  - Proveedor: ${d.proveedor || 'No determinado'}\n`;
              extractedContext += `  - Fecha: ${d.fecha || 'No determinado'}\n`;
              extractedContext += `  - Concepto: ${d.concepto || 'No determinado'}\n`;
              extractedContext += `  - Base Imponible: ${d.baseImponible != null ? `${d.baseImponible}€` : 'No determinado'}\n`;
              extractedContext += `  - IVA: ${d.iva != null ? `${d.iva}€` : 'No determinado'}\n`;
              extractedContext += `  - Total: ${d.total != null ? `${d.total}€` : 'No determinado'}\n`;
              writeLog(`  ✅ ${pdf.filename}: Factura ${d.numFactura} | ${d.proveedor} | Total: ${d.total}€`);
            } else {
              extractedContext += `  (Texto plano): ${pdf.text.substring(0, 300)}...\n`;
            }
          }
        }

        if (extractedData.excelData.length > 0) {
          extractedContext += `\n\n=== EXCEL DE SEGUIMIENTO ===\n`;
          for (const excel of extractedData.excelData) {
            extractedContext += `📊 **${excel.filename}**\n`;
            const firstSheet = Object.values(excel.sheets)[0] || [];
            const preview = firstSheet.slice(0, 8).map((row: any) => row.join(' | ')).join('\n');
            extractedContext += preview + '\n';
          }
        }
      }

      // ─────────────────────────────────────────
      // PASO 2: MODELO CON TOOL CALLING
      // ─────────────────────────────────────────
      const apiKey = process.env.GEMINI_API_KEY;
      const model = new ChatGoogleGenerativeAI({
        apiKey,
        model: modelName || 'gemini-2.0-flash',
        temperature: 0
      });

      const modelWithTools = (model as any).bindTools([{
        function_declarations: [{
          name: 'actualizar_hoja_excel',
          description: 'Añade uno o varios registros de gasto a la hoja Excel de seguimiento del proyecto.',
          parameters: {
            type: 'object',
            properties: {
              registro: {
                type: 'object',
                description: 'Datos del gasto a registrar',
                properties: {
                  refGasto: { type: 'string', description: 'Referencia interna del gasto' },
                  numFactura: { type: 'string', description: 'Número de factura' },
                  proveedor: { type: 'string', description: 'Nombre del proveedor' },
                  partida: { type: 'string', description: 'Partida presupuestaria' },
                  actividad: { type: 'string', description: 'Actividad o paquete de trabajo' },
                  fecha: { type: 'string', description: 'Fecha de la factura DD/MM/YYYY' },
                  concepto: { type: 'string', description: 'Descripción del gasto' },
                  baseImponible: { type: 'number', description: 'Base imponible en euros' },
                  iva: { type: 'number', description: 'Importe de IVA en euros' },
                  retencion: { type: 'number', description: 'Retención IRPF en euros' },
                  total: { type: 'number', description: 'Total factura en euros' },
                  importeImputado: { type: 'number', description: 'Importe subvencionable imputado' },
                  observacionesFactura: { type: 'string', description: 'Observaciones sobre la factura' },
                  refJustificante: { type: 'string', description: 'Referencia del justificante de pago' },
                  fechaPago: { type: 'string', description: 'Fecha de pago DD/MM/YYYY' },
                  importePagado: { type: 'number', description: 'Importe efectivamente pagado' },
                  observacionesPago: { type: 'string', description: 'Observaciones sobre el pago' }
                }
              },
              insertionMode: {
                type: 'string',
                enum: ['append', 'after_value', 'at_index', 'update_row'],
                description: 'Modo de operación: append=añadir nueva fila al final, after_value=insertar tras una fila concreta, at_index=posición exacta, update_row=EDITAR una fila EXISTENTE (usar cuando el usuario dice "cambiar", "modificar", "corregir" o "actualizar" un valor de una fila existente)'
              },
              referenceValue: {
                type: 'string',
                description: 'Para update_row: el identificador de la fila a editar (ej: "G63", "FAC-2024-001", nombre del proveedor). Para after_value: valor tras el que insertar la nueva fila.'
              }
            },
            required: ['registro']
          }
        }]
      }]);

      // Construir prompt final
      const effectiveContext = extractedContext || docContext || 'No hay documentos cargados aún.';
      const combinedPrompt = `${userMessage || 'Analiza los documentos adjuntos y dime qué datos puedes extraer.'}\n\n${effectiveContext}`;

      writeLog(`Invocando modelo con prompt de ${combinedPrompt.length} caracteres`);

      const validHistory = context.history.filter(m => m.content && m.content.toString().trim() !== '');
      const messages = [
        new SystemMessage(SYSTEM_PROMPT),
        ...validHistory,
        new HumanMessage(combinedPrompt)
      ];

      yield { type: 'status', message: 'Auditando justificantes con expediente histórico...' };
      const response = await modelWithTools.invoke(messages);

      // ─────────────────────────────────────────
      // PASO 3: MANEJO DE TOOL CALLS
      // ─────────────────────────────────────────
      let toolCall: { name: string; args: any } | null = null;

      if (response.additional_kwargs?.tool_calls?.length > 0) {
        const tc = response.additional_kwargs.tool_calls[0];
        toolCall = { name: tc.function.name, args: JSON.parse(tc.function.arguments) };
      } else if (Array.isArray(response.content)) {
        const callPart = response.content.find((p: any) => p.type === 'functionCall' || p.functionCall);
        if (callPart) {
          const fc = callPart.functionCall || callPart;
          toolCall = { name: fc.name, args: fc.args };
        }
      }

      if (toolCall?.name === 'actualizar_hoja_excel') {
        writeLog(`Tool CALL detectada: actualizar_hoja_excel | Datos: ${JSON.stringify(toolCall.args.registro)}`);
        console.log(`[GrantJustifier] 🛠️ Tool Call: actualizar_hoja_excel`, toolCall.args.registro);

        // Buscar Excel en sesión
        const sessionFiles = metaMemoryService.getSessionFiles(sessionId, metaId);
        const excelFile = sessionFiles.find(f =>
          f.originalname.toLowerCase().endsWith('.xlsx') ||
          f.originalname.toLowerCase().endsWith('.xls')
        );

        if (!excelFile) {
          return {
            status: 'success',
            ai_response: '⚠️ Necesito el archivo Excel de seguimiento para registrar el gasto. Por favor, vuelve a subir el Excel junto con los justificantes.',
            specialist: metaId,
            timestamp: new Date().toISOString()
          };
        }

        const excelBuffer = excelFile.buffer || (excelFile.arrayBuffer ? Buffer.from(await excelFile.arrayBuffer()) : null);
        if (!excelBuffer) {
          return {
            status: 'success',
            ai_response: '⚠️ Error: No se pudo leer el contenido del archivo Excel.',
            specialist: metaId,
            timestamp: new Date().toISOString()
          };
        }

        yield { type: 'status', message: 'Ejecutando integración nativa de datos en Excel...' };
        const editResult = editExcel(
          excelBuffer,
          null,
          [toolCall.args.registro],
          { mode: toolCall.args.insertionMode || 'append', value: toolCall.args.referenceValue }
        );

        const ts = Date.now();
        const isUpdate = toolCall.args.insertionMode === 'update_row';
        const newFilename = `justificado_${ts}_${excelFile.originalname.replace(/\s+/g, '_')}`;
        const actionVerb = isUpdate ? 'actualizado' : 'registrado';
        const rowRef = toolCall.args.referenceValue ? ` (fila: ${toolCall.args.referenceValue})` : '';
        writeLog(`Excel generado: ${newFilename} | Modo: ${toolCall.args.insertionMode || 'append'}`);

        return {
          status: 'success',
          ai_response: `✅ He ${actionVerb} el dato en el Excel de seguimiento${rowRef}.\n\n**Datos ${isUpdate ? 'modificados' : 'insertados'}:**\n- Factura: ${toolCall.args.registro.numFactura || toolCall.args.referenceValue || 'N/A'}\n- Proveedor: ${toolCall.args.registro.proveedor || 'N/A'}\n- Total/Importe: ${toolCall.args.registro.total || toolCall.args.registro.importeImputado || 'N/A'}\n\n{{FILE_LINK}}`,
          specialist: metaId,
          generated_files: [{
            filename: newFilename,
            buffer: editResult,
            mimetype: excelFile.mimetype
          }],
          timestamp: new Date().toISOString()
        };
      }

      // Respuesta de texto normal
      const aiText = typeof response.content === 'string'
        ? response.content
        : Array.isArray(response.content)
          ? response.content.map((p: any) => p.text || '').join('')
          : JSON.stringify(response.content);

      writeLog(`Respuesta texto: ${aiText.substring(0, 200)}...`);

      return {
        status: 'success',
        ai_response: aiText,
        specialist: metaId,
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      writeLog(`❌ ERROR: ${error.message}\n${error.stack}`);
      throw error;
    }
  }
}

export const grantJustificationAgent = new GrantJustificationAgent();
