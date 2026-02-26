import { Router, Request, Response } from 'express';
import multer from 'multer';
import { webhookService } from '../services/webhook.service';
import { apiKeyMiddleware } from '../middleware/auth.middleware';
import { qaDocInjector } from '../no_PR/qa-doc-injector.middleware'; // 🚫 NO_PR — Eliminar en producción

import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// === DASHBOARD ROUTE (Libre de API Key para Visualizar el Panel) ===
router.get('/api/executions', async (req, res) => {
    try {
        const chatExecs = await prisma.exec_chats.findMany({ orderBy: { created_at: 'desc' }, take: 20 });
        const asstExecs = await prisma.exec_assistants.findMany({ orderBy: { created_at: 'desc' }, take: 20 });
        const pymesExecs = await prisma.exec_pymes.findMany({ orderBy: { created_at: 'desc' }, take: 20 });

        let allExecs: any[] = [...chatExecs, ...asstExecs, ...pymesExecs];
        allExecs.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
        res.json(allExecs.slice(0, 50));
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});
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
router.post('/openai-chat', apiKeyMiddleware as any, handleUpload, qaDocInjector('llm'), (req, res) => processWebhook(req, res, 'openai'));
router.post('/gemini-chat', apiKeyMiddleware as any, handleUpload, qaDocInjector('llm'), (req, res) => processWebhook(req, res, 'gemini'));
router.post('/anthropic-chat', apiKeyMiddleware as any, handleUpload, qaDocInjector('llm'), (req, res) => processWebhook(req, res, 'anthropic'));
router.post('/mistrall-chat', apiKeyMiddleware as any, handleUpload, qaDocInjector('llm'), (req, res) => processWebhook(req, res, 'mistral'));
router.post('/deepseek-chat', apiKeyMiddleware as any, handleUpload, qaDocInjector('llm'), (req, res) => processWebhook(req, res, 'deepseek'));
router.post('/assistant-chat', apiKeyMiddleware as any, handleUpload, qaDocInjector('assistant'), (req, res) => processWebhook(req, res, 'assistant'));
router.post('/pymes-assistant-chat', apiKeyMiddleware as any, handleUpload, qaDocInjector('pymes'), (req, res) => processWebhook(req, res, 'pymes-assistant'));
router.post('/beta-assistant-chat', apiKeyMiddleware as any, handleUpload, qaDocInjector('beta'), (req, res) => processWebhook(req, res, 'beta-assistant'));

export default router;
