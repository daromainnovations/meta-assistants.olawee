"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const webhook_service_1 = require("../services/webhook.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
const qa_doc_injector_middleware_1 = require("../no_PR/qa-doc-injector.middleware"); // 🚫 NO_PR — Eliminar en producción
const executions_controller_1 = require("../executions/executions.controller");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// ============================================================
// 🌍 CONFIGURACIÓN DE ENTORNO Y PREFIJOS
// ============================================================
const isStaging = process.env.APP_ENV === 'staging';
const qaPrefix = isStaging ? 'QA' : '';
if (isStaging) {
    console.log(`[Router] 🧪 STAGING MODE DETECTED — Webhooks will use "${qaPrefix}" prefix.`);
}
else {
    console.log(`[Router] 🚀 PRODUCTION MODE — Webhooks will use standard names.`);
}
// Inyector condicional: Solo activo en Staging
const docInjector = isStaging ? qa_doc_injector_middleware_1.qaDocInjector : () => (req, res, next) => next();
// === DASHBOARD ROUTES (Libre de API Key para Visualizar el Panel) ===
router.get('/api/executions', executions_controller_1.getExecutions);
router.post('/api/executions/retry/:id', executions_controller_1.retryExecution);
// ===================================================================
// Configuración de multer
const storage = multer_1.default.memoryStorage();
const upload = (0, multer_1.default)({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB límite
});
// Middleware para manejar "multipart/form-data" o "application/json"
const handleUpload = upload.array('files', 10);
// Helper para procesar la respuesta
const processWebhook = async (req, res, provider) => {
    try {
        const body = req.body;
        const files = req.files;
        console.log(`\n=== Incoming Request [${provider}] ===`);
        if (files && files.length > 0) {
            console.log(`> Type: Multipart/Form-Data (${files.length} Files Detected)`);
        }
        else {
            console.log(`> Type: JSON / Text`);
        }
        const result = await webhook_service_1.webhookService.handleIncomingRequest(provider, body, files);
        res.status(200).json(result);
    }
    catch (error) {
        console.error(`Error processing ${provider} webhook:`, error);
        res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    }
};
// ============================================================
// 🔒 RUTAS PROTEGIDAS — API Key aplicada individualmente en cada POST
//
// 🚫 NO_PR: qaDocInjector inyecta systemprompt_doc desde BD (solo QA).
//    En producción el frontend real ya lo envía. Eliminar estas líneas.
// ============================================================
router.post(`/${qaPrefix}openai-chat`, auth_middleware_1.apiKeyMiddleware, handleUpload, docInjector('llm'), (req, res) => processWebhook(req, res, 'openai'));
router.post(`/${qaPrefix}gemini-chat`, auth_middleware_1.apiKeyMiddleware, handleUpload, docInjector('llm'), (req, res) => processWebhook(req, res, 'gemini'));
router.post(`/${qaPrefix}anthropic-chat`, auth_middleware_1.apiKeyMiddleware, handleUpload, docInjector('llm'), (req, res) => processWebhook(req, res, 'anthropic'));
router.post(`/${qaPrefix}mistrall-chat`, auth_middleware_1.apiKeyMiddleware, handleUpload, docInjector('llm'), (req, res) => processWebhook(req, res, 'mistral'));
router.post(`/${qaPrefix}deepseek-chat`, auth_middleware_1.apiKeyMiddleware, handleUpload, docInjector('llm'), (req, res) => processWebhook(req, res, 'deepseek'));
router.post(`/${qaPrefix}assistant-chat`, auth_middleware_1.apiKeyMiddleware, handleUpload, docInjector('assistant'), (req, res) => processWebhook(req, res, 'assistant'));
router.post(`/${qaPrefix}meta-assistant-chat`, auth_middleware_1.apiKeyMiddleware, handleUpload, docInjector('meta'), (req, res) => processWebhook(req, res, 'meta-assistant'));
exports.default = router;
