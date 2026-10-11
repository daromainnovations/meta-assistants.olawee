import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * 🛡️ SEGURIDAD P0 (Problema 8): CORS y cabeceras de seguridad para Meta API backend.
 * Dado que el frontend React ahora consume el proxy server-side (/api/meta-assistant/:id),
 * el navegador ya NO necesita enviar 'x-api-key' directamente a este servidor.
 *
 * Se elimina 'x-api-key' de los encabezados expuestos a navegadores y se restringen
 * los orígenes de llamada.
 */
export function middleware(request: NextRequest) {
    const origin = request.headers.get('origin');

    // Lista de orígenes de confianza autorizados para llamadas legítimas desde navegadores
    const allowedOrigins = [
        'https://app.olawee.com',
        'https://www.olawee.com',
        'https://olawee.com',
        process.env.FRONTEND_URL
    ].filter(Boolean) as string[];

    const isAllowed = origin && allowedOrigins.includes(origin);

    // Responder preflight OPTIONS de inmediato
    if (request.method === 'OPTIONS') {
        const response = new NextResponse(null, { status: 204 });
        if (isAllowed && origin) {
            response.headers.set('Access-Control-Allow-Origin', origin);
            response.headers.set('Access-Control-Allow-Credentials', 'true');
        }
        response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        // Solo cabeceras estándar necesarias (x-api-key eliminada del CORS de navegadores)
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        response.headers.set('Access-Control-Max-Age', '86400');
        return response;
    }

    const response = NextResponse.next();

    if (isAllowed && origin) {
        response.headers.set('Access-Control-Allow-Origin', origin);
        response.headers.set('Access-Control-Allow-Credentials', 'true');
    }

    // Cabeceras de seguridad defensivas en profundidad
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    return response;
}

export const config = {
    matcher: ['/api/:path*'],
};
