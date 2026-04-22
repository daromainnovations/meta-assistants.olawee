import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { BaseMetaSpecialist } from '../../base-specialist';
import { MetaContext, MetaResult, MetaStreamEvent } from '../../meta.types';

/**
 * 🔍 AGENTE ESPECIALISTA: INVOICE CHECKER (Verificador de Facturas)
 */
export class InvoiceCheckerAgent extends BaseMetaSpecialist {

    protected getName(): string { return 'InvoiceChecker'; }

    /**
     * Punto de entrada principal (reemplaza a run)
     */
    protected async *execute(context: MetaContext): AsyncGenerator<MetaStreamEvent, any, unknown> {
        const { userMessage, files, sessionId, docContext, model: modelName } = context;
        console.log(`\n[InvoiceChecker] ▶ Starting audit. Files: ${files.length}, Session: ${sessionId}`);

        try {
            const apiKey = process.env.GEMINI_API_KEY;
            const model = new ChatGoogleGenerativeAI({
                apiKey,
                model: modelName || 'gemini-2.0-flash',
                temperature: 0.1
            });

            const categorized = this.categorizeFiles(files);
            const invoiceFiles = [...categorized.pdfs, ...categorized.images];

            // Prompt dinámico según si hay archivos nuevos
            const isAuditMode = files.length > 0;
            const INVOICE_CHECKER_SYSTEM_PROMPT = `Tu única misión es comparar los datos de las facturas contra el Excel provisto... [OMITIDO POR BREVEDAD, SE MANTIENE EL ORIGINAL]`;
            const INVOICE_CHECKER_CHAT_PROMPT = `Responde a las preguntas del usuario sobre los documentos ya procesados... [OMITIDO POR BREVEDAD]`;
            const activeSystemPrompt = isAuditMode ? INVOICE_CHECKER_SYSTEM_PROMPT : INVOICE_CHECKER_CHAT_PROMPT;

            const contentParts: any[] = [];
            let textContext = `Instrucción: ${userMessage}\n\n`;

            if (docContext) {
                textContext += `Datos de documentos:\n${docContext}\n\n`;
            } else {
                textContext += '⚠️ No hay documentos previos.\n\n';
            }

            contentParts.push({ type: 'text', text: textContext });

            // PDFs
            for (const f of categorized.pdfs) {
                const buffer = f.buffer || (f.arrayBuffer ? Buffer.from(await f.arrayBuffer()) : null);
                if (buffer) {
                    contentParts.push({ type: 'media', mimeType: 'application/pdf', data: buffer.toString('base64') });
                }
            }
            // Imágenes
            for (const f of categorized.images) {
                const buffer = f.buffer || (f.arrayBuffer ? Buffer.from(await f.arrayBuffer()) : null);
                if (buffer) {
                    contentParts.push({ type: 'image_url', image_url: { url: `data:${f.mimetype};base64,${buffer.toString('base64')}` } });
                }
            }

            const messages = [
                new SystemMessage(activeSystemPrompt),
                ...context.history, // 🔒 History inyectado automáticamente
                new HumanMessage({ content: contentParts })
            ];

            yield { type: 'status', message: 'Auditando facturas y buscando congruencias en el Excel...' };
            const response = await model.invoke(messages);
            const aiResponse = response.content as string;

            return {
                status: 'success',
                ai_response: aiResponse,
                specialist: 'invoice_checker',
                timestamp: new Date().toISOString()
            };

        } catch (error: any) {
            return {
                status: 'error',
                ai_response: `Error procesando facturas: ${error.message}`,
                specialist: 'invoice_checker',
                timestamp: new Date().toISOString()
            };
        }
    }
}

export const invoiceCheckerAgent = new InvoiceCheckerAgent();
