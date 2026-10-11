import { NextResponse } from 'next/server';

/**
 * 🛡️ SEGURIDAD P0 (Problema 4): Endpoint de ejecuciones bloqueado.
 * Anteriormente este endpoint era público y exponía inputs, outputs y métricas de IA.
 *
 * Al no existir consumidores legítimos de cliente, se bloquea directamente con 403 Forbidden
 * sin dependencias ni imports de controladores.
 */
export async function GET() {
    return NextResponse.json(
        {
            status: 'error',
            message: 'Forbidden: Endpoint administrativo no disponible.'
        },
        { status: 403 }
    );
}
