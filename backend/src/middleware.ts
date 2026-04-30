import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://app.olawee.com',
    'https://staging.olawee.com',
    'https://api.olawee.com',
];

export function middleware(request: NextRequest) {
    const origin = request.headers.get('origin') ?? '';

    // Verifica si el origen que hace la petición está en la lista permitida
    const isAllowedOrigin = allowedOrigins.includes(origin);
    // Usa el origen de la petición si está permitido, si no, usa el primero por defecto (para asegurar que la cabecera exista pero solo de acceso al primero si no hace match)
    const allowOrigin = isAllowedOrigin ? origin : allowedOrigins[0];

    // 1. Manejar la Petición Pre-flight (OPTIONS)
    if (request.method === 'OPTIONS') {
        return new NextResponse(null, {
            status: 204, // 204 No Content es ideal para pre-flight
            headers: {
                'Access-Control-Allow-Origin': allowOrigin,
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Authorization',
            },
        });
    }

    // 2. Manejar la Petición Real (POST, GET, etc.)
    const response = NextResponse.next();
    response.headers.set('Access-Control-Allow-Origin', allowOrigin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization');

    return response;
}

export const config = {
    // Aplicar el CORS a todas las rutas de la API
    matcher: '/api/:path*',
};
