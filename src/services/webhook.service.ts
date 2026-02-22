import { chatHandlerService } from './chat/chat-handler.service';
import { documentService } from './shared/document.service';
import { titleGeneratorAutomation } from '../automations/title-generator.automation';
import { assistantHandlerService } from './assistants/assistant-handler.service';
import { pymesHandlerService } from './pymes/pymes-handler.service';
import { executionLoggerService } from './shared/execution-logger.service';

export enum WebhookType {
    DOCUMENT = 'document',
    TEXT = 'text'
}

export class WebhookService {

    /**
     * Procesa la solicitud entrante y determina si es un documento o texto.
     * @param provider El servicio de LLM (ej: 'openai', 'gemini')
     * @param body El cuerpo de la solicitud (JSON o form-data fields)
     * @param file El archivo adjunto si existe (via Multer)
     */
    async handleIncomingRequest(provider: string, body: any, file?: Express.Multer.File): Promise<any> {
        console.log(`[WebhookService] Handling request for ${provider}`);

        let parsedTools: number[] = [];
        if (body.tools) {
            try {
                const arr = (typeof body.tools === 'string') ? JSON.parse(body.tools) : body.tools;
                if (Array.isArray(arr)) parsedTools = arr.map(Number).filter(n => !isNaN(n));
                else parsedTools = [Number(arr)].filter(n => !isNaN(n));
            } catch {
                parsedTools = [];
            }
        }

        // Simula el nodo 'Edit Fields' de n8n para mapear las variables
        const transformedBody = {
            chatInput: body.chatInput,
            model: body.model,
            session_id: body.session_id,
            id_assistant: body.id_assistant || body.assistant_id,
            systemprompt_doc: body.systemprompt_doc, // Contexto devuelto si se sube archivo
            systemPrompt: body.systemPrompt,         // Prompt duro del asistente
            history: body.history || [],
            tools: parsedTools
        };

        // 👻 LANZAMIENTO DEL TRABAJO DE FONDO: Autonaming del Título ("Fire and Forget")
        // No colocamos 'await', permitiendo que Node.js mueva esto a un segundo hilo sin bloquear al usuario
        if (transformedBody.chatInput) {
            titleGeneratorAutomation.generateTitleAsync(transformedBody.session_id, transformedBody.chatInput, provider, transformedBody.id_assistant).catch((e: any) => {
                console.error("[TitleGenerator] Background error:", e);
            });
        }

        let finalDocumentContext = transformedBody.systemprompt_doc || '';

        // 1. Si hay un archivo, lo procesamos (se extrae transcipción y se concatena a los existentes en BD)
        if (file) {
            console.log(`[WebhookService] Detected BINARY file: ${file.originalname}`);
            const docResult = await documentService.processDocument(provider, file, transformedBody);

            if (docResult.status === 'success') {
                // Al procesarse, el documentService ya hizo la concatenación y nos devuelve el combo final.
                finalDocumentContext = docResult.transcription;
            } else {
                return docResult; // Error en procesamiento de documento
            }
        }

        // 2. Si no es documento binario, pero detectamos base64/url en el JSON
        if (!file && this.isDocumentMetadata(transformedBody)) {
            console.log(`[WebhookService] Detected document reference in JSON.`);
        }

        // 3. Routing
        let result: any;
        try {
            if (provider === 'assistant') {
                if (!transformedBody.model || !transformedBody.systemPrompt) {
                    result = { status: 'error', message: 'Se requiere model y systemPrompt en el payload para usar el sistema de Asistentes.' };
                } else {
                    console.log(`[WebhookService] Routing to ASSISTANT Handler (${transformedBody.model})`);
                    result = await assistantHandlerService.processMessage(
                        transformedBody.session_id, transformedBody.chatInput, transformedBody.systemPrompt,
                        transformedBody.model, transformedBody.history, finalDocumentContext, transformedBody.tools
                    );
                }
            } else if (provider === 'pymes-assistant') {
                if (!transformedBody.model || !transformedBody.systemPrompt) {
                    result = { status: 'error', message: 'Se requiere model y systemPrompt para Pymes.' };
                } else {
                    console.log(`[WebhookService] Routing to PYMES ASSISTANT Handler (${transformedBody.model})`);
                    result = await pymesHandlerService.processMessage(
                        transformedBody.session_id, transformedBody.chatInput, transformedBody.systemPrompt,
                        transformedBody.model, transformedBody.history, finalDocumentContext, transformedBody.tools
                    );
                }
            } else {
                console.log(`[WebhookService] Routing to AI Agent ${finalDocumentContext ? 'WITH' : 'WITHOUT'} context.`);
                result = await chatHandlerService.processMessage(provider, transformedBody, finalDocumentContext);
            }

            // Log successful execution (n8n style)
            executionLoggerService.logExecution(provider, transformedBody, result, 'SUCCESS');
            return result;

        } catch (error: any) {
            // Log failed execution
            const errorOutput = { status: 'error', message: error.message || error };
            executionLoggerService.logExecution(provider, transformedBody, errorOutput, 'ERROR');
            throw error;
        }
    }

    private isDocumentMetadata(body: any): boolean {
        // Implementar lógica personalizada si se espera documentos via JSON
        return body && body.type === 'document_reference';
    }
}

export const webhookService = new WebhookService();
