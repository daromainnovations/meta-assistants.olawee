import { chatHandlerService } from './chat/chat-handler.service';
import { documentService } from './shared/document.service';
import { titleGeneratorAutomation } from '../automations/title-generator.automation';
import { assistantHandlerService } from './assistants/assistant-handler.service';
import { pymesHandlerService } from './pymes/pymes-handler.service';

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

        // Simula el nodo 'Edit Fields' de n8n para mapear las variables
        const transformedBody = {
            ...body,
            user_prompt: body.chatInput || body.user_prompt,
            ai_model: body.model,
            id_user_chat: body.session_id,
            id_assistant: body.id_assistant || body.assistant_id,
            systemprompt_doc: body.systemprompt_doc, // Contexto devuelto si se sube archivo
            systemPrompt: body.systemPrompt,         // Prompt duro del asistente
            history: body.history || [],
        };

        // 👻 LANZAMIENTO DEL TRABAJO DE FONDO: Autonaming del Título ("Fire and Forget")
        // No colocamos 'await', permitiendo que Node.js mueva esto a un segundo hilo sin bloquear al usuario
        if (transformedBody.user_prompt) {
            titleGeneratorAutomation.generateTitleAsync(transformedBody.id_user_chat, transformedBody.user_prompt, provider, transformedBody.id_assistant).catch((e: any) => {
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
        if (provider === 'assistant') {
            if (!transformedBody.ai_model || !transformedBody.systemPrompt) {
                return { status: 'error', message: 'Se requiere model y systemPrompt en el payload para usar el sistema de Asistentes.' };
            }
            console.log(`[WebhookService] Routing to ASSISTANT Handler (Model: ${transformedBody.ai_model}, Session: ${transformedBody.id_user_chat})`);
            return assistantHandlerService.processMessage(
                transformedBody.id_user_chat,
                transformedBody.user_prompt,
                transformedBody.systemPrompt,
                transformedBody.ai_model,
                transformedBody.history,
                finalDocumentContext
            );
        } else if (provider === 'pymes-assistant') {
            if (!transformedBody.ai_model || !transformedBody.systemPrompt) {
                return { status: 'error', message: 'Se requiere model y systemPrompt en el payload para usar el sistema de Asistentes para Pymes.' };
            }
            console.log(`[WebhookService] Routing to PYMES ASSISTANT Handler (Model: ${transformedBody.ai_model}, Session: ${transformedBody.id_user_chat})`);
            return pymesHandlerService.processMessage(
                transformedBody.id_user_chat,
                transformedBody.user_prompt,
                transformedBody.systemPrompt,
                transformedBody.ai_model,
                transformedBody.history,
                finalDocumentContext
            );
        } else {
            console.log(`[WebhookService] Routing to AI Agent ${finalDocumentContext ? 'WITH systemprompt_doc context' : 'WITHOUT systemprompt_doc context'}.`);
            return chatHandlerService.processMessage(provider, transformedBody, finalDocumentContext);
        }
    }

    private isDocumentMetadata(body: any): boolean {
        // Implementar lógica personalizada si se espera documentos via JSON
        return body && body.type === 'document_reference';
    }
}

export const webhookService = new WebhookService();
