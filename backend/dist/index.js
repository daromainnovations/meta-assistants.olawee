"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), '.env') });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const webhook_routes_1 = __importDefault(require("./routes/webhook.routes"));
const fs_1 = __importDefault(require("fs"));
const email_service_1 = require("./services/shared/email.service");
if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️ [Init] GEMINI_API_KEY not found in process.env!');
}
else {
    console.log('✅ [Init] GEMINI_API_KEY loaded correctly.');
}
// --- SISTEMA PREVENTIVO DE ERRORES (PROTOCOLO 2 Y 5) ---
function initCrashReporter() {
    const logsDir = path_1.default.join(process.cwd(), 'logs');
    if (!fs_1.default.existsSync(logsDir)) {
        fs_1.default.mkdirSync(logsDir, { recursive: true });
    }
    const logPath = path_1.default.join(logsDir, 'olawee-error.log');
    const writeError = (err, type) => {
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
            // Limitar tamaño del log a 5MB
            if (fs_1.default.existsSync(logPath)) {
                const stats = fs_1.default.statSync(logPath);
                if (stats.size > 5 * 1024 * 1024) {
                    fs_1.default.unlinkSync(logPath);
                }
            }
            fs_1.default.appendFileSync(logPath, block);
        }
        catch (e) {
            // Silently fail if we can't write to log file
        }
    };
    process.on('uncaughtException', (err) => {
        try {
            console.error('💥 ERROR CRÍTICO NO CAPTURADO. Guardado en logs/olawee-error.log', err.message);
        }
        catch (e) { /* ignore EPIPE */ }
        writeError(err, 'UncaughtException');
        email_service_1.emailService.sendCrashAlert('UncaughtException', err.message, err.stack || 'Sin Stack Trace').catch(() => { });
    });
    process.on('unhandledRejection', (reason) => {
        const msg = reason?.message || String(reason);
        const stack = reason?.stack || 'Sin Stack Trace';
        try {
            console.error('💥 PROMESA FALLIDA NO CAPTURADA. Guardado en logs/olawee-error.log', msg);
        }
        catch (e) { /* ignore EPIPE */ }
        writeError(reason, 'UnhandledRejection');
        email_service_1.emailService.sendCrashAlert('UnhandledRejection', msg, stack).catch(() => { });
    });
}
initCrashReporter();
const hpp_1 = __importDefault(require("hpp"));
const app = (0, express_1.default)();
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
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Ruta de diagnóstico directa
app.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString(), env: process.env.APP_ENV });
});
// 3. Prevenir contaminación de parámetros HTTP (HPP)
app.use((0, hpp_1.default)());
// -----------------------------------
// Servir la carpeta estática del frontend y descargas (Debe ir antes de las rutas protegidas)
// IMPORTANTE: con ts-node __dirname = src/, pero process.cwd() = backend/
// Así que usamos process.cwd() para que '../frontend' resuelva correctamente a qaolawee-2.0/frontend/
const frontendPath = path_1.default.join(process.cwd(), '../frontend');
console.log(`[Static] Sirviendo frontend desde: ${frontendPath}`);
app.use(express_1.default.static(frontendPath));
app.use('/downloads', express_1.default.static(path_1.default.join(process.cwd(), 'public/downloads')));
// Mount the webhook routes
app.use(webhook_routes_1.default);
// Configuración dinámica para el Frontend
app.get('/config.js', (req, res) => {
    const isStaging = process.env.APP_ENV === 'staging';
    // Importante: El prefijo debe empezar por / para ser una ruta absoluta
    // y no llevar / al final para concatenar directamente con el nombre del endpoint (ej: /QAopenai-chat)
    const prefix = isStaging ? '/QA' : '/';
    res.type('application/javascript');
    res.send(`window.API_PREFIX = "${prefix}";`);
});
app.listen(Number(PORT), '0.0.0.0', () => {
    const isStaging = process.env.APP_ENV === 'staging';
    const qaPrefix = isStaging ? 'QA' : '';
    console.log(`[🚀 OLAWEE] Server listening at http://localhost:${PORT}`);
    console.log(`- Dashboard: http://localhost:${PORT}/admin/index.html`);
    console.log(`- Lab Meta: http://localhost:${PORT}/meta-assistants/index.html`);
    console.log(`- Health Check: http://localhost:${PORT}/health`);
});
