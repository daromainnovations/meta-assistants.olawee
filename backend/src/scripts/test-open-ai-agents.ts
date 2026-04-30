import { templateFillerAgent } from '../services/meta-assistants/specialists/template-filler/template-filler.agent.js';
import { invoiceCheckerAgent } from '../services/meta-assistants/specialists/invoice-checker/invoice-checker.agent.js';
import { linkedinScouterAgent } from '../services/meta-assistants/specialists/linkedin-scouter/linkedin-scouter.agent.js';
import { grantJustificationAgent } from '../services/meta-assistants/specialists/grant-justification/grant_justification.agent.js';
import { docComparatorAgent } from '../services/meta-assistants/specialists/doc-comparator/doc-comparator.agent.js';
import { cvScreenerAgent } from '../services/meta-assistants/specialists/cv-screener/cv_screener.agent.js';
import { MetaContext } from '../services/meta-assistants/meta.types.js';

async function runTests() {
    console.log('--- TEST DE META ASISTENTES (OPENAI) ---');
    if (!process.env.OPENAI_API_KEY) {
        console.error('❌ ERROR: Falta OPENAI_API_KEY en el archivo .env');
        process.exit(1);
    }

    const agents = [
        { name: 'TemplateFiller', instance: templateFillerAgent },
        { name: 'InvoiceChecker', instance: invoiceCheckerAgent },
        { name: 'LinkedInScouter', instance: linkedinScouterAgent },
        { name: 'GrantJustification', instance: grantJustificationAgent },
        { name: 'DocComparator', instance: docComparatorAgent },
        { name: 'CVScreener', instance: cvScreenerAgent },
    ];

    for (const { name, instance } of agents) {
        console.log(`\n========================================`);
        console.log(`Probando: ${name}...`);
        
        const context: MetaContext = {
            sessionId: 'test-session',
            metaId: name,
            userMessage: 'Hola, di "Test completado" y nada más.',
            files: [],
            docContext: '',
            history: [],
            model: 'gpt-4o-mini' // Por defecto
        };

        try {
            const stream = instance.run(context);
            for await (const event of stream) {
                if (event.type === 'status') {
                    console.log(`[STATUS] ${event.message}`);
                } else if (event.type === 'done') {
                    console.log(`[DONE] ${event.result.status.toUpperCase()}`);
                    console.log(`[RESPONSE] ${event.result.ai_response}`);
                }
            }
        } catch (error: any) {
            console.error(`❌ Fallo en ${name}: ${error.message}`);
        }
    }
    
    console.log(`\n✅ TEST COMPLETADO`);
}

runTests().catch(console.error);
