
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'olawee-files';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log('Checking bucket:', bucketName);
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    if (bucketError) {
        console.error('Error listing buckets:', bucketError);
        return;
    }
    
    const exists = buckets.some(b => b.name === bucketName);
    console.log('Buckets found:', buckets.map(b => b.name));
    
    if (!exists) {
        console.log('Bucket does not exist. Creating it...');
        const { data, error } = await supabase.storage.createBucket(bucketName, {
            public: true
        });
        if (error) {
            console.error('Error creating bucket:', error);
        } else {
            console.log('Bucket created successfully.');
        }
    } else {
        console.log('Bucket exists.');
    }
}

check();
