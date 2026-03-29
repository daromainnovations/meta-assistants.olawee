import { Router, Request, Response } from 'express';
import multer from 'multer';
import { webhookService } from '../services/webhook.service';
import { apiKeyMiddleware } from '../middleware/auth.middleware';
import { qaDocInjector } from '../no_PR/qa-doc-injector.middleware'; // 🚫 NO_PR — Eliminar en producción
import { getExecutions, retryExecution } from '../executions/executions.controller';

import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// ============================================================
// 🌍 CONFIGURACIÓN DE ENTORNO Y PREFIJOS
// ============================================================
const isStaging = process.env.APP_ENV === 'staging';
const qaPrefix = isStaging ? 'QA' : '';

if (isStaging) {
    console.log(`[Router] 🧪 STAGING MODE DETECTED — Webhooks will use "${qaPrefix}" prefix.`);
} else {
    console.log(`[Router] 🚀 PRODUCTION MODE — Webhooks will use standard names.`);
}

// Inyector condicional: Solo activo en Staging
const docInjector = isStaging ? qaDocInjector : () => (req: Request, res: Response, next: any) => next();

// === DASHBOARD ROUTES (Libre de API Key para Visualizar el Panel) ===
router.get('/api/executions', getExecutions);
router.post('/api/executions/retry/:id', retryExecution);
// ===================================================================

// Configuración de multer
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB límite
});

// Middleware para manejar "multipart/form-data" o "application/json"
const handleUpload = upload.array('files', 10);

// Helper para procesar la respuesta
const processWebhook = async (req: Request, res: Response, provider: string) => {
    try {
        const body = req.body;
        const files = req.files as Express.Multer.File[];

        console.log(`\n=== Incoming Request [${provider}] ===`);
        if (files && files.length > 0) {
            console.log(`> Type: Multipart/Form-Data (${files.length} Files Detected)`);
        } else {
            console.log(`> Type: JSON / Text`);
        }

        const result = await webhookService.handleIncomingRequest(provider, body, files);
        res.status(200).json(result);

    } catch (error) {
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
router.post(`/${qaPrefix}openai-chat`, apiKeyMiddleware as any, handleUpload, docInjector('llm'), (req, res) => processWebhook(req, res, 'openai'));
router.post(`/${qaPrefix}gemini-chat`, apiKeyMiddleware as any, handleUpload, docInjector('llm'), (req, res) => processWebhook(req, res, 'gemini'));
router.post(`/${qaPrefix}anthropic-chat`, apiKeyMiddleware as any, handleUpload, docInjector('llm'), (req, res) => processWebhook(req, res, 'anthropic'));
router.post(`/${qaPrefix}mistrall-chat`, apiKeyMiddleware as any, handleUpload, docInjector('llm'), (req, res) => processWebhook(req, res, 'mistral'));
router.post(`/${qaPrefix}deepseek-chat`, apiKeyMiddleware as any, handleUpload, docInjector('llm'), (req, res) => processWebhook(req, res, 'deepseek'));
router.post(`/${qaPrefix}assistant-chat`, apiKeyMiddleware as any, handleUpload, docInjector('assistant'), (req, res) => processWebhook(req, res, 'assistant'));
router.post(`/${qaPrefix}meta-assistant-chat`, apiKeyMiddleware as any, handleUpload, docInjector('meta'), (req, res) => processWebhook(req, res, 'meta-assistant'));

export default router;
