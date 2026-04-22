import { NextRequest } from 'next/server';
import { assistantsController } from '../../../../../controllers/assistants.controller';

/**
 * Route Handler para la API de Asistentes Especializados.
 * Ruta: /api/v1/assistants/[metaId]
 */

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ metaId: string }> }
) {
  const { metaId } = await params;

  return assistantsController.executeAssistant(req, metaId);
}

// Opciones de configuración de la API
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutos de tiempo de ejecución
