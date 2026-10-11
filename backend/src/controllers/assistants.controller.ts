import { NextRequest, NextResponse } from 'next/server';
import { assistantsService } from '../services/assistants.service';

/**
 * AssistantsController
 *
 * Capa de Controlador (MVC) que maneja las solicitudes API de los Asistentes,
 * valida autenticación server-to-server con soporte Dual-Key determinista, garantiza la
 * identidad real del usuario (x-authenticated-user-id) tanto en JSON como
 * Multipart/FormData, y delega la ejecución al servicio.
 */
export class AssistantsController {

    /**
     * Procesa la ejecución de un Meta-Asistente especializado vía API.
     */
    async executeAssistant(req: NextRequest, metaId: string) {
        try {
            console.log(`\n[API Controller] 🚀 Processing API request for Assistant: [${metaId}]`);

            // 1. 🔑 Verificación de API Key con soporte Dual-Key determinista (Punto 5)
            const apiKey = req.headers.get('x-api-key');

            // Durante la rotación activa (CURRENT / NEXT definidos), se evalúan
            // EXCLUSIVAMENTE estas variables, ignorando cualquier residuo en la legacy WEBHOOK_API_KEY.
            const dualKeys = [
                process.env.WEBHOOK_API_KEY_CURRENT,
                process.env.WEBHOOK_API_KEY_NEXT
            ].filter(Boolean) as string[];

            const validKeys = dualKeys.length > 0
                ? dualKeys
                : (process.env.WEBHOOK_API_KEY ? [process.env.WEBHOOK_API_KEY] : []);

            if (!apiKey || validKeys.length === 0 || !validKeys.includes(apiKey)) {
                console.warn(`[API Controller] 🛑 Rechazada petición con API Key inválida o revocada.`);
                return NextResponse.json(
                    { status: 'error', message: 'Forbidden: Invalid API Key' },
                    { status: 403 }
                );
            }

            // 2. 🛡️ Extracción de Identidad Confiable (Problema 2)
            // Solo aceptamos la identidad provista por la cabecera x-authenticated-user-id
            // enviada por el proxy verificado de Vercel.
            const authenticatedUserId = req.headers.get('x-authenticated-user-id');
            if (!authenticatedUserId) {
                console.warn(`[API Controller] 🛑 Petición rechazada: Falta cabecera de identidad x-authenticated-user-id.`);
                return NextResponse.json(
                    { status: 'error', message: 'Forbidden: Missing authenticated user identity' },
                    { status: 403 }
                );
            }

            const contentType = req.headers.get('content-type') || '';
            let body: any = {};
            let files: any[] = [];

            // 3. Manejo de Multipart/Form-Data (Archivos + Campos de texto)
            if (contentType.includes('multipart/form-data')) {
                const formData = await req.formData();

                // Extraer todos los campos que no sean archivos
                formData.forEach((value, key) => {
                    if (value instanceof File) {
                        files.push(value);
                    } else {
                        body[key] = value;
                    }
                });
            } else {
                // Manejo de JSON directo
                body = await req.json();
            }

            // 4. 🛡️ SOBRESCRITURA FORZOSA DE IDENTIDAD (Zero Trust en JSON y FormData)
            // Jamás se confía en el user_id recibido en el payload del navegador.
            body.user_id = authenticatedUserId;

            // 5. Delegar a la capa de servicio de asistentes
            const result = await assistantsService.executeAssistant(metaId, body, files as any);

            return NextResponse.json(result);

        } catch (error: any) {
            console.error(`[API Controller] ❌ Error in executeAssistant [${metaId}]:`, error);
            return NextResponse.json({
                status: 'error',
                message: error.message || 'Internal Server Error'
            }, { status: 500 });
        }
    }

    /**
     * Health Check
     */
    async healthCheck() {
        return NextResponse.json({
            status: 'ok',
            time: new Date().toISOString(),
            env: process.env.APP_ENV
        });
    }
}

export const assistantsController = new AssistantsController();
