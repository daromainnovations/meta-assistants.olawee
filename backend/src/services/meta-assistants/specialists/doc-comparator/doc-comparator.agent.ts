import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import * as xlsx from 'xlsx';
import { getPrisma } from '../../../shared/prisma.service';
import { documentAnalysisService } from '../../../shared/document-analysis.service';

/**
 * ============================================================
 * 🔍 AGENTE ESPECIALISTA: DOCUMENT COMPARATOR (Comparador de Documentos)
 * ID: "doc_comparator"
 * ============================================================
 * Este agente recibe cualquier combinación de documentos (PDF, Excel, Imágenes).
 * Acumula los documentos a lo largo de la sesión.
 * Permite al usuario definir qué quiere comparar mediante su prompt.
 * ============================================================
 */

// ============================================================
// 📝 SYSTEM PROMPT — MODO COMPARACIÓN (con documentos nuevos)
// ============================================================
const DOC_COMPARATOR_SYSTEM_PROMPT = `Eres OLAWEE DocComparator, un analista experto en extracción y comparación de información de documentos.

Tu misión es recibir un conjunto de documentos variados (contratos, presupuestos, facturas, tablas, imágenes, etc.) y compararlos o analizarlos siguiendo estrictamente las instrucciones específicas del usuario.

REGLAS DE ACTUACIÓN:
1. Lee todos los documentos proporcionados (ya sean históricos o nuevos).
2. Analiza los documentos según lo que el usuario haya solicitado explícitamente en su mensaje (ej: "compara los precios", "dime qué cláusulas cambiaron", "encuentra discrepancias").
3. Sé exhaustivo y preciso. Si hay discrepancias, dilo. Si todo coincide, indícalo claramente.
4. Si un dato no es legible o no se encuentra en el documento, indícalo claramente (ej: "Dato no encontrado en el documento X").
5. No asumas información que no esté en los documentos.
6. Estructura tu respuesta de forma clara y profesional, utilizando viñetas y resaltados cuando sea útil para mejorar la lectura.`;

// ============================================================
// 💬 SYSTEM PROMPT — MODO CONVERSACIONAL (preguntas de seguimiento)
// ============================================================
const DOC_COMPARATOR_CHAT_PROMPT = `Eres OLAWEE DocComparator, un asistente experto en análisis documental.
Tienes acceso al contenido completo de todos los documentos que el usuario ha proporcionado en esta sesión.

Responde a las preguntas del usuario basándote EXCLUSIVAMENTE en el contenido de los documentos ya cargados.
No inventes información, si algo no está en los documentos, informa al usuario.
Responde de forma clara, directa y estructurada.`;

// ============================================================
// Modelo fijo para este agente
// ============================================================
const DOC_COMPARATOR_MODEL = 'gemini-2.0-flash';

export class DocComparatorAgent {

    /**
     * Extrae todas las filas de un Excel como texto estructurado.
     */
    private extractExcelData(buffer: Buffer, originalname: string): string {
        try {
            const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
            const lines: string[] = [`\n[CONTENIDO DEL ARCHIVO EXCEL/CSV: ${originalname}]`];

            for (const sheetName of workbook.SheetNames) {
                const sheet = workbook.Sheets[sheetName];
                const rows: any[] = xlsx.utils.sheet_to_json(sheet, { raw: false });
                lines.push(`\n--- Hoja: ${sheetName} (${rows.length} registros) ---`);
                rows.forEach((row, i) => {
                    lines.push(`Registro ${i + 1}: ${JSON.stringify(row)}`);
                });
            }

            return lines.join('\n');
        } catch (err: any) {
            return `[ERROR leyendo archivo tabular ${originalname}: ${err.message}]`;
        }
    }

    /**
     * Prepara un PDF para enviarlo a Gemini como inline media (base64).
     */
    private buildPdfInlinePart(buffer: Buffer, mimeType: string): any {
        return {
            type: 'media',
            mimeType: mimeType,
            data: buffer.toString('base64')
        };
    }

