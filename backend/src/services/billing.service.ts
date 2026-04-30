import prisma from '../models/prisma';

export class BillingService {

  /**
   * Lógica de QuotaGuard: Verifica si el usuario tiene permiso para ejecutar este asistente.
   */
  async checkQuota(userId: number, metaId: string, requestId: string): Promise<void> {
    if (!userId || !metaId || !requestId) {
      throw new Error('Faltan parámetros obligatorios para el control de cuotas (userId, metaId, requestId).');
    }

    // 1. Obtener la definición del asistente del catálogo (MODO ESTRICTO)
    const assistant = await prisma.metaAssistantCatalog.findUnique({
      where: { meta_id: metaId }
    });

    if (!assistant) {
      console.error(`[BillingService] 🛑 Bloqueo: Asistente "${metaId}" no registrado en el catálogo.`);
      throw new Error(`Asistente no autorizado: El ID "${metaId}" no existe en el catálogo oficial.`);
    }

    // 2. Control de Asistentes PRIVADOS
    if (assistant.access_type === 'PRIVATE') {
      if (assistant.owner_id !== userId) {
        throw new Error(`Acceso Denegado: Este asistente es privado.`);
      }
    }

    // 3. Asegurar que el perfil de usuario existe
    await prisma.userProfile.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, plan_type: 'FREE' }
    });

    // 4. Idempotencia
    const existingEvent = await prisma.usageEvent.findUnique({
      where: { request_id: requestId }
    });
    if (existingEvent && (existingEvent.status === 'STARTED' || existingEvent.status === 'SUCCESS')) {
      return;
    }

    // 5. Lógica de Cobro / Trial
    if (assistant.is_premium) {
      const hasAccess = await prisma.userAccess.findUnique({
        where: { user_id_meta_id: { user_id: userId, meta_id: metaId } }
      });

      if (!hasAccess) {
        const successCount = await prisma.usageEvent.count({
          where: { user_id: userId, meta_id: metaId, status: 'SUCCESS' }
        });

        if (successCount >= 5) {
          throw new Error(`Límite de prueba alcanzado (5/5). Por favor, adquiere el asistente "${assistant.name}" para continuar.`);
        }
      }
    }

    // 6. Registrar inicio
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
  }

  /**
   * Actualiza el estado al finalizar con métricas de consumo.
   */
  async updateEventStatus(
    requestId: string, 
    status: 'SUCCESS' | 'FAILED' | 'CANCELLED',
    usage?: { tokens_input?: number; tokens_output?: number; model?: string }
  ): Promise<void> {
    try {
      // Calcular coste estimado (Gemini 2.0 Flash aprox: $0.10/1M input, $0.40/1M output)
      let cost = 0;
      if (usage?.tokens_input && usage?.tokens_output) {
        const inputCost = (usage.tokens_input / 1_000_000) * 0.10;
        const outputCost = (usage.tokens_output / 1_000_000) * 0.40;
        cost = inputCost + outputCost;
      }

      const event = await prisma.usageEvent.update({
        where: { request_id: requestId },
        data: { 
          status,
          tokens_input: usage?.tokens_input || 0,
          tokens_output: usage?.tokens_output || 0,
          model_used: usage?.model || 'unknown',
          cost_usd: cost
        }
      });

      if (status === 'SUCCESS') {
        await prisma.metaAssistantCatalog.update({
          where: { meta_id: event.meta_id },
          data: { total_uses: { increment: 1 } }
        }).catch(() => {});
      }
    } catch (err: any) {
      console.error(`[BillingService] Error actualizando estado ${requestId}:`, err.message);
    }
  }
}

export const billingService = new BillingService();
