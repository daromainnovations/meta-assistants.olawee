import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { BaseMetaSpecialist } from '../../base-specialist';
import { MetaContext, MetaResult } from '../../meta.types';

/**
 * 🔍 AGENTE ESPECIALISTA: DOCUMENT COMPARATOR (Comparador de Documentos)
 */
export class DocComparatorAgent extends BaseMetaSpecialist {

    protected getName(): string { return 'DocComparator'; }

    protected async execute(context: MetaContext): Promise<MetaResult> {
        const { userMessage, files, sessionId, docContext, model: modelName } = context;
        console.log(`\n[DocComparator] ▶ Starting analysis. Files: ${files.length}, Session: ${sessionId}`);

        try {
            const apiKey = process.env.GEMINI_API_KEY;
            const model = new ChatGoogleGenerativeAI({
                apiKey,
                model: modelName || 'gemini-2.0-flash',
                temperature: 0.1
            });

            const categorized = this.categorizeFiles(files);
            const isCompareMode = files.length > 0;
            const DOC_COMPARATOR_SYSTEM_PROMPT = `Eres OLAWEE DocComparator... [OMITIDO POR BREVEDAD]`;
            const DOC_COMPARATOR_CHAT_PROMPT = `Eres OLAWEE DocComparator... [OMITIDO POR BREVEDAD]`;
            const activeSystemPrompt = isCompareMode ? DOC_COMPARATOR_SYSTEM_PROMPT : DOC_COMPARATOR_CHAT_PROMPT;

            const contentParts: any[] = [];
            let textContext = '';
            if (userMessage) {
                textContext += `Instrucción/Pregunta: ${userMessage}\n\n`;
            }

            if (docContext) {
                textContext += `\nCONGRESO DE DOCUMENTOS:\n${docContext}\n\n`;
            }

            contentParts.push({ type: 'text', text: textContext });

            // Añadir PDFs y Imágenes inline (Gemini Pro Vision / 2.0 Flash)
            for (const pdf of categorized.pdfs) {
                const buffer = pdf.buffer || (pdf.arrayBuffer ? Buffer.from(await pdf.arrayBuffer()) : null);
                if (buffer) {
                    contentParts.push({ type: 'media', mimeType: 'application/pdf', data: buffer.toString('base64') });
                }
            }
            for (const img of categorized.images) {
                const buffer = img.buffer || (img.arrayBuffer ? Buffer.from(await img.arrayBuffer()) : null);
                if (buffer) {
                    contentParts.push({ type: 'image_url', image_url: { url: `data:${img.mimetype};base64,${buffer.toString('base64')}` } });
                }
            }

            const messages = [
                new SystemMessage(activeSystemPrompt),
                ...context.history, // 🔒 Inyectado automáticamente
                new HumanMessage({ content: contentParts })
            ];

            const response = await model.invoke(messages);
            const finalReport = response.content as string;

            return {
                status: 'success',
                ai_response: finalReport,
                specialist: 'doc_comparator',
                timestamp: new Date().toISOString()
            };

        } catch (error: any) {
            throw error;
        }
    }
}


export const docComparatorAgent = new DocComparatorAgent();
