import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import webhookRoutes from './routes/webhook.routes';
import fs from 'fs';
import path from 'path';
import { emailService } from './services/shared/email.service';

// --- SISTEMA PREVENTIVO DE ERRORES (PROTOCOLO 2 Y 5) ---
function initCrashReporter() {
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }
    const logPath = path.join(logsDir, 'olawee-error.log');

    const writeError = (err: any, type: string) => {
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

        // Limitar tamaño del log a 5MB para evitar sobrecarga (Protocolo de prevención)
        try {
            if (fs.existsSync(logPath)) {
                const stats = fs.statSync(logPath);
                if (stats.size > 5 * 1024 * 1024) { // Límite de 5MB
                    fs.unlinkSync(logPath); // Borra el archivo antiguo permanentemente
                }
            }
        } catch (e) {
            console.error("Error al limpiar log de errores:", e);
        }

        fs.appendFileSync(logPath, block);
    };

    process.on('uncaughtException', (err) => {
        console.error('💥 ERROR CRÍTICO NO CAPTURADO. Guardado en logs/olawee-error.log', err.message);
        writeError(err, 'UncaughtException');
        emailService.sendCrashAlert('UncaughtException', err.message, err.stack || 'Sin Stack Trace').catch(() => { });
    });

    process.on('unhandledRejection', (reason: any) => {
        const msg = reason?.message || String(reason);
        const stack = reason?.stack || 'Sin Stack Trace';
        console.error('💥 PROMESA FALLIDA NO CAPTURADA. Guardado en logs/olawee-error.log', msg);
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
// 1. Ocultar cabeceras Express y añadir cabeceras de alta seguridad
app.use(helmet({
    contentSecurityPolicy: false, // Relajado solo para el frontend en localhost
    crossOriginEmbedderPolicy: false
}));

// 2. Prevenir saturación y ataques DDoS (Rate Limit: 100 peticiones x 15 min)
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

// Prefijos en Staging
if (process.env.APP_ENV === 'staging') {
    app.use(/^\/QA/, limiter);
}

// Middleware to parse JSON bodies & allow Cross-Origin Requests
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Limitamos tamaño de JSON para evitar buffers gigantes
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
    const prefix = isStaging ? 'QA' : '';
    res.type('application/javascript');
    res.send(`window.API_PREFIX = "${prefix}";`);
});

app.listen(PORT, () => {
    const isStaging = process.env.APP_ENV === 'staging';
    const qaPrefix = isStaging ? 'QA' : '';

    console.log(`Server is running on port ${PORT} [${process.env.APP_ENV || 'production'}]`);
    console.log('Webhook routes are active:');
    console.log(`- POST http://localhost:${PORT}/${qaPrefix}openai-chat`);
    console.log(`- POST http://localhost:${PORT}/${qaPrefix}gemini-chat`);
    console.log(`- POST http://localhost:${PORT}/${qaPrefix}anthropic-chat`);
    console.log(`- POST http://localhost:${PORT}/${qaPrefix}mistrall-chat`);
    console.log(`- POST http://localhost:${PORT}/${qaPrefix}deepseek-chat`);
    console.log(`- POST http://localhost:${PORT}/${qaPrefix}assistant-chat`);
    console.log(`- POST http://localhost:${PORT}/${qaPrefix}meta-assistant-chat`);
});
