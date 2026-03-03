"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assistantProviderService = exports.AssistantProviderService = void 0;
const google_genai_1 = require("@langchain/google-genai");
const openai_1 = require("@langchain/openai");
const anthropic_1 = require("@langchain/anthropic");
const mistralai_1 = require("@langchain/mistralai");
const deepseek_1 = require("@langchain/deepseek");
class AssistantProviderService {
    /**
     * Devuelve el mejor modelo optimizado para contexto largo según el proveedor de IA.
     * Esta versión es más rígida que el Chat normal, priorizando estabilidad y configuraciones de DB.
     */
    getModel(modelStr, temperature, maxTokens) {
        const lowerModelName = modelStr.toLowerCase();
        let actualProvider = '';
        if (lowerModelName.includes('gpt')) {
            actualProvider = 'openai';
        }
        else if (lowerModelName.includes('gemini')) {
            actualProvider = 'gemini';
        }
        else if (lowerModelName.includes('claude')) {
            actualProvider = 'anthropic';
        }
        else if (lowerModelName.includes('mistral') || lowerModelName.includes('mixtral')) {
            actualProvider = 'mistral';
        }
        else if (lowerModelName.includes('deepseek')) {
            actualProvider = 'deepseek';
        }
        else {
            throw new Error(`Proveedor de IA no encontrado a partir del modelo: ${modelStr}`);
        }
        switch (actualProvider) {
            case 'openai':
                if (!process.env.OPENAI_API_KEY)
                    throw new Error('OPENAI_API_KEY no configurado.');
                return new openai_1.ChatOpenAI({
                    apiKey: process.env.OPENAI_API_KEY,
                    modelName: modelStr || 'gpt-4o',
                    temperature: temperature,
                    maxTokens: maxTokens || undefined,
                });
            case 'anthropic':
                if (!process.env.ANTHROPIC_API_KEY)
                    throw new Error('ANTHROPIC_API_KEY no configurado.');
                return new anthropic_1.ChatAnthropic({
                    apiKey: process.env.ANTHROPIC_API_KEY,
                    modelName: modelStr || 'claude-3-5-sonnet-20241022',
                    temperature: temperature,
                    maxTokens: maxTokens || undefined,
                });
            case 'gemini':
                if (!process.env.GEMINI_API_KEY)
                    throw new Error('GEMINI_API_KEY no configurado.');
                return new google_genai_1.ChatGoogleGenerativeAI({
                    apiKey: process.env.GEMINI_API_KEY,
                    model: modelStr || 'gemini-1.5-pro',
                    temperature: temperature,
                    maxOutputTokens: maxTokens || undefined,
                });
            case 'mistral':
                if (!process.env.MISTRAL_API_KEY)
                    throw new Error('MISTRAL_API_KEY no configurado.');
                return new mistralai_1.ChatMistralAI({
                    apiKey: process.env.MISTRAL_API_KEY,
                    modelName: modelStr || 'mistral-large-latest',
                    temperature: temperature,
                    maxTokens: maxTokens || undefined,
                });
            case 'deepseek':
                if (!process.env.DEEPSEEK_API_KEY)
                    throw new Error('DEEPSEEK_API_KEY no configurado.');
                return new deepseek_1.ChatDeepSeek({
                    apiKey: process.env.DEEPSEEK_API_KEY,
                    model: modelStr || 'deepseek-chat',
                    temperature: temperature,
                    maxTokens: maxTokens || undefined,
                });
            default:
                throw new Error(`Proveedor ${actualProvider} no soportado para el sistema de Asistentes.`);
        }
    }
}
exports.AssistantProviderService = AssistantProviderService;
exports.assistantProviderService = new AssistantProviderService();
