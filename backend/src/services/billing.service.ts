import prisma from '../models/prisma';

export class BillingService {

  /**
   * Lógica de QuotaGuard: Verifica si el usuario tiene permiso para ejecutar este asistente.
   */
  async checkQuota(userId: number, metaId: string, requestId: string): Promise<void> {
    if (!userId || !metaId || !requestId) {
      throw new Error('Faltan parámetros obligatorios para el control de cuotas (userId, metaId, requestId).');
    }

    // 1. Obtener la definición del asistente del catálogo
    const assistant = await prisma.metaAssistantCatalog.findUnique({
      where: { meta_id: metaId }
    });

    if (!assistant) {
      // Si no está en el catálogo, lo permitimos pero avisamos (podrías bloquearlo si quieres ser estricto)
      console.warn(`[BillingService] ⚠️ Asistente "${metaId}" no registrado en el catálogo.`);
      return;
    }

    // 2. Control de Asistentes PRIVADOS
    if (assistant.access_type === 'PRIVATE') {
      if (assistant.owner_id !== userId) {
        throw new Error(`Acceso Denegado: Este asistente es privado y solo puede ser usado por su propietario.`);
      }
    }

    // 3. Asegurar que el perfil de usuario existe
    await prisma.userProfile.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, plan_type: 'FREE' }
    });

    // 4. Idempotencia: Verificar si el evento ya existe
    const existingEvent = await prisma.usageEvent.findUnique({
      where: { request_id: requestId }
    });
    if (existingEvent && (existingEvent.status === 'STARTED' || existingEvent.status === 'SUCCESS')) {
      return;
    }

    // 5. Lógica de Cobro / Trial si es PREMIUM
    if (assistant.is_premium) {
      // 5.1 Verificar si el usuario ha COMPRADO el acceso (UNLIMITED)
      const hasAccess = await prisma.userAccess.findUnique({
        where: { user_id_meta_id: { user_id: userId, meta_id: metaId } }
      });

      if (!hasAccess) {
        // 5.2 Si no ha comprado, verificamos la prueba gratuita (5 usos exitosos)
        const successCount = await prisma.usageEvent.count({
          where: {
            user_id: userId,
            meta_id: metaId,
            status: 'SUCCESS'
          }
        });

        if (successCount >= 5) {
          throw new Error(`Has alcanzado el límite de 5 usos gratuitos para el asistente Premium "${assistant.name}". Por favor, cómpralo para continuar.`);
        }
        
        console.log(`[BillingService] 🎁 Trial en uso (${successCount + 1}/5) para ${userId} en ${metaId}`);
      }
    }

    // 6. Registrar el inicio de la ejecución
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
   * Actualiza el estado al finalizar (Success o Failure).
   */
  async updateEventStatus(requestId: string, status: 'SUCCESS' | 'FAILED' | 'CANCELLED'): Promise<void> {
    try {
      const event = await prisma.usageEvent.update({
        where: { request_id: requestId },
        data: { status }
      });

      // Incrementar popularidad solo en éxitos
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
