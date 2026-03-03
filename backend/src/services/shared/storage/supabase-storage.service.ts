import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

export class SupabaseStorageService {
    private supabase: SupabaseClient;
    // Bucket name to store assistant-generated files
    private bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'olawee-files';

    constructor() {
        const supabaseUrl = process.env.SUPABASE_URL || '';
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

        if (!supabaseUrl || !supabaseKey) {
            console.warn('[SupabaseStorage] SUPABASE_URL o SUPABASE_KEY faltante en .env. La carga de archivos fallará.');
        }

        // Initialize Supabase Client
        this.supabase = createClient(supabaseUrl || 'https://fake.supabase.co', supabaseKey || 'fake-key');
    }

    /**
     * Sube un Buffer (archivo generado en memoria) a Supabase Storage y devuelve su URL.
     */
    async uploadBuffer(buffer: Buffer, fileName: string, contentType: string): Promise<string> {
        // Asegurar que el nombre del archivo no pise otros, añadiendo timestamp
        const uniqueFileName = `${Date.now()}_${fileName.replace(/\s+/g, '_')}`;

        console.log(`[SupabaseStorage] Subiendo buffer al bucket '${this.bucketName}': ${uniqueFileName}`);

        const { data, error } = await this.supabase.storage
            .from(this.bucketName)
            .upload(uniqueFileName, buffer, {
                contentType,
                upsert: true
            });

        if (error) {
            console.error('[SupabaseStorage] Error subiendo archivo a Supabase:', error);
            throw new Error(`Error en Storage: ${error.message}`);
        }

        // Obtener URL pública (asumimos bucket público, o al menos requerimos la URL para el chat)
        const { data: publicData } = this.supabase.storage
            .from(this.bucketName)
            .getPublicUrl(uniqueFileName);

        console.log(`[SupabaseStorage] Subida exitosa. URL: ${publicData.publicUrl}`);

        return publicData.publicUrl;
    }
}

export const supabaseStorageService = new SupabaseStorageService();
