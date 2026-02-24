import { Router, Request, Response } from 'express';
import multer from 'multer';
import { webhookService } from '../services/webhook.service';
import { apiKeyMiddleware } from '../middleware/auth.middleware';

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

// 🔒 Proteger todas las rutas Webhook con API Key
router.use(apiKeyMiddleware as any);

// Configuración de multer
const storage = multer.memoryStorage(); // Usamos memoria por simplicidad
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limite
});

// Middleware para manejar "multipart/form-data" (con archivos) o "application/json"
// "files" es el nombre del campo que esperamos para archivos (un array de hasta 10)
const handleUpload = upload.array('files', 10);

// Helper para procesar la respuesta
const processWebhook = async (req: Request, res: Response, provider: string) => {
    try {
        const body = req.body;
        const files = req.files as Express.Multer.File[]; // Multer populates this if present

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

// Rutas actualizadas
router.post('/openai-chat', handleUpload, (req, res) => processWebhook(req, res, 'openai'));
router.post('/gemini-chat', handleUpload, (req, res) => processWebhook(req, res, 'gemini'));
router.post('/anthropic-chat', handleUpload, (req, res) => processWebhook(req, res, 'anthropic'));
router.post('/mistrall-chat', handleUpload, (req, res) => processWebhook(req, res, 'mistral'));
router.post('/deepseek-chat', handleUpload, (req, res) => processWebhook(req, res, 'deepseek'));
router.post('/assistant-chat', handleUpload, (req, res) => processWebhook(req, res, 'assistant'));
router.post('/pymes-assistant-chat', handleUpload, (req, res) => processWebhook(req, res, 'pymes-assistant'));

export default router;
