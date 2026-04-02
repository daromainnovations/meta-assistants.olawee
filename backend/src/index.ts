import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import express from 'express';
import cors from 'cors';
import webhookRoutes from './routes/webhook.routes';
import fs from 'fs';
import { emailService } from './services/shared/email.service';

if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️ [Init] GEMINI_API_KEY not found in process.env!');
} else {
    console.log('✅ [Init] GEMINI_API_KEY loaded correctly.');
}

// --- SISTEMA PREVENTIVO DE ERRORES (PROTOCOLO 2 Y 5) ---
function initCrashReporter() {
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }
    const logPath = path.join(logsDir, 'olawee-error.log');

    const writeError = (err: any, type: string) => {
        try {
            const timestamp = new Date().toISOString();
            const block = `
========== [🔴 REPORTE DE ERROR FATAL: ${timestamp}] ==========
▶ TIPO: ${type}
▶ MENSAJE: ${err?.message || err}
▶ SO: ${process.platform} - Node: ${process.version}
▶ STACK TRACE (Código para Antigravity):
${err?.stack || 'No Stack Trace disponible'}
===================================================================
`;

            // Rotación automática semanal (7 días) o límite de 5MB
            if (fs.existsSync(logPath)) {
                const stats = fs.statSync(logPath);
                const now = new Date();
                const diffTime = Math.abs(now.getTime() - stats.mtime.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays >= 7 || stats.size > 5 * 1024 * 1024) {
                    console.log(`[Init] 🧹 Rotando log de errores (${diffDays} días, ${stats.size} bytes).`);
                    fs.unlinkSync(logPath);
                }
            }
            fs.appendFileSync(logPath, block);
        } catch (e) {
            // Silently fail if we can't write to log file
        }
    };

    process.on('uncaughtException', (err) => {
        try {
            console.error('💥 ERROR CRÍTICO NO CAPTURADO. Guardado en logs/olawee-error.log', err.message);
        } catch (e) { /* ignore EPIPE */ }
        writeError(err, 'UncaughtException');
        emailService.sendCrashAlert('UncaughtException', err.message, err.stack || 'Sin Stack Trace').catch(() => { });
    });

    process.on('unhandledRejection', (reason: any) => {
        const msg = reason?.message || String(reason);
        const stack = reason?.stack || 'Sin Stack Trace';
        try {
            console.error('💥 PROMESA FALLIDA NO CAPTURADA. Guardado en logs/olawee-error.log', msg);
        } catch (e) { /* ignore EPIPE */ }
        writeError(reason, 'UnhandledRejection');
        emailService.sendCrashAlert('UnhandledRejection', msg, stack).catch(() => { });
    });
}
initCrashReporter();

// ---------------------------------------------------

import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';

const app = express();
const PORT = process.env.PORT || 3000;

// --- PROTOCOLO 3: CYBERSEGURIDAD ---
// [AUTO-OFF PARA LOCAL] Comentado para evitar falsos positivos de bloqueo durante pruebas.
/*
app.use(helmet({
    contentSecurityPolicy: false, 
    crossOriginEmbedderPolicy: false
}));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 'error', message: '¡Peligro! DEMASIADAS PETICIONES: Sistema de Defensa Anti-DDoS Activado.' }
});
app.use('/gemini-chat', limiter);
app.use('/openai-chat', limiter);
app.use('/anthropic-chat', limiter);
app.use('/mistrall-chat', limiter);
app.use('/deepseek-chat', limiter);
app.use('/assistant-chat', limiter);
app.use('/meta-assistant-chat', limiter);
*/

// Middleware to parse JSON bodies & allow Cross-Origin Requests
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Ruta de diagnóstico directa
app.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString(), env: process.env.APP_ENV });
});


// 3. Prevenir contaminación de parámetros HTTP (HPP)
app.use(hpp());
// -----------------------------------

// Servir la carpeta estática del frontend y descargas (Debe ir antes de las rutas protegidas)
// IMPORTANTE: con ts-node __dirname = src/, pero process.cwd() = backend/
// Así que usamos process.cwd() para que '../frontend' resuelva correctamente a qaolawee-2.0/frontend/
const frontendPath = path.join(process.cwd(), '../frontend');
console.log(`[Static] Sirviendo frontend desde: ${frontendPath}`);
app.use(express.static(frontendPath));
app.use('/downloads', express.static(path.join(process.cwd(), 'public/downloads')));

// Mount the webhook routes
app.use(webhookRoutes);

// Configuración dinámica para el Frontend
app.get('/config.js', (req, res) => {
    const isStaging = process.env.APP_ENV === 'staging';
    // Importante: El prefijo debe empezar por / para ser una ruta absoluta
    // y no llevar / al final para concatenar directamente con el nombre del endpoint (ej: /QAopenai-chat)
    const prefix = isStaging ? '/QA' : '/';
    res.type('application/javascript');
    res.send(`window.API_PREFIX = "${prefix}";`);
});



// 🛡️ GLOBAL ERROR HANDLER — Devuelve siempre JSON, nunca HTML
// Esto previene el error "Unexpected token '<'" en el cliente cuando Multer
// u otro middleware lanza un error (ej: demasiados archivos, archivo muy grande).
app.use((err: any, req: any, res: any, next: any) => {
    if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ status: 'error', message: `Demasiados archivos. El límite es de 50 archivos por solicitud.` });
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ status: 'error', message: `Archivo demasiado grande. El límite es de 100MB por archivo.` });
    }
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ status: 'error', message: 'El cuerpo de la solicitud es demasiado grande.' });
    }
    console.error('[GlobalErrorHandler]', err.message);
    return res.status(500).json({ status: 'error', message: err.message || 'Internal Server Error' });
});

app.listen(Number(PORT), '0.0.0.0', () => {
    const isStaging = process.env.APP_ENV === 'staging';
    const qaPrefix = isStaging ? 'QA' : '';

    console.log(`[🚀 OLAWEE] Server listening at http://localhost:${PORT}`);
    console.log(`- Dashboard: http://localhost:${PORT}/admin/index.html`);
    console.log(`- Lab Meta: http://localhost:${PORT}/meta-assistants/index.html`);
    console.log(`- Health Check: http://localhost:${PORT}/health`);
});

