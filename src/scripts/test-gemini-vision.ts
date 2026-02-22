
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';

// 1. Create a tiny 1x1 PNG image
const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';
const imageBuffer = Buffer.from(base64Image, 'base64');
const TEST_IMAGE_PATH = path.join(__dirname, 'test-image.png');

if (!fs.existsSync(TEST_IMAGE_PATH)) {
    fs.writeFileSync(TEST_IMAGE_PATH, imageBuffer);
    console.log(`Created test image at: ${TEST_IMAGE_PATH}`);
}

async function testGeminiVision() {
    console.log('🚀 Testing Gemini Vision Integration...\n');

    console.log(`\n🔵 Testing Module: [Gemini Chat (Image)]`);
    console.log('---------------------------------------------------');
    console.log('📥 INPUT (Image File): test-image.png');

    try {
        const form = new FormData();
        form.append('file', fs.createReadStream(TEST_IMAGE_PATH));
        // Also send a message to simulate context if needed by ChatHandler, though DocumentService processes file first.
        form.append('message', 'Describe this image');

        const result = await makeMultipartRequest('/gemini-chat', form);

        console.log('📤 OUTPUT (Response):');
        console.log(JSON.stringify(result, null, 2));
        console.log('---------------------------------------------------');

        if (result && result.status === 'success') {
            console.log(`✅ Gemini Vision Test: SUCCESS`);
            if (result.ai_response && result.ai_response.includes('contexto')) {
                console.log(`   (Confirmed document context was used)`);
            }
        } else {
            console.log(`❌ Gemini Vision Test: FAILED (Check logs)`);
        }

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log('📤 OUTPUT (Error):');
        console.error(errorMessage);
        console.log('---------------------------------------------------');
        console.error(`❌ Gemini Vision Test: ERROR`);
    }

    // Clean up
    if (fs.existsSync(TEST_IMAGE_PATH)) {
        fs.unlinkSync(TEST_IMAGE_PATH);
    }
}

function makeMultipartRequest(path: string, form: FormData): Promise<any> {
    return new Promise((resolve, reject) => {
        const headers = form.getHeaders();
        // Use the API key from .env if available, or the hardcoded one from previous files
        // In test-webhooks.ts it was 'sk_webhook_secret_12345'
        headers['x-api-key'] = 'sk_webhook_secret_12345';

        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'POST',
            headers: headers
        };

        const req = http.request(options, (res) => {
            let responseData = '';
            res.on('data', (chunk) => { responseData += chunk; });
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(responseData));
                    } catch (e) {
                        resolve(responseData);
                    }
                } else {
                    reject(new Error(`Status Code: ${res.statusCode} - ${responseData}`));
                }
            });
        });

        req.on('error', (error) => reject(error));
        form.pipe(req);
    });
}

testGeminiVision();
