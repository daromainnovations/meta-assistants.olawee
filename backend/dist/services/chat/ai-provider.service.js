"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiProviderService = exports.AiProviderService = void 0;
const google_genai_1 = require("@langchain/google-genai");
const openai_1 = require("@langchain/openai");
const anthropic_1 = require("@langchain/anthropic");
const mistralai_1 = require("@langchain/mistralai");
const deepseek_1 = require("@langchain/deepseek");
class AiProviderService {
    /**
     * Actúa como un "Model Selector" dinámico similar a n8n.
     * Lee la palabra clave del modelo para instanciar el proveedor correcto.
     */
    getModel(provider, modelName) {
        let actualProvider = provider.toLowerCase();
        const lowerModelName = modelName.toLowerCase();
        // Lógica del Model Selector Dinámico
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
        // Traductor Proxy: Nombres N8N o visuales -> Nombres de API Reales
        let mappedModelName = modelName;
        if (modelName === 'gemini-3-pro')
            mappedModelName = 'gemini-3-pro-preview';
        if (modelName === 'gemini-3-flash')
            mappedModelName = 'gemini-3-flash-preview';
        console.log(`[ModelSelector] Routing model '${modelName}' (Mapped: '${mappedModelName}') to provider -> '${actualProvider}'`);
        switch (actualProvider) {
            case 'gemini':
                if (!process.env.GEMINI_API_KEY) {
                    throw new Error('GEMINI_API_KEY is not configured in .env');
                }
                return new google_genai_1.ChatGoogleGenerativeAI({
                    apiKey: process.env.GEMINI_API_KEY,
                    model: mappedModelName, // Usamos el nombre traducido
                    temperature: 0.7,
                });
            case 'openai':
                if (!process.env.OPENAI_API_KEY) {
                    throw new Error('OPENAI_API_KEY is not configured in .env. Por favor añádela para usar modelos GPT.');
                }
                return new openai_1.ChatOpenAI({
                    apiKey: process.env.OPENAI_API_KEY,
                    modelName: modelName,
                    temperature: 0.7,
                });
            case 'anthropic':
                if (!process.env.ANTHROPIC_API_KEY) {
                    throw new Error('ANTHROPIC_API_KEY is not configured in .env. Añádela para usar modelos Claude.');
                }
                return new anthropic_1.ChatAnthropic({
                    apiKey: process.env.ANTHROPIC_API_KEY,
                    modelName: modelName,
                    temperature: 0.7,
                });
            case 'mistral':
                if (!process.env.MISTRAL_API_KEY) {
                    throw new Error('MISTRAL_API_KEY is not configured in .env. Añádela para usar modelos Mistral.');
                }
                return new mistralai_1.ChatMistralAI({
                    apiKey: process.env.MISTRAL_API_KEY,
                    modelName: modelName,
                    temperature: 0.7,
                });
            case 'deepseek':
                if (!process.env.DEEPSEEK_API_KEY) {
                    throw new Error('DEEPSEEK_API_KEY is not configured in .env. Añádela para usar modelos DeepSeek.');
                }
                return new deepseek_1.ChatDeepSeek({
                    apiKey: process.env.DEEPSEEK_API_KEY,
                    model: modelName, // ChatDeepSeek usually uses 'model' instead of 'modelName'
                    temperature: 0.7,
                });
            default:
                throw new Error(`Cannot resolve provider for model: ${modelName}. Add routing logic in ai-provider.service.`);
        }
    }
}
exports.AiProviderService = AiProviderService;
exports.aiProviderService = new AiProviderService();
