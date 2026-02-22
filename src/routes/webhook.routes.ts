import { Router, Request, Response } from 'express';
import multer from 'multer';
import { webhookService } from '../services/webhook.service';
import { apiKeyMiddleware } from '../middleware/auth.middleware';

const router = Router();

// 🔒 Proteger todas las rutas de este router con API Key
router.use(apiKeyMiddleware as any);

// Configuración de multer
const storage = multer.memoryStorage(); // Usamos memoria por simplicidad
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limite
});

// Middleware para manejar "multipart/form-data" (con archivos) o "application/json"
// "file" es el nombre del campo que esperamos para archivos.
// Si no hay archivo, upload.single('file') simplemente pasa siguiente.
const handleUpload = upload.single('file');

// Helper para procesar la respuesta
const processWebhook = async (req: Request, res: Response, provider: string) => {
    try {
        const body = req.body;
        const file = req.file; // Multer populate this if present

        console.log(`\n=== Incoming Request [${provider}] ===`);
        if (file) {
            console.log(`> Type: Multipart/Form-Data (File Detected: ${file.originalname})`);
        } else {
            console.log(`> Type: JSON / Text`);
        }

        const result = await webhookService.handleIncomingRequest(provider, body, file);
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
