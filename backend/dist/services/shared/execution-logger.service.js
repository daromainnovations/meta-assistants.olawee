"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executionLoggerService = exports.ExecutionLoggerService = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
class ExecutionLoggerService {
    async logExecution(provider, inputPayload, outputData, status) {
        try {
            const dataToSave = {
                provider,
                status,
                input: inputPayload || {},
                output: outputData || {}
            };
            let tableTarget;
            if (provider === 'assistant') {
                tableTarget = prisma.exec_assistants;
            }
            else if (provider === 'pymes-assistant') {
                tableTarget = prisma.exec_pymes;
            }
            else {
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
            }).catch((e) => console.error('[ExecutionLogger] Error en auto-limpieza:', e.message));
        }
        catch (error) {
            console.error('[ExecutionLogger] Error guardando registro de ejecución en DB:', error.message);
        }
    }
}
exports.ExecutionLoggerService = ExecutionLoggerService;
exports.executionLoggerService = new ExecutionLoggerService();
