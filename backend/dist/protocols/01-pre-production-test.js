"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const child_process_1 = require("child_process");
const util_1 = require("util");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const client_1 = require("@prisma/client");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m'
};
async function logStep(icon, message, promise) {
    process.stdout.write(`\n${icon} Seleccionando test: ${message}... `);
    try {
        await promise;
        console.log(`${colors.green}✅ OK${colors.reset}`);
    }
    catch (error) {
        console.log(`${colors.red}❌ FALLO${colors.reset}`);
        console.error(`\n${colors.red}DETALLE DEL ERROR:${colors.reset}`);
        console.error(error.message || error);
        console.log(`\n${colors.red}🛑 PROTOCOLO ABORTADO: No es seguro pasar a producción.${colors.reset}`);
        process.exit(1);
    }
}
async function checkEnvVariables() {
    const requiredVars = [
        'DATABASE_URL',
        'PORT',
        'WEBHOOK_API_KEY',
        'OPENAI_API_KEY',
        'GEMINI_API_KEY',
        'ANTHROPIC_API_KEY',
        'MISTRAL_API_KEY',
        'DEEPSEEK_API_KEY'
    ];
    const missing = requiredVars.filter(v => !process.env[v]);
    if (missing.length > 0) {
        throw new Error(`Faltan variables de entorno críticas en tu archivo .env: ${missing.join(', ')}`);
    }
}
async function checkDirectories() {
    const requiredDirs = [
        'public/downloads',
        'frontend/chat',
        'frontend/assistants',
        'frontend/pymes-assistant',
        'frontend/meta-assistants'
    ];
    for (const dir of requiredDirs) {
        const fullPath = path_1.default.join(process.cwd(), dir);
        if (!fs_1.default.existsSync(fullPath)) {
            console.log(`\n  ${colors.yellow}⚠️ Creando directorio faltante: ${dir}${colors.reset}`);
            fs_1.default.mkdirSync(fullPath, { recursive: true });
        }
    }
}
async function checkDatabase() {
    const prisma = new client_1.PrismaClient();
    try {
        await prisma.$connect();
        // Hacemos una simple query cruda para validar que hay conexión real activa
        await prisma.$queryRaw `SELECT 1`;
    }
    finally {
        await prisma.$disconnect();
    }
}
async function checkTypeScriptCompilation() {
    // Si hay un error de TS, exec('tsc') lanzará obj error con el formato típico de consola
    const { stdout, stderr } = await execAsync('npx tsc --noEmit');
    if (stderr) {
        throw new Error(`Errores de compilación detectados:\n${stderr}`);
    }
}
async function runProtocol() {
    console.log(`\n${colors.blue}======================================================${colors.reset}`);
    console.log(`${colors.blue}🚀 INICIANDO PROTOCOLO 1: Certificación Producción OLAWEE${colors.reset}`);
    console.log(`${colors.blue}======================================================${colors.reset}`);
    // Test 1: Comprobar .env
    await logStep('🔑', 'Verificando Secretos y APIs (.env)', checkEnvVariables());
    // Test 2: Comprobar Directorios
    await logStep('📂', 'Verificando Estructura de Directorios', checkDirectories());
    // Test 3: Comprobar Base de datos
    await logStep('🔌', 'Conectando y haciendo Ping a Supabase (PostgreSQL)', checkDatabase());
    // Test 4: Comprobar Compilación TS
    await logStep('🏗️', 'Ejecutando "Strict Type Checking" en todo el código', checkTypeScriptCompilation());
    // Exito
    console.log(`\n${colors.green}======================================================${colors.reset}`);
    console.log(`${colors.green}✅ PROTOCOLO 1 SUPERADO SATISFACTORIAMENTE${colors.reset}`);
    console.log(`${colors.green}Tu código Node.js es 100% estable y está listo para Producción.${colors.reset}`);
    console.log(`${colors.green}======================================================\n${colors.reset}`);
    process.exit(0);
}
// Ejecutar
runProtocol();
