import { NextRequest, NextResponse } from 'next/server';
import { webhookService } from '../services/webhook.service';

/**
 * WebhookController
 * 
 * Capa de Controlador (MVC) que maneja las solicitudes HTTP, 
 * extrae datos y archivos, y delega la ejecución a la capa de Servicio.
 */
export class WebhookController {
    
    /**
     * Procesa la petición de un Meta-Asistente especializado.
     */
    async handleSpecialistRequest(req: NextRequest, metaId: string) {
        try {
            console.log(`\n[Controller] 📦 Processing request for Meta Assistant [${metaId}]`);

            // Verificación de API Key (Podría moverse a un middleware centralizado)
            const apiKey = req.headers.get('x-api-key');
            if (apiKey !== process.env.WEBHOOK_API_KEY) {
                return NextResponse.json({ status: 'error', message: 'Forbidden: Invalid API Key' }, { status: 403 });
            }

            const contentType = req.headers.get('content-type') || '';
            let body: any = {};
            let files: any[] = [];

            // Manejo de Multipart/Form-Data (Archivos + Body)
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

            // Delegar a la capa de servicio
            const result = await webhookService.handleIncomingRequest(metaId, body, files as any);
            
            return NextResponse.json(result);

        } catch (error: any) {
            console.error(`[Controller] ❌ Error in handleSpecialistRequest [${metaId}]:`, error);
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

export const webhookController = new WebhookController();
