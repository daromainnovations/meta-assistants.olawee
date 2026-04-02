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
     * Asegura que el bucket existe, si no lo crea.
     */
    private async ensureBucket(bucketName: string): Promise<void> {
        const { data: buckets, error: listError } = await this.supabase.storage.listBuckets();
        
        if (listError) {
            console.error('[SupabaseStorage] Error listando buckets:', listError.message);
            return;
        }

        const exists = buckets.some(b => b.name === bucketName);
        if (!exists) {
            console.log(`[SupabaseStorage] 📦 Creando nuevo bucket público: '${bucketName}'`);
            const { error: createError } = await this.supabase.storage.createBucket(bucketName, {
                public: true,
                fileSizeLimit: 10 * 1024 * 1024 // 10MB
            });

            if (createError) {
                console.error(`[SupabaseStorage] Error creando bucket '${bucketName}':`, createError.message);
            }
        }
    }

    /**
     * Helper para limpiar nombres de archivo.
     */
    private sanitizeFilename(fileName: string): string {
        return fileName
            .normalize('NFD') // Descomponer acentos
            .replace(/[\u0300-\u036f]/g, '') // Quitar los acentos
            .replace(/[^a-zA-Z0-9.\-_]/g, '_') // Cambiar todo lo demás por _
            .replace(/_{2,}/g, '_'); // Evitar múltiples guiones bajos seguidos
    }

    /**
     * Sube un Buffer (archivo generado en memoria) a Supabase Storage y devuelve su URL.
     */
    async uploadBuffer(buffer: Buffer, fileName: string, contentType: string, bucketOverride?: string): Promise<string> {
        const targetBucket = bucketOverride || this.bucketName;
        
        // Asegurar que el bucket existe antes de subir
        await this.ensureBucket(targetBucket);

        // Asegurar que el nombre del archivo no pise otros, añadiendo timestamp
        const cleanName = this.sanitizeFilename(fileName);
        const uniqueFileName = `${Date.now()}_${cleanName}`;

        console.log(`[SupabaseStorage] Subiendo buffer al bucket '${targetBucket}': ${uniqueFileName}`);

        const { data, error } = await this.supabase.storage
            .from(targetBucket)
            .upload(uniqueFileName, buffer, {
                contentType,
                upsert: true
            });

        if (error) {
            console.error('[SupabaseStorage] Error subiendo archivo a Supabase:', error);
            throw new Error(`Error en Storage: ${error.message}`);
        }

        // Obtener URL pública (asumimos bucket público)
        const { data: publicData } = this.supabase.storage
            .from(targetBucket)
            .getPublicUrl(uniqueFileName);

        console.log(`[SupabaseStorage] Subida exitosa. URL: ${publicData.publicUrl}`);

        return publicData.publicUrl;
    }
}

export const supabaseStorageService = new SupabaseStorageService();
