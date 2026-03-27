import { getPrisma } from '../services/shared/prisma.service';

const db = getPrisma();

// ============================================================
// 📊 EXECUTIONS CONTROLLER — API endpoint /api/executions
// ============================================================
// Sirve los datos al panel de control del frontend.
// Devuelve las últimas 100 ejecuciones ordenadas por fecha.
// ============================================================

export async function getExecutions(req: any, res: any) {
    try {
        const { category, status, limit = 100 } = req.query;

        const where: any = {};
        if (category && category !== 'all') where.category = category;
        if (status && status !== 'all') where.status = status.toString().toUpperCase();

        const executions = await db.executions.findMany({
            where,
            orderBy: { created_at: 'desc' },
            take: Number(limit)
        });

        // Stats para el panel
        const totalCount = await db.executions.count({ where: {} });
        const successCount = await db.executions.count({ where: { status: 'SUCCESS' } });
        const errorCount = await db.executions.count({ where: { status: 'ERROR' } });
        const lastExec = await db.executions.findFirst({ orderBy: { created_at: 'desc' } });

        res.json({
            executions,
            stats: {
                total: totalCount,
                success: successCount,
                errors: errorCount,
                lastAt: lastExec?.created_at ?? null
            }
        });

    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}
