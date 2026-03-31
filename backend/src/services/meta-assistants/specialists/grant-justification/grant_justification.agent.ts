import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { editExcel } from './excel_editor';
import { metaMemoryService } from '../../meta-memory.service';
import { BaseMetaSpecialist } from '../../base-specialist';
import { MetaContext, MetaResult } from '../../meta.types';

/**
 * ⚖️ AGENTE ESPECIALISTA: GRANT JUSTIFICATION (Justificador de Subvenciones)
 */
export class GrantJustificationAgent extends BaseMetaSpecialist {

    protected getName(): string { return 'GrantJustifier'; }

    /**
     * Lógica pura del Justificador de Subvenciones
     */
    protected async execute(context: MetaContext): Promise<MetaResult> {
        const { userMessage, files, sessionId, docContext, metaId, model: modelName } = context;
        console.log(`\n[GrantJustifier] ▶ Starting logic. Session: ${sessionId}`);

        try {
            const apiKey = process.env.GEMINI_API_KEY;
            const model = new ChatGoogleGenerativeAI({
                apiKey,
                model: modelName || 'gemini-2.0-flash',
                temperature: 0
            }).bind({
                tools: [
                    {
                        name: "actualizar_hoja_excel",
                        description: "Añade información quirúrgica a una hoja Excel permitiendo elegir la posición exacta.",
                        parameters: {
                            type: "object",
                            properties: {
                                registro: { type: "object", properties: {
                                    refGasto: { type: "string" },
                                    numFactura: { type: "string" },
                                    proveedor: { type: "string" },
                                    partida: { type: "string" },
                                    actividad: { type: "string" },
                                    fecha: { type: "string" },
                                    concepto: { type: "string" },
                                    baseImponible: { type: "number" },
                                    iva: { type: "number" },
                                    retencion: { type: "number" },
                                    total: { type: "number" },
                                    importeImputado: { type: "number" },
                                    observacionesFactura: { type: "string" },
                                    refJustificante: { type: "string" },
                                    fechaPago: { type: "string" },
                                    importePagado: { type: "number" },
                                    observacionesPago: { type: "string" }
                                }},
                                insertionMode: { type: "string", enum: ["append", "after_value", "at_index"] },
                                referenceValue: { type: "string" }
                            }
                        }
                    }
                ]
            });

            // Prompt del sistema (Específico)
            const SYSTEM_PROMPT = `⚖️ Soy OLAWEE GrantJustifier.
Mi especialidad es auditar gastos de subvenciones. Sube tu Excel de gastos y los Justificantes (facturas/tickets) en PDF o imagen. Compararé los importes, fechas e IVAs para asegurar que todo cuadra perfectamente.

REGLAS CRÍTICAS: [OMITIDAS POR BREVEDAD]
Si el contexto de documentos llega vacío, informa al usuario y pídele que suba el Excel de seguimiento.`;

            // Construir mensajes incluyendo la historia aislada ya inyectada
            const messages = [
                new SystemMessage(SYSTEM_PROMPT),
                ...context.history, 
                new HumanMessage({
                    content: [
                        { type: 'text', text: `Instrucción: ${userMessage}\n\nContexto Excel/Documentos:\n${docContext || 'No hay documentos cargados aún.'}` }
                    ]
                })
            ];

            const response = await model.invoke(messages);

            // Manejo de Tools
            if (response.additional_kwargs.tool_calls) {
                const toolCall = response.additional_kwargs.tool_calls[0];
                if (toolCall.function.name === 'actualizar_hoja_excel') {
                    const args = JSON.parse(toolCall.function.arguments);
                    console.log(`[GrantJustifier] 🛠️ Tool Call: actualizar_hoja_excel`, args);

                    // Buscar el archivo Excel en la sesión aislada
                    const sessionFiles = metaMemoryService.getSessionFiles(sessionId, metaId);
                    const excelFile = sessionFiles.find(f => f.originalname.toLowerCase().endsWith('.xlsx') || f.originalname.toLowerCase().endsWith('.xls'));

                    if (!excelFile) {
                        return {
                            status: 'success',
                            ai_response: "Lo siento, necesito que vuelvas a subir el archivo Excel para poder editarlo.",
                            specialist: metaId,
                            timestamp: new Date().toISOString()
                        };
                    }

                    const editResult = await editExcel(
                        excelFile.buffer,
                        args.registro,
                        { 
                            mode: args.insertionMode || 'append', 
                            referenceValue: args.referenceValue 
                        }
                    );

                    return {
                        status: 'success',
                        ai_response: "He actualizado el Excel con el nuevo gasto en la posición indicada. Aquí tienes el archivo actualizado:",
                        specialist: metaId,
                        generated_files: [
                            {
                                filename: excelFile.originalname,
                                buffer: editResult.buffer,
                                mimetype: excelFile.mimetype
                            }
                        ],
                        timestamp: new Date().toISOString()
                    };
                }
            }

            return {
                status: 'success',
                ai_response: response.content as string,
                specialist: metaId,
                timestamp: new Date().toISOString()
            };

        } catch (error: any) {
            throw error;
        }
    }
}

export const grantJustificationAgent = new GrantJustificationAgent();