    /**
     * Punto de entrada principal del agente
     */
    async run(
        userMessage: string,
        files: Express.Multer.File[],
        sessionId: string
    ): Promise<any> {
        console.log(`\n[DocComparator] ▶ Starting analysis. Files: ${files.length}, Session: ${sessionId}`);

        try {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) throw new Error('GEMINI_API_KEY no configurado en .env');

            const model = new ChatGoogleGenerativeAI({
                apiKey,
                model: DOC_COMPARATOR_MODEL,
                temperature: 0.1
            });

            // Separar archivos por tipo
            const excelFiles = files.filter(f =>
                f.mimetype.includes('spreadsheet') ||
                f.mimetype.includes('excel') ||
                f.originalname.endsWith('.xlsx') ||
                f.originalname.endsWith('.xls') ||
                f.originalname.endsWith('.csv')
            );

            const pdfFiles = files.filter(f => f.mimetype === 'application/pdf');
            const imageFiles = files.filter(f => f.mimetype.startsWith('image/'));
            const textFiles = files.filter(f => f.mimetype === 'text/plain' || f.originalname.endsWith('.txt'));
            const docxFiles = files.filter(f => f.originalname.endsWith('.docx') || f.originalname.endsWith('.doc'));

            console.log(`[DocComparator] Excels: ${excelFiles.length}, PDFs: ${pdfFiles.length}, Images: ${imageFiles.length}, Texts: ${textFiles.length}, Docs: ${docxFiles.length}`);

            // ============================================================
            // 📂 CARGAR CONTEXTO HISTÓRICO DE DOCUMENTOS DESDE BD
            // ============================================================
            const db = getPrisma();
            let previousDocContext = '';
            try {
                const chatRow = await db.chatsmeta.findFirst({ where: { session_id: sessionId } });
                if (chatRow?.systemprompt_doc && chatRow.systemprompt_doc.trim()) {
                    previousDocContext = chatRow.systemprompt_doc;
                    console.log(`[DocComparator] 📂 Loaded ${previousDocContext.length} chars of previous doc context from DB.`);
                }
            } catch (e: any) {
                console.warn(`[DocComparator] ⚠️ Could not load previous doc context: ${e.message}`);
            }

            // ============================================================
            // 📄 EXTRAER TEXTO DE LOS ARCHIVOS RECIBIDOS EN ESTE MENSAJE
            // ============================================================
            let newDocContext = '';

            // Excel Tabulares
            for (const excelFile of excelFiles) {
                newDocContext += this.extractExcelData(excelFile.buffer, excelFile.originalname) + '\n\n';
            }

            // Textos planos
            for (const textFile of textFiles) {
                newDocContext += `\n[CONTENIDO DEL TEXTO PLANO: ${textFile.originalname}]\n`;
                newDocContext += textFile.buffer.toString('utf-8') + '\n\n';
            }

            // Archivos Word (.doc, .docx)
            for (const docx of docxFiles) {
                newDocContext += `\n[CONTENIDO DEL DOCUMENTO WORD: ${docx.originalname}]\n`;
                try {
                    const text = await documentAnalysisService.transcribeDoc(docx.buffer);
                    newDocContext += text + '\n\n';
                } catch (e: any) {
                    newDocContext += `[ERROR leyendo documento Word: ${e.message}]\n\n`;
                }
            }

            // PDFs y Photos → indicamos en el contexto que se han cargado y se envían inline
            for (const pdf of pdfFiles) {
                newDocContext += `[DOCUMENTO PDF ADJUNTO: ${pdf.originalname} — leído directamente por la IA]\n\n`;
            }
            for (const img of imageFiles) {
                newDocContext += `[IMAGEN ADJUNTA: ${img.originalname} — leída directamente por la IA]\n\n`;
            }

            // ============================================================
            // 🔗 COMBINAR CONTEXTO HISTÓRICO + NUEVOS DOCUMENTOS
            // ============================================================
            let combinedDocContext = '';
            if (previousDocContext && newDocContext.trim()) {
                combinedDocContext = `[Documentos cargados previamente]\n${previousDocContext}\n\n---\n\n[Nuevos documentos adjuntados ahora]\n${newDocContext}`;
                console.log(`[DocComparator] 🔗 Combined: prev(${previousDocContext.length}) + new(${newDocContext.length}) chars.`);
            } else if (newDocContext.trim()) {
                combinedDocContext = newDocContext;
            } else if (previousDocContext) {
                combinedDocContext = previousDocContext;
                console.log(`[DocComparator] 📂 Using only previous context.`);
            }

            // ============================================================
            // 💾 PERSISTIR EL CONTEXTO ACUMULADO EN BD
            // Solo cuando hay archivos nuevos en este mensaje
            // ============================================================
            if (newDocContext.trim() && sessionId) {
                const docToSave = combinedDocContext.trim();
                db.chatsmeta.findFirst({ where: { session_id: sessionId } })
                    .then((existing: any) => {
                        if (existing) {
                            return db.chatsmeta.update({
                                where: { id: existing.id },
                                data: { systemprompt_doc: docToSave, updated_at: new Date() }
                            });
                        } else {
                            return db.chatsmeta.create({
                                data: { session_id: sessionId, systemprompt_doc: docToSave, titulo: sessionId, meta_id: 'doc_comparator' }
                            });
                        }
                    })
                    .then(() => console.log(`[DocComparator] 💾 Accumulated doc context saved to DB for session "${sessionId}"`))
                    .catch((e: any) => console.error(`[DocComparator] ❌ Error saving to DB: ${e.message}`));
            }

            // ============================================================
            // 🤖 CONSTRUIR EL MENSAJE PARA GEMINI
            // ============================================================
            const contentParts: any[] = [];

            // ℹ️ Determinar el MODO:
            // Si hay mensaje con instrucción de qué comparar Y/O nuevos archivos -> COMPARISON MODE
            // Si no hay nuevos archivos y solo hay pregunta -> CHAT MODE
            const hasNewFiles = files.length > 0;
            const isCompareMode = hasNewFiles;
            const activeSystemPrompt = isCompareMode ? DOC_COMPARATOR_SYSTEM_PROMPT : DOC_COMPARATOR_CHAT_PROMPT;
            console.log(`[DocComparator] Mode: ${isCompareMode ? '🔍 COMPARE' : '💬 CHAT'}`);

            let textContext = '';
            if (userMessage) {
                textContext += `Instrucción/Pregunta del usuario: ${userMessage}\n\n`;
            } else if (isCompareMode) {
                textContext += `El usuario ha adjuntado nuevos documentos pero no ha dado una instrucción específica. Procede a analizarlos y compararlos con los documentos anteriores en busca de discrepancias o similitudes relevantes, informando los hallazgos.\n\n`;
            }

            if (combinedDocContext) {
                textContext += `\n======================================================\n`;
                textContext += `HISTORIAL Y CONTEXTO DE DOCUMENTOS DE LA SESIÓN:\n`;
                textContext += `======================================================\n`;
                textContext += `${combinedDocContext}\n======================================================\n\n`;
            } else {
                textContext += '⚠️ AVISO: No se han proporcionado documentos aún. Solicita al usuario que adjunte los archivos a comparar.\n\n';
            }

            contentParts.push({ type: 'text', text: textContext });

            // Añadir PDFs inline
            for (const pdf of pdfFiles) {
                console.log(`[DocComparator] 📄 Attaching PDF inline: ${pdf.originalname}`);
                contentParts.push(this.buildPdfInlinePart(pdf.buffer, pdf.mimetype));
                contentParts.push({ type: 'text', text: `(El documento anterior es el PDF: ${pdf.originalname})` });
            }

            // Añadir imágenes inline
            for (const img of imageFiles) {
                console.log(`[DocComparator] 🖼️ Adding image inline: ${img.originalname}`);
                contentParts.push({
                    type: 'image_url',
                    image_url: {
                        url: `data:${img.mimetype};base64,${img.buffer.toString('base64')}`
                    }
                });
                contentParts.push({
                    type: 'text',
                    text: `(La imagen anterior es: ${img.originalname})`
                });
            }

            // Invocar al modelo
            const messages = [
                new SystemMessage(activeSystemPrompt),
                new HumanMessage({ content: contentParts })
            ];

            console.log(`[DocComparator] Invoking ${DOC_COMPARATOR_MODEL}...`);
            const response = await model.invoke(messages);
            const finalReport = response.content as string;

            console.log(`[DocComparator] ✅ Analysis complete. Report length: ${finalReport.length} chars`);

            return {
                status: 'success',
                type: 'doc_comparator_response',
                specialist: 'doc_comparator',
                model_used: DOC_COMPARATOR_MODEL,
                files_analyzed: files.map(f => f.originalname),
                ai_response: finalReport,
                context_used: combinedDocContext.length > 0,
                timestamp: new Date().toISOString()
            };

        } catch (error: any) {
            console.error(`[DocComparator] ❌ Error:`, error.message);
            return {
                status: 'error',
                specialist: 'doc_comparator',
                error: error.message,
                message: `Error en el comparador de documentos: ${error.message}`,
                timestamp: new Date().toISOString()
            };
        }
    }
}

export const docComparatorAgent = new DocComparatorAgent();
