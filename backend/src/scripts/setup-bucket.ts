import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
    const supabaseUrl = process.env.SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

    const supabase = createClient(supabaseUrl, supabaseKey);
    const bucketName = 'prd-documents';

    console.log(`[Setup] Intentando crear el bucket '${bucketName}'...`);
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
        console.error('Error al listar buckets:', listError.message);
        return;
    }

    const exists = buckets.some(b => b.name === bucketName);
    if (!exists) {
        const { data, error } = await supabase.storage.createBucket(bucketName, {
            public: true,
            fileSizeLimit: 10 * 1024 * 1024 // 10MB
        });
        if (error) {
            console.error('Error al crear bucket:', error.message);
        } else {
            console.log(`✅ Bucket '${bucketName}' creado con éxito.`);
        }
    } else {
        console.log(`⚠️ El bucket '${bucketName}' ya existía.`);
    }
}

run();
