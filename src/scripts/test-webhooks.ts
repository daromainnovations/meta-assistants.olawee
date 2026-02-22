import * as http from 'http';
import FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';

// Generate a dummy file for testing if it doesn't exist
const TEST_FILE_PATH = path.join(__dirname, 'test-document.txt');
if (!fs.existsSync(TEST_FILE_PATH)) {
    fs.writeFileSync(TEST_FILE_PATH, 'This is a test document content for webhook analysis.');
}

const WEBHOOKS = [
    { name: 'OpenAI Chat (Text)', path: '/openai-chat', body: { message: 'Test OpenAI', mode: 'chat' } },
    { name: 'Gemini Chat (Text)', path: '/gemini-chat', body: { message: 'Test Gemini', mode: 'chat' } },
    { name: 'Assistant Chat (Text)', path: '/assistant-chat', body: { query: 'Help me', mode: 'assistant' } },
];

async function testWebhooks() {
    console.log('🚀 Iniciando pruebas de Webhooks...\n');

    // 1. Test Text Webhooks (JSON)
    for (const webhook of WEBHOOKS) {
        console.log(`\n🔵 Testing Module: [${webhook.name}]`);
        console.log('---------------------------------------------------');
        console.log('📥 INPUT (Variables de Entrada):');
        console.log(JSON.stringify(webhook.body, null, 2));
        console.log('---------------------------------------------------');

        try {
            const result = await makeRequest(webhook.path, webhook.body);
            console.log('📤 OUTPUT (Variables de Salida):');
            console.log(JSON.stringify(result, null, 2));
            console.log('---------------------------------------------------');
            console.log(`✅ Resultado: SUCCESS`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.log('📤 OUTPUT (Error):');
            console.error(errorMessage);
            console.log('---------------------------------------------------');
            console.error(`❌ Resultado: ERROR`);
        }
    }

    // 2. Test File Upload Webhook (Multipart)
    console.log(`\n🔵 Testing Module: [OpenAI Chat (File)]`);
    console.log('---------------------------------------------------');
    console.log('📥 INPUT (Variables de Entrada):');
    const inputPreview = {
        file: {
            name: 'test-document.txt',
            content: '(Binary Content)',
            source: TEST_FILE_PATH
        },
        message: 'Analyze this document'
    };
    console.log(JSON.stringify(inputPreview, null, 2));
    console.log('---------------------------------------------------');

    try {
        const form = new FormData();
        form.append('file', fs.createReadStream(TEST_FILE_PATH));
        form.append('message', 'Analyze this document');

        const result = await makeMultipartRequest('/openai-chat', form);
        console.log('📤 OUTPUT (Variables de Salida):');
        console.log(JSON.stringify(result, null, 2));
        console.log('---------------------------------------------------');
        console.log(`✅ Resultado: SUCCESS`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log('📤 OUTPUT (Error):');
        console.error(errorMessage);
        console.log('---------------------------------------------------');
        console.error(`❌ Resultado: ERROR`);
    }

    // Clean up
    if (fs.existsSync(TEST_FILE_PATH)) {
        fs.unlinkSync(TEST_FILE_PATH);
    }

    console.log('\n✨ Pruebas completadas.');
}


function makeRequest(path: string, body: any): Promise<any> {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length,
                'x-api-key': 'sk_webhook_secret_12345' // 🔑 API Key para pruebas
            }
        };

        const req = http.request(options, (res) => handleResponse(res, resolve, reject));
        req.on('error', (error) => reject(error));
        req.write(data);
        req.end();
    });
}

function makeMultipartRequest(path: string, form: FormData): Promise<any> {
    return new Promise((resolve, reject) => {
        const headers = form.getHeaders();
        headers['x-api-key'] = 'sk_webhook_secret_12345'; // 🔑 API Key para pruebas multipart

        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'POST',
            headers: headers
        };

        const req = http.request(options, (res) => handleResponse(res, resolve, reject));
        req.on('error', (error) => reject(error));
        form.pipe(req);
    });
}

function handleResponse(res: http.IncomingMessage, resolve: (val: any) => void, reject: (err: any) => void) {
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
}

testWebhooks();
