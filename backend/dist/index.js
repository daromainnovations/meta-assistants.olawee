"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const webhook_routes_1 = __importDefault(require("./routes/webhook.routes"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const email_service_1 = require("./services/shared/email.service");
// --- SISTEMA PREVENTIVO DE ERRORES (PROTOCOLO 2 Y 5) ---
function initCrashReporter() {
    const logsDir = path_1.default.join(process.cwd(), 'logs');
    if (!fs_1.default.existsSync(logsDir)) {
        fs_1.default.mkdirSync(logsDir, { recursive: true });
    }
    const logPath = path_1.default.join(logsDir, 'olawee-error.log');
    const writeError = (err, type) => {
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
        fs_1.default.appendFileSync(logPath, block);
    };
    process.on('uncaughtException', (err) => {
        console.error('💥 ERROR CRÍTICO NO CAPTURADO. Guardado en logs/olawee-error.log', err.message);
        writeError(err, 'UncaughtException');
        email_service_1.emailService.sendCrashAlert('UncaughtException', err.message, err.stack || 'Sin Stack Trace').catch(() => { });
    });
    process.on('unhandledRejection', (reason) => {
        const msg = reason?.message || String(reason);
        const stack = reason?.stack || 'Sin Stack Trace';
        console.error('💥 PROMESA FALLIDA NO CAPTURADA. Guardado en logs/olawee-error.log', msg);
        writeError(reason, 'UnhandledRejection');
        email_service_1.emailService.sendCrashAlert('UnhandledRejection', msg, stack).catch(() => { });
    });
}
initCrashReporter();
// ---------------------------------------------------
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const hpp_1 = __importDefault(require("hpp"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// --- PROTOCOLO 3: CYBERSEGURIDAD ---
// 1. Ocultar cabeceras Express y añadir cabeceras de alta seguridad
app.use((0, helmet_1.default)({
    contentSecurityPolicy: false, // Relajado solo para el frontend en localhost
    crossOriginEmbedderPolicy: false
}));
// 2. Prevenir saturación y ataques DDoS (Rate Limit: 100 peticiones x 15 min)
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 'error', message: '¡Peligro! DEMASIADAS PETICIONES: Sistema de Defensa Anti-DDoS Activado.' }
});
app.use('/assistant-chat', limiter);
app.use('/pymes-assistant-chat', limiter);
app.use('/gemini-chat', limiter);
app.use('/openai-chat', limiter);
app.use('/anthropic-chat', limiter);
app.use('/mistrall-chat', limiter);
app.use('/deepseek-chat', limiter);
app.use('/beta-assistant-chat', limiter);
// Middleware to parse JSON bodies & allow Cross-Origin Requests
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '10mb' })); // Limitamos tamaño de JSON para evitar buffers gigantes
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
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
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('Webhook routes are active:');
    console.log(`- POST http://localhost:${PORT}/openai-chat`);
    console.log(`- POST http://localhost:${PORT}/gemini-chat`);
    console.log(`- POST http://localhost:${PORT}/anthropic-chat`);
    console.log(`- POST http://localhost:${PORT}/mistrall-chat`);
    console.log(`- POST http://localhost:${PORT}/deepseek-chat`);
    console.log(`- POST http://localhost:${PORT}/assistant-chat`);
});
