import { BaseChatModel } from '@langchain/core/language_models/chat_models';

export interface ChatMessageData {
    user_prompt?: string;
    message?: string;
    query?: string;
    system_prompt?: string; // Prompt de sistema manual
    ai_model: string;
    id_user_chat: string;
    history?: any[];
}

export interface ChatResult {
    status: 'success' | 'error';
    type?: string;
    provider: string;
    ai_response?: string;
    context_used?: boolean;
    timestamp?: string;
    error?: string;
    message?: string; // Para compatibilidad con errores
}

export interface IAiProviderService {
    getModel(provider: string, modelName: string): BaseChatModel;
}
