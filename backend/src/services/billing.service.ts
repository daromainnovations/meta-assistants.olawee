import prisma from '../models/prisma';

export interface UsageQuota {
  plan_type: string;
  limit: number;
}

const PLAN_LIMITS: Record<string, number> = {
  'FREE': 5,      // 5 interacciones gratis por meta-asistente
  'PRO': 10000,   // Prácticamente ilimitado
  'ENTERPRISE': 50000
};

export class BillingService {

  /**
   * Verifica la cuota del usuario y registra el inicio de la ejecución (Idempotencia).
   * @param userId UUID de Supabase Auth
   * @param metaId ID del asistente
   * @param requestId UUID único de la petición generado por el frontend
   */
  async checkQuota(userId: string, metaId: string, requestId: string): Promise<void> {
    if (!userId || !metaId || !requestId) {
      throw new Error('Faltan parámetros obligatorios para el control de cuotas (userId, metaId, requestId).');
    }

    // 1. Asegurar que el perfil de usuario existe (Upsert silencioso)
    // Usamos el ID de Supabase. Si no existe, lo creamos como FREE.
    await prisma.userProfile.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, plan_type: 'FREE' }
    });

    // 2. Verificar si el evento ya existe (Idempotencia)
    const existingEvent = await prisma.usageEvent.findUnique({
      where: { request_id: requestId }
    });

    if (existingEvent) {
      // Si ya existe y no ha fallado, permitimos continuar sin descontar doble
      if (existingEvent.status === 'STARTED' || existingEvent.status === 'SUCCESS') {
        console.log(`[BillingService] 🔄 Idempotencia detectada para request_id: ${requestId}. Continuando...`);
        return;
      }
      // Si el estado era FAILED o CANCELLED, permitimos reintentar (se creará un nuevo registro o se actualizará)
    }

    // 3. Contar usos actuales del usuario para este meta-asistente
    // Excluimos los fallidos o cancelados para no penalizar al usuario
    const usageCount = await prisma.usageEvent.count({
      where: {
        user_id: userId,
        meta_id: metaId,
        status: { in: ['STARTED', 'SUCCESS'] }
      }
    });

    // 4. Obtener el plan del usuario
    const userProfile = await prisma.userProfile.findUnique({ where: { id: userId } });
    const limit = PLAN_LIMITS[userProfile?.plan_type || 'FREE'];

    if (usageCount >= limit) {
      throw new Error(`Cuota excedida para el asistente "${metaId}". Límite del plan ${userProfile?.plan_type}: ${limit} ejecuciones.`);
    }

    // 5. Registrar el inicio de la ejecución
    await prisma.usageEvent.upsert({
      where: { request_id: requestId },
      update: { status: 'STARTED' },
      create: {
        request_id: requestId,
        user_id: userId,
        meta_id: metaId,
        status: 'STARTED'
      }
    });

    console.log(`[BillingService] ✅ Cuota verificada y evento STARTED para ${userId} en ${metaId}`);
  }

  /**
   * Actualiza el estado de un evento de uso.
   */
  async updateEventStatus(requestId: string, status: 'SUCCESS' | 'FAILED' | 'CANCELLED'): Promise<void> {
    try {
      const event = await prisma.usageEvent.update({
        where: { request_id: requestId },
        data: { status }
      });

      // Si es SUCCESS, incrementamos el contador atómico del catálogo
      if (status === 'SUCCESS') {
        await this.incrementCatalogUsage(event.meta_id);
      }

      console.log(`[BillingService] 📊 Estado de evento ${requestId} actualizado a: ${status}`);
    } catch (err: any) {
      console.error(`[BillingService] ❌ Error actualizando estado de evento ${requestId}:`, err.message);
    }
  }

  /**
   * Incrementa de forma atómica el contador de uso en el catálogo.
   */
  private async incrementCatalogUsage(metaId: string): Promise<void> {
    try {
      await prisma.metaAssistantCatalog.upsert({
        where: { meta_id: metaId },
        update: { total_uses: { increment: 1 } },
        create: { 
          meta_id: metaId, 
          name: metaId, // Nombre por defecto si no existe
          category: 'General', 
          total_uses: 1 
        }
      });
    } catch (err: any) {
      console.error(`[BillingService] ❌ Error incrementando catálogo para ${metaId}:`, err.message);
    }
  }
}

export const billingService = new BillingService();
