import { NextResponse } from 'next/server';

/**
 * 🛡️ SEGURIDAD P0 (Problema 5): Endpoint de reintento de ejecuciones bloqueado.
 * Anteriormente permitía a cualquier usuario reejecutar pipelines de IA sin autenticación.
 *
 * Se bloquea directamente con 403 Forbidden sin dependencias de controladores ni imports.
 */
export async function POST() {
    return NextResponse.json(
        {
            status: 'error',
            message: 'Forbidden: Endpoint de reintento deshabilitado.'
        },
        { status: 403 }
    );
}
