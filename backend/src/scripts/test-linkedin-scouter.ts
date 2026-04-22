import * as dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { linkedinScouterAgent } from '../services/meta-assistants/specialists/linkedin-scouter/linkedin-scouter.agent';
import { MetaContext } from '../services/meta-assistants/meta.types';

async function runTest() {
    console.log('🚀 Iniciando prueba real de LinkedIn Scouter...');

    if (!process.env.TAVILY_API_KEY) {
        console.error('❌ Error: Falta la clave TAVILY_API_KEY en el .env');
        return;
    }

    const context: MetaContext = {
        sessionId: 'test-session-123',
        metaId: 'linkedin_scouter',
        userMessage: 'Necesito encontrar urgentemente varios perfiles de LinkedIn que sean "Technical Recruiter" o "IT Headhunter" con experiencia en el mercado de Londres (UK).',
        history: [],
        docContext: '',
        files: [],
        model: 'gemini-2.0-flash'
    };

    try {
        console.log('🔍 Llamando al agente (esto puede tardar unos segundos)...');
        const stream = await linkedinScouterAgent.run(context);
        let result: any = null;
        for await (const event of stream) {
            if (event.type === 'status') {
                console.log(`[STATUS] ${event.message}`);
            } else if (event.type === 'done') {
                result = event.result;
            }
        }

        console.log('\n--- 🤖 RESPUESTA DE LA IA ---');
        console.log(result?.ai_response);
        console.log('-----------------------------\n');

        if (result?.status === 'success') {
            console.log('✅ Prueba completada con éxito.');
        } else {
            console.log('⚠️ La prueba devolvió un estado de error.');
        }
    } catch (error: any) {
        console.error('❌ Error fatal durante la prueba:', error.message);
    }
}

runTest();
