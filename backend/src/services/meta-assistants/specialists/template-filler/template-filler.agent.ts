import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { BaseMetaSpecialist } from '../../base-specialist';
import { MetaContext, MetaResult, MetaStreamEvent } from '../../meta.types';
import { fillDocxTemplate, getDocxStructure } from './docx_filler';
import { fillXlsxTemplate, getXlsxStructure } from './xlsx_filler';

/**
 * 📄 AGENTE ESPECIALISTA: TEMPLATE FILLER (EDICIÓN ESTRUCTURAL)
 */
export class TemplateFillerAgent extends BaseMetaSpecialist {

    protected getName(): string { return 'TemplateFiller'; }

    protected async *execute(context: MetaContext): AsyncGenerator<MetaStreamEvent, any, unknown> {
        const { userMessage, files, sessionId, docContext, metaId, model: modelName } = context;
        console.log(`\n[TemplateFiller] ▶ Modo Estructural: ${sessionId}`);

        try {
            const apiKey = process.env.OPENAI_API_KEY;
            const model = new ChatOpenAI({
                apiKey,
                model: 'gpt-4o-mini',
                temperature: 0
            });

            const modelWithTools = (model as any).bindTools([
                {
                    function_declarations: [
                        {
                            name: "generar_documento_rellenado",
                            description: "Genera el archivo final (.docx o .xlsx). Puedes usar IDs de párrafos (ID_1, ID_2) para máxima precisión.",
                            parameters: {
                                type: "object",
                                properties: {
                                    filename: { type: "string" },
                                    data: {
                                        type: "object",
                                        description: "Objeto key-value. Usa IDs como 'ID_1' para sustituir párrafos específicos."
                                    }
                                },
                                required: ["filename", "data"]
                            }
                        }
                    ]
                }
            ]);

            const categorized = this.categorizeFiles(files);
            const templates = [...categorized.excels, ...categorized.docs];
            const hasPastInstructions = context.history.length > 2;
            const isShortConfirmation = userMessage && (userMessage.toLowerCase() === 'si' || userMessage.toLowerCase() === 'ok' || userMessage.toLowerCase() === 'dale' || userMessage.toLowerCase() === 'hazlo');

            if (templates.length === 0) {
                const restartMsg = hasPastInstructions ? "\n\n⚠️ *Parece que la sesión se ha reiniciado por mantenimiento. Por favor, sube de nuevo la plantilla para continuar.*" : "";
                return {
                    status: 'success',
                    ai_response: "✅ ¡Hola! Soy el procesador de documentos. Sube un archivo Word o Excel para empezar." + restartMsg,
                    specialist: metaId,
                    timestamp: new Date().toISOString()
                };
            }

            // --- FASE 1: DETERMINAR INTENCION ---
            const isInitialAnalysis = (!userMessage || userMessage.trim().length < 5) && !hasPastInstructions && !isShortConfirmation;

            let structureList = "";
            if (isInitialAnalysis) {
                const template = templates[0];
                const buffer = template.buffer || (template.arrayBuffer ? Buffer.from(await template.arrayBuffer()) : null);

                if (buffer) {
                    yield { type: 'status', message: 'Haciendo radiografía estructural de la plantilla...' };
                    if (template.originalname.endsWith('.docx')) {
                        const structure = await getDocxStructure(buffer);
                        structureList = structure.map((b: any) => `[${b.id}] ${b.text.substring(0, 100)}${b.text.length > 100 ? '...' : ''}`).join('\n');
                    } else if (template.originalname.endsWith('.xlsx')) {
                        const structure = await getXlsxStructure(buffer);
                        structureList = structure.map((b: any) => `[${b.id}] ${b.text}`).join('\n');
                    }
                }
            }

            const SYSTEM_PROMPT = `📝 Soy OLAWEE TemplateFiller (MODO DICTADOR). Mi misión es ejecutar cambios estructurales.

            ⚠️ REGLAS INNEGOCIABLES:
            1. SI ES EL PRIMER UPLOAD: Muestra la RADIOGRAFÍA (párrafos en Word o celdas en Excel) y pregunta qué rellenar.
            2. SI HAY CAMBIOS PENDIENTES O CONFIRMACIÓN ("si", "hazlo"): LLAMA A 'generar_documento_rellenado' YA.
            3. USA EL MAPEO DE PRECISIÓN:
               - En WORD: Usa los IDs (ID_1, ID_2...) como claves en 'data'.
               - En EXCEL: Usa las COORDENADAS (A1, B5, C10...) como claves en 'data'.
            4. PROHIBIDO DUDAR: No pidas confirmación si ya tienes una instrucción clara.`;

            const history = context.history.filter(m => m.content && m.content.toString().trim() !== "");

            const messages = [
                ...history,
                new HumanMessage(`${SYSTEM_PROMPT}\n\nPLANTILLA: ${templates[0].originalname}\nRADIOGRAFÍA DEL DOC:\n${structureList || docContext}\n\nInstrucción actual: ${userMessage || 'Analiza y presenta la estructura'}`)
            ];

            yield { type: 'status', message: 'Calculando puntos de anclaje para variables...' };
            const response = await modelWithTools.invoke(messages);

            // 🛠️ MANEJO DE TOOLS + FAILSAFE
            let toolCall: { name: string; args: any } | null = null;
            const resContent = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

            if (response.additional_kwargs?.tool_calls?.length > 0) {
                const tc = response.additional_kwargs.tool_calls[0];
                toolCall = { name: tc.function.name, args: JSON.parse(tc.function.arguments) };
            } else if (resContent.includes('{')) {
                try {
                    const start = resContent.indexOf('{');
                    const end = resContent.lastIndexOf('}');
                    const parsed = JSON.parse(resContent.substring(start, end + 1));
                    if (parsed && Object.keys(parsed).length > 0) {
                        toolCall = { name: 'generar_documento_rellenado', args: { filename: templates[0].originalname, data: parsed.data || parsed } };
                    }
                } catch (e) { }
            }

            if (toolCall && toolCall.name === 'generar_documento_rellenado') {
                const requestedFile = toolCall.args.filename.toLowerCase().replace(/[–—]/g, '-');
                const templateFile = templates.find(t => {
                    const original = t.originalname.toLowerCase().replace(/[–—]/g, '-');
                    return original === requestedFile || original.includes(requestedFile);
                }) || templates[0];

                console.info(`[TemplateFiller] 🚀 Ejecutando llenado para: ${templateFile.originalname}`);
                console.info(`[TemplateFiller] 📦 Datos: ${JSON.stringify(toolCall.args.data)}`);

                const templateBuffer = templateFile.buffer || (templateFile.arrayBuffer ? Buffer.from(await templateFile.arrayBuffer()) : null);
                if (!templateBuffer) throw new Error("No se pudo obtener el buffer de la plantilla.");

                yield { type: 'status', message: 'Insertando datos generados en el documento nativo...' };
                const processedBuffer = templateFile.originalname.toLowerCase().endsWith('.xlsx')
                    ? await fillXlsxTemplate(templateBuffer, toolCall.args.data)
                    : await fillDocxTemplate(templateBuffer, toolCall.args.data);

                const timestamp = new Date().getTime();
                const newFilename = `rellenado_${timestamp}_${templateFile.originalname.replace(/\s+/g, '_')}`;

                return {
                    status: 'success',
                    ai_response: "¡Listo! He generado el documento con los cambios solicitados. {{FILE_LINK}}",
                    specialist: metaId,
                    generated_files: [
                        {
                            filename: newFilename,
                            buffer: processedBuffer,
                            mimetype: templateFile.mimetype
                        }
                    ],
                    timestamp: new Date().toISOString()
                };
            }

            return {
                status: 'success',
                ai_response: resContent,
                specialist: metaId,
                timestamp: new Date().toISOString()
            };

        } catch (error: any) {
            console.error(`[TemplateFiller] ERROR:`, error.message);
            throw error;
        }
    }
}

export const templateFillerAgent = new TemplateFillerAgent();
