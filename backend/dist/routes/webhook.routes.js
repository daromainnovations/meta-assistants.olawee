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
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// === DASHBOARD ROUTE (Libre de API Key para Visualizar el Panel) ===
router.get('/api/executions', async (req, res) => {
    try {
        const chatExecs = await prisma.exec_chats.findMany({ orderBy: { created_at: 'desc' }, take: 20 });
        const asstExecs = await prisma.exec_assistants.findMany({ orderBy: { created_at: 'desc' }, take: 20 });
        const pymesExecs = await prisma.exec_pymes.findMany({ orderBy: { created_at: 'desc' }, take: 20 });
        let allExecs = [...chatExecs, ...asstExecs, ...pymesExecs];
        allExecs.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
        res.json(allExecs.slice(0, 50));
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
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
router.post('/openai-chat', auth_middleware_1.apiKeyMiddleware, handleUpload, (0, qa_doc_injector_middleware_1.qaDocInjector)('llm'), (req, res) => processWebhook(req, res, 'openai'));
router.post('/gemini-chat', auth_middleware_1.apiKeyMiddleware, handleUpload, (0, qa_doc_injector_middleware_1.qaDocInjector)('llm'), (req, res) => processWebhook(req, res, 'gemini'));
router.post('/anthropic-chat', auth_middleware_1.apiKeyMiddleware, handleUpload, (0, qa_doc_injector_middleware_1.qaDocInjector)('llm'), (req, res) => processWebhook(req, res, 'anthropic'));
router.post('/mistrall-chat', auth_middleware_1.apiKeyMiddleware, handleUpload, (0, qa_doc_injector_middleware_1.qaDocInjector)('llm'), (req, res) => processWebhook(req, res, 'mistral'));
router.post('/deepseek-chat', auth_middleware_1.apiKeyMiddleware, handleUpload, (0, qa_doc_injector_middleware_1.qaDocInjector)('llm'), (req, res) => processWebhook(req, res, 'deepseek'));
router.post('/assistant-chat', auth_middleware_1.apiKeyMiddleware, handleUpload, (0, qa_doc_injector_middleware_1.qaDocInjector)('assistant'), (req, res) => processWebhook(req, res, 'assistant'));
router.post('/pymes-assistant-chat', auth_middleware_1.apiKeyMiddleware, handleUpload, (0, qa_doc_injector_middleware_1.qaDocInjector)('pymes'), (req, res) => processWebhook(req, res, 'pymes-assistant'));
router.post('/beta-assistant-chat', auth_middleware_1.apiKeyMiddleware, handleUpload, (0, qa_doc_injector_middleware_1.qaDocInjector)('beta'), (req, res) => processWebhook(req, res, 'beta-assistant'));
exports.default = router;
