import { getPrisma } from '../services/shared/prisma.service';
import { webhookService } from '../services/webhook.service';

const db = getPrisma();

// ============================================================
// 📊 EXECUTIONS CONTROLLER — API endpoints
// ============================================================

export async function getExecutions(req: any, res: any) {
    try {
        const { category, status, env, search, limit = 100 } = req.query;
        // ... (rest of code stays the same)

        const where: any = {};
        if (category && category !== 'all') where.category = category;
        if (status && status !== 'all') where.status = status.toString().toUpperCase();
        if (env && env !== 'all') where.environment = env;

        console.log(`[API v1.1] Fetching executions: category=${category}, env=${env}, search=${search}`);

        let executions;
        if (search) {
            let queryStr = `SELECT * FROM "pruebas_executions"."executions" WHERE (CAST(input AS TEXT) ILIKE $1 OR CAST(output AS TEXT) ILIKE $1)`;
            const params: any[] = [`%${search}%`];
            
            if (where.category) { params.push(where.category); queryStr += ` AND category = $${params.length}`; }
            if (where.environment) { params.push(where.environment); queryStr += ` AND environment = $${params.length}`; }
            if (where.status) { params.push(where.status); queryStr += ` AND status = $${params.length}`; }

            queryStr += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
            params.push(Number(limit));

            executions = await db.$queryRawUnsafe(queryStr, ...params);
        } else {
            executions = await db.executions.findMany({
                where,
                orderBy: { created_at: 'desc' },
                take: Number(limit)
            });
        }

        // Stats consolidadas en una sola query (más rápido)
        let statsQuery = `
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'SUCCESS') as success,
                COUNT(*) FILTER (WHERE status = 'ERROR') as errors
            FROM "pruebas_executions"."executions"
            WHERE 1=1
        `;
        const statsParams: any[] = [];
        if (where.category) { statsParams.push(where.category); statsQuery += ` AND category = $${statsParams.length}`; }
        if (where.environment) { statsParams.push(where.environment); statsQuery += ` AND environment = $${statsParams.length}`; }

        const stats: any = await db.$queryRawUnsafe(statsQuery, ...statsParams);
        console.log(`[API] Stats query results:`, stats);

        // Data para Gráfica (24h)
        const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        let chartQuery = `
            SELECT 
                date_trunc('hour', created_at) as hour,
                COUNT(*) FILTER (WHERE status = 'SUCCESS')::int as success,
                COUNT(*) FILTER (WHERE status = 'ERROR')::int as errors
            FROM "pruebas_executions"."executions"
            WHERE created_at > $1
        `;
        const chartParams: any[] = [last24h];
        if (where.category) { chartParams.push(where.category); chartQuery += ` AND category = $${chartParams.length}`; }
        if (where.environment) { chartParams.push(where.environment); chartQuery += ` AND environment = $${chartParams.length}`; }
        
        chartQuery += ` GROUP BY 1 ORDER BY 1 ASC`;

        console.log(`[API] Chart query: ${chartQuery} [${chartParams}]`);
        const chartData: any = await db.$queryRawUnsafe(chartQuery, ...chartParams);
        
        // Data para Gráfica Semanal (7 días)
        const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        let weeklyQuery = `
            SELECT 
                date_trunc('day', created_at) as day,
                COUNT(*) FILTER (WHERE status = 'SUCCESS')::int as success,
                COUNT(*) FILTER (WHERE status = 'ERROR')::int as errors
            FROM "pruebas_executions"."executions"
            WHERE created_at > $1
        `;
        const weeklyParams: any[] = [last7d];
        if (where.category) { weeklyParams.push(where.category); weeklyQuery += ` AND category = $${weeklyParams.length}`; }
        if (where.environment) { weeklyParams.push(where.environment); weeklyQuery += ` AND environment = $${weeklyParams.length}`; }
        weeklyQuery += ` GROUP BY 1 ORDER BY 1 ASC`;

        const weeklyData: any = await db.$queryRawUnsafe(weeklyQuery, ...weeklyParams);

        res.json({
            executions,
            stats: {
                total: Number(stats[0]?.total || 0),
                success: Number(stats[0]?.success || 0),
                errors: Number(stats[0]?.errors || 0),
                lastAt: executions[0]?.created_at ?? null
            },
            chartData: chartData.map((d: any) => ({
                hour: d.hour,
                success: Number(d.success || 0),
                errors: Number(d.errors || 0)
            })),
            weeklyTrends: weeklyData.map((d: any) => ({
                day: d.day,
                success: Number(d.success || 0),
                errors: Number(d.errors || 0)
            }))
        });

    } catch (e: any) {
        console.error('[Executions Controller Error]:', e);
        res.status(500).json({ error: e.message });
    }
}

/**
 * RE-EJECUTAR (Retry): Toma una ejecución previa y vuelve a lanzarla al webhookService
 */
export async function retryExecution(req: any, res: any) {
    try {
        const { id } = req.params;
        const previous = await db.executions.findUnique({ where: { id } });

        if (!previous) {
            return res.status(404).json({ error: 'Execución no encontrada' });
        }

        console.log(`[Executions] 🔄 Retrying execution ${id} (${previous.provider})`);
        
        // El input guardado es exactamente lo que recibió el webhookService
        // IMPORTANTE: El webhookService espera (provider, body, files)
        const result = await webhookService.handleIncomingRequest(
            previous.provider === 'assistant' ? 'assistant' : (previous.category === 'meta' ? 'meta-assistant' : previous.provider),
            previous.input,
            [] // Files se pierden en el retry si se guardaron en memoria (limitación aceptada)
        );

        res.json({ status: 'success', message: 'Re-ejecución completada', result });

    } catch (e: any) {
        console.error('[Executions] Retry failed:', e.message);
        res.status(500).json({ error: e.message });
    }
}
