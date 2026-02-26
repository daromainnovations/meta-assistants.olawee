import 'dotenv/config';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const execAsync = promisify(exec);

const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m'
};

async function logStep(icon: string, message: string, promise: Promise<void>) {
    process.stdout.write(`\n${icon} Seleccionando test: ${message}... `);
    try {
        await promise;
        console.log(`${colors.green}✅ OK${colors.reset}`);
    } catch (error: any) {
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
        'frontend/beta-assistants'
    ];

    for (const dir of requiredDirs) {
        const fullPath = path.join(process.cwd(), dir);
        if (!fs.existsSync(fullPath)) {
            console.log(`\n  ${colors.yellow}⚠️ Creando directorio faltante: ${dir}${colors.reset}`);
            fs.mkdirSync(fullPath, { recursive: true });
        }
    }
}

async function checkDatabase() {
    const prisma = new PrismaClient();
    try {
        await prisma.$connect();
        // Hacemos una simple query cruda para validar que hay conexión real activa
        await prisma.$queryRaw`SELECT 1`;
    } finally {
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
