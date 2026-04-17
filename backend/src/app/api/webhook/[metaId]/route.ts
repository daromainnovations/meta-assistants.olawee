import { NextRequest } from 'next/server';
import { webhookController } from '../../../../controllers/webhook.controller';

/**
 * Route Handler para Webhooks Especializados de Meta-Asistentes.
 * Maneja rutas como: /api/webhook/invoice_checker, /api/webhook/cv_screening_rrhh, etc.
 */

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ metaId: string }> }
) {
  const { metaId } = await params;

  return webhookController.handleSpecialistRequest(req, metaId);
}

// Opciones de configuración del Route Handler
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutos de tiempo de ejecución (si el plan lo permite)
