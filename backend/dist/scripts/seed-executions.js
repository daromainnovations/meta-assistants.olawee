"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function seed() {
    console.log('🌱 Sembrando datos de ejemplo en tabla executions...');
    try {
        // Limpiamos si hay algo (opcional)
        // await prisma.executions.deleteMany({});
        const now = new Date();
        await prisma.executions.createMany({
            data: [
                {
                    category: 'llm',
                    provider: 'gemini-2.0-flash',
                    environment: 'staging',
                    status: 'SUCCESS',
                    duration_ms: 1240,
                    input: { chatInput: 'Hola Olawee, dime qué puedes hacer', session_id: 'test-session-001' },
                    output: { status: 'success', ai_response: '¡Hola! Soy tu asistente inteligente OLAWEE...' },
                    created_at: new Date(now.getTime() - 1000 * 60 * 10) // hace 10 min
                },
                {
                    category: 'assistant',
                    provider: 'assistant',
                    environment: 'staging',
                    status: 'SUCCESS',
                    duration_ms: 3500,
                    input: { chatInput: 'Analiza este reporte de ventas', session_id: 'test-session-002', model: 'gpt-4o' },
                    output: { status: 'success', ai_response: 'El reporte muestra un incremento del 15% en el Q1...' },
                    created_at: new Date(now.getTime() - 1000 * 60 * 5) // hace 5 min
                },
                {
                    category: 'meta',
                    provider: 'invoice_checker',
                    environment: 'staging',
                    status: 'SUCCESS',
                    duration_ms: 5400,
                    input: { chatInput: 'Validar factura #440', session_id: 'test-session-003', meta_id: 'invoice_checker' },
                    output: { status: 'success', ai_response: 'Factura validada: El CIF coincide y los totales son correctos.' },
                    created_at: new Date(now.getTime() - 1000 * 60 * 2) // hace 2 min
                },
                {
                    category: 'llm',
                    provider: 'gpt-4o',
                    environment: 'staging',
                    status: 'ERROR',
                    duration_ms: 450,
                    input: { chatInput: 'Este mensaje causará un error', session_id: 'test-session-004' },
                    output: { status: 'error', message: 'Rate limit reached' },
                    error: { message: 'Rate limit reached', stack: 'Error: Rate limit reached\n    at ChatHandlerService.processMessage (service.ts:44)' },
                    created_at: new Date(now.getTime() - 1000 * 60 * 1) // hace 1 min
                }
            ]
        });
        console.log('✅ Datos de ejemplo insertados correctamente.');
    }
    catch (error) {
        console.error('❌ Error sembrando datos:', error.message);
    }
    finally {
        await prisma.$disconnect();
    }
}
seed();
