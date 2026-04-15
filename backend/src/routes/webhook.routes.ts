import { Router, Request, Response } from 'express';
import multer from 'multer';
import { webhookService } from '../services/webhook.service';
import { apiKeyMiddleware } from '../middleware/auth.middleware';
import { getExecutions, retryExecution } from '../executions/executions.controller';
import { SPECIALIST_REGISTRY } from '../services/meta-assistants/meta-handler.service';

const router = Router();

// ============================================================
// 🌍 CONFIGURACIÓN DE ENTORNO Y PREFIJOS
// ============================================================
const isStaging = process.env.APP_ENV === 'staging';
const qaPrefix = isStaging ? 'QA' : '';

if (isStaging) {
    console.log(`[Router] 🧪 STAGING MODE DETECTED — Webhooks will use "${qaPrefix}" prefix.`);
}

// === DASHBOARD ROUTES ===
router.get('/api/executions', getExecutions);
router.post('/api/executions/retry/:id', retryExecution);

// Configuración de multer
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB
        files: 50                     // 50 archivos
    }
});
const handleUpload = upload.array('files', 50);

// Helper para procesar la respuesta
const processWebhook = async (req: Request, res: Response, metaId: string) => {
    try {
        const body = req.body;
        const files = req.files as Express.Multer.File[];

        console.log(`\n=== Incoming Request for Meta Assistant [${metaId}] ===`);
        
        const result = await webhookService.handleIncomingRequest(metaId, body, files);
        res.status(200).json(result);

    } catch (error) {
        console.error(`Error processing meta-assistant [${metaId}] webhook:`, error);
        res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    }
};

// ============================================================
// 🔒 RUTAS DINÁMICAS — Un Webhook por cada Meta-Asistente
// ============================================================
Object.keys(SPECIALIST_REGISTRY).forEach(metaId => {
    const routePath = `/${qaPrefix}webhook/${metaId}`;
    console.log(`[Router] 🔌 Registering specialized webhook: ${routePath}`);
    
    router.post(routePath, apiKeyMiddleware as any, handleUpload, (req, res) => processWebhook(req, res, metaId));
});

export default router;
