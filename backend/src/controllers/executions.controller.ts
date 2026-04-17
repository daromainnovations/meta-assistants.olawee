import { NextRequest, NextResponse } from 'next/server';
import prisma from '../models/prisma';
import { webhookService } from '../services/webhook.service';

/**
 * ExecutionController (MVC)
 * Maneja la lectura de logs de ejecución y re-intentos.
 */
export class ExecutionController {
    
    /**
     * Obtiene la lista de ejecuciones con filtros y estadísticas.
     */
    async list(req: NextRequest) {
        try {
            const { searchParams } = new URL(req.url);
            const category = searchParams.get('category');
            const status = searchParams.get('status');
            const env = searchParams.get('env');
            const search = searchParams.get('search');
            const limit = parseInt(searchParams.get('limit') || '100');

            const where: any = {};
            if (category && category !== 'all') where.category = category;
            if (status && status !== 'all') where.status = status.toString().toUpperCase();
            if (env && env !== 'all') where.environment = env;

            console.log(`[ExecutionController] Fetching: category=${category}, env=${env}, search=${search}`);

            let executions;
            if (search) {
                let queryStr = `SELECT * FROM "pruebas_executions"."executions" WHERE (CAST(input AS TEXT) ILIKE $1 OR CAST(output AS TEXT) ILIKE $1)`;
                const params: any[] = [`%${search}%`];
                
                if (where.category) { params.push(where.category); queryStr += ` AND category = $${params.length}`; }
                if (where.environment) { params.push(where.environment); queryStr += ` AND environment = $${params.length}`; }
                if (where.status) { params.push(where.status); queryStr += ` AND status = $${params.length}`; }

                queryStr += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
                params.push(limit);

                executions = await prisma.$queryRawUnsafe(queryStr, ...params);
            } else {
                executions = await prisma.executions.findMany({
                    where,
                    orderBy: { created_at: 'desc' },
                    take: limit
                });
            }

            // Stats consolidadas
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

            const statsRaw: any = await prisma.$queryRawUnsafe(statsQuery, ...statsParams);
            
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
            const chartData: any = await prisma.$queryRawUnsafe(chartQuery, ...chartParams);
            
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
            const weeklyData: any = await prisma.$queryRawUnsafe(weeklyQuery, ...weeklyParams);

            return NextResponse.json({
                executions,
                stats: {
                    total: Number(statsRaw[0]?.total || 0),
                    success: Number(statsRaw[0]?.success || 0),
                    errors: Number(statsRaw[0]?.errors || 0),
                    lastAt: (executions as any)[0]?.created_at ?? null
                },
                chartData: (chartData as any[]).map((d: any) => ({
                    hour: d.hour,
                    success: Number(d.success || 0),
                    errors: Number(d.errors || 0)
                })),
                weeklyTrends: (weeklyData as any[]).map((d: any) => ({
                    day: d.day,
                    success: Number(d.success || 0),
                    errors: Number(d.errors || 0)
                }))
            });

        } catch (error: any) {
            console.error('[ExecutionController] list failed:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
    }

    /**
     * Re-ejecuta una entrada previa del log.
     */
    async retry(id: string) {
        try {
            const previous = await prisma.executions.findUnique({ where: { id } });

            if (!previous) {
                return NextResponse.json({ error: 'Execución no encontrada' }, { status: 404 });
            }

            console.log(`[ExecutionController] 🔄 Retrying execution ${id} (${previous.provider})`);
            
            // Mismo mapeo que el controlador legacy
            const providerToUse = previous.provider === 'assistant' 
                ? 'assistant' 
                : (previous.category === 'meta' ? 'meta-assistant' : previous.provider);

            const result = await webhookService.handleIncomingRequest(
                providerToUse,
                previous.input,
                [] // Los archivos se pierden en el retry
            );

            return NextResponse.json({ status: 'success', message: 'Re-ejecución completada', result });

        } catch (error: any) {
            console.error('[ExecutionController] retry failed:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
    }
}

export const executionController = new ExecutionController();
