import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { BaseMetaSpecialist } from '../../base-specialist';
import { MetaContext, MetaResult, MetaStreamEvent } from '../../meta.types';

/**
 * 🔍 AGENTE ESPECIALISTA: DOCUMENT COMPARATOR (Comparador de Documentos)
 */
export class DocComparatorAgent extends BaseMetaSpecialist {

    protected getName(): string { return 'DocComparator'; }

    protected async *execute(context: MetaContext): AsyncGenerator<MetaStreamEvent, any, unknown> {
        const { userMessage, files, sessionId, docContext, model: modelName } = context;
        console.log(`\n[DocComparator] ▶ Starting analysis. Files: ${files.length}, Session: ${sessionId}`);

        try {
            const apiKey = process.env.OPENAI_API_KEY;
            const model = new ChatOpenAI({
                apiKey,
                model: 'gpt-4o',
                temperature: 0.1
            });

            yield { type: 'status', message: 'Analizando metadatos de los documentos adjuntos...' };
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

            // Añadir Imágenes inline (OpenAI Vision). PDFs se saltan porque OpenAI no los lee como buffer de imagen,
            // pero ya tenemos su texto en docContext gracias al processDocuments()
            for (const pdf of categorized.pdfs) {
                console.log(`[DocComparator] Saltando PDF binario para OpenAI Vision: ${pdf.originalname} (Ya leído en texto).`);
            }
            for (const img of categorized.images) {
                const buffer = img.buffer || (img.arrayBuffer ? Buffer.from(await img.arrayBuffer()) : null);
                if (buffer) {
                    const mimeType = img.originalname.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
                    contentParts.push({ type: 'image_url', image_url: { url: `data:${mimeType};base64,${buffer.toString('base64')}` } });
                }
            }

            const messages = [
                new SystemMessage(activeSystemPrompt),
                ...context.history, // 🔒 Inyectado automáticamente
                new HumanMessage({ content: contentParts })
            ];

            yield { type: 'status', message: 'Comparando contenido mediante IA...' };
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
