import { NextResponse } from 'next/server';

/**
 * Route Handler para replicar el endpoint /config.js legacy.
 * Provee la configuración dinámica al frontend.
 */
export async function GET() {
  const isStaging = process.env.APP_ENV === 'staging';
  // El prefijo ahora apunta a /api/webhook/ para coincidir con la nueva estructura
  const prefix = isStaging ? '/api/webhook/QA' : '/api/webhook/';
  
  const content = `window.API_PREFIX = "${prefix}";`;
  
  return new NextResponse(content, {
    headers: {
      'Content-Type': 'application/javascript',
    },
  });
}
