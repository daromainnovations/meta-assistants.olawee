import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class ExecutionLoggerService {
    async logExecution(provider: string, inputPayload: any, outputData: any, status: 'SUCCESS' | 'ERROR') {
        try {
            const dataToSave = {
                provider,
                status,
                input: inputPayload || {},
                output: outputData || {}
            };

            let tableTarget: any;

            if (provider === 'assistant') {
                tableTarget = prisma.exec_assistants;
            } else {
                tableTarget = prisma.exec_chats;
            }

            // Guardar la ejecución en la tabla específica según el tipo
            await tableTarget.create({ data: dataToSave });

            // GESTIÓN DE BASURA AUTOMÁTICA (Garbage Collection > 7 días)
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            tableTarget.deleteMany({
                where: {
                    created_at: { lt: sevenDaysAgo }
                }
            }).catch((e: Error) => console.error('[ExecutionLogger] Error en auto-limpieza:', e.message));

        } catch (error: any) {
            console.error('[ExecutionLogger] Error guardando registro de ejecución en DB:', error.message);
        }
    }
}

export const executionLoggerService = new ExecutionLoggerService();
