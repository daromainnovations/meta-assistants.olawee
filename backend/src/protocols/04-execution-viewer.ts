import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const colors = {
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
    reset: '\x1b[0m'
};

async function showExecutions() {
    console.log(`\n${colors.cyan}======================================================${colors.reset}`);
    console.log(`${colors.cyan}📝 PROTOCOLO 4B: Visor Multi-Tabla Ejecuciones N8N${colors.reset}`);
    console.log(`${colors.cyan}======================================================${colors.reset}\n`);

    try {
        await prisma.$connect();

        // Obtenemos los últimos 3 de cada tabla para combinarlos y luego los ordenamos todos juntos por fecha
        const chatExecs = await prisma.exec_chats.findMany({ orderBy: { created_at: 'desc' }, take: 3 });
        const asstExecs = await prisma.exec_assistants.findMany({ orderBy: { created_at: 'desc' }, take: 3 });
        const pymesExecs = await prisma.exec_pymes.findMany({ orderBy: { created_at: 'desc' }, take: 3 });

        let allExecs: any[] = [...chatExecs, ...asstExecs, ...pymesExecs];

        // Ordenamos del más reciente al más antiguo
        allExecs.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

        // Mostramos un límite total de 5
        let executions = allExecs.slice(0, 5);

        if (executions.length === 0) {
            console.log(`${colors.yellow}No hay registros de ejecución en ninguna tabla todavía.${colors.reset}\n`);
            return;
        }

        console.log(`${colors.cyan}Historial Global de Ejecuciones (Tus últimos 5 registros entre Chats, Asistentes, PYMES y Beta):${colors.reset}\n`);

        for (const exec of executions) {
            const statusColor = exec.status === 'SUCCESS' ? colors.green : colors.red;

            let sourceTable = 'AI Chats';
            if (exec.provider === 'assistant') sourceTable = 'Asistentes de IA';
            if (exec.provider === 'pymes-assistant') sourceTable = 'Assistant Pymes';
            if (exec.provider === 'meta-assistant') sourceTable = 'Meta Assistants';

            console.log(`${colors.yellow}[${exec.created_at.toISOString()}]${colors.reset} ID: ${exec.id} | ${colors.cyan}(${sourceTable})${colors.reset}`);
            console.log(`-> Proveedor: ${colors.blue}${exec.provider}${colors.reset} | Estado: ${statusColor}${exec.status}${colors.reset}`);

            let inputSnippet = JSON.stringify(exec.input);
            if (inputSnippet && inputSnippet.length > 80) inputSnippet = inputSnippet.substring(0, 80) + '...';
            console.log(`-> Input (Truncado): ${inputSnippet}`);

            let outputSnippet = JSON.stringify(exec.output);
            if (outputSnippet && outputSnippet.length > 80) outputSnippet = outputSnippet.substring(0, 80) + '...';
            console.log(`-> Output (Truncado): ${outputSnippet}\n`);
        }

        const c1 = await prisma.exec_chats.count();
        const c2 = await prisma.exec_assistants.count();
        const c3 = await prisma.exec_pymes.count();

        console.log(`${colors.cyan}Total de tu BD Segmentada:${colors.reset} ${c1} (Chats) | ${c2} (Assistants) | ${c3} (PYMES).`);
        console.log(`${colors.cyan}La auto-limpieza de (> 7 días) está operativa de forma silenciosa e independiente por tabla.${colors.reset}\n`);

    } catch (e: any) {
        console.error(`Error conectando a Prisma DB: ${e.message}`);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}

showExecutions();
