import { supabaseStorageService } from '../services/shared/storage/supabase-storage.service';

/**
 * 🛠️ SCRIPT DE ADMINISTRACIÓN: CREAR BUCKET RRHH
 * Ejecutar con: npx ts-node src/scripts/create_cv_bucket.ts
 */
async function main() {
    const bucketName = 'cv-screening-files';
    console.log(`[Admin] Intentando crear bucket: ${bucketName}...`);
    
    try {
        // En nuestro servicio, uploadBuffer ya llama a ensureBucket (privado).
        // Forzamos un test de subida vacío o simplemente usamos reflect para llamar a createBucket si fuera público.
        // Como ensureBucket es privado, vamos a usar un truco: subir un archivo readme vacío.
        
        const buffer = Buffer.from('Bucket iniciado para OLAWEE CV screening.');
        const url = await supabaseStorageService.uploadBuffer(
            buffer, 
            'readme.txt', 
            'text/plain', 
            bucketName
        );
        
        console.log(`✅ EXITO: Bucket '${bucketName}' creado y verificado.`);
        console.log(`🔗 URL de prueba: ${url}`);
        process.exit(0);
    } catch (error: any) {
        console.error(`❌ ERROR CREANDO BUCKET:`, error.message);
        process.exit(1);
    }
}

main();
