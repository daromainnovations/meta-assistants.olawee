import { getPrisma } from '../services/shared/prisma.service';

// ============================================================
// 🛡️ EXECUTION LOGGER — Servicio Unificado de Registro
// ============================================================
// Registra todas las ejecuciones en la tabla unificada `executions`.
// Categorías:
//   'llm'       → openai, gemini, anthropic, mistral, deepseek
//   'assistant' → openai assistants con herramientas
//   'meta'      → meta-assistants especializados
// ============================================================

const db = getPrisma();
const environment = process.env.APP_ENV === 'staging' ? 'staging' : 'production';

// Determina la categoría a partir del provider
function getCategory(provider: string): string {
    if (provider === 'assistant') return 'assistant';
    if (provider === 'meta-assistant' || !['openai', 'gemini', 'anthropic', 'mistral', 'deepseek'].includes(provider)) {
        // Cualquier meta_id (invoice_checker, doc_comparator, etc.) va como 'meta'
        if (!['openai', 'gemini', 'anthropic', 'mistral', 'deepseek', 'assistant'].includes(provider)) return 'meta';
    }
    return 'llm';
}

export class ExecutionLoggerService {

    /**
     * Registra una ejecución en la tabla unificada `executions`.
     *
     * @param provider  - 'openai' | 'gemini' | 'anthropic' | 'mistral' | 'deepseek' | 'assistant' | 'invoice_checker' | ...
     * @param inputPayload - datos de entrada (body de la petición)
     * @param outputData   - datos de salida (respuesta del servicio)
     * @param status       - 'SUCCESS' | 'ERROR'
     * @param durationMs   - tiempo de respuesta en ms (opcional)
     * @param error        - traza del error si status === 'ERROR' (opcional)
     */
    async logExecution(
        provider: string,
        inputPayload: any,
        outputData: any,
        status: 'SUCCESS' | 'ERROR',
        durationMs?: number,
        error?: any
    ) {
        try {
            const category = getCategory(provider);

            await db.executions.create({
                data: {
                    category,
                    provider,
                    environment,
                    status,
                    duration_ms: durationMs ?? null,
                    input: inputPayload || {},
                    output: outputData || {},
                    error: error ? { message: error.message, stack: error.stack } : null
                }
            });

            // GESTIÓN DE BASURA AUTOMÁTICA (> 7 días)
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            db.executions.deleteMany({
                where: { created_at: { lt: sevenDaysAgo } }
            }).catch((e: Error) => console.error('[ExecutionLogger] Error en auto-limpieza:', e.message));

        } catch (err: any) {
            console.error('[ExecutionLogger] Error guardando registro de ejecución en DB:', err.message);
        }
    }
}

export const executionLoggerService = new ExecutionLoggerService();
