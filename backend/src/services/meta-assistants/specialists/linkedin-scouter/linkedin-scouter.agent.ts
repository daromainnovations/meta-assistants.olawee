import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { BaseMetaSpecialist } from '../../base-specialist';
import { MetaContext, MetaResult, MetaStreamEvent } from '../../meta.types';
import { searchLinkedInProfiles, SearchResult } from './search-service';

const SYSTEM_PROMPT = `👤 Eres OLAWEE LinkedIn-Scouter, experto en reclutamiento IT y headhunting.

## TU MISIÓN
Tu objetivo es analizar una oferta de trabajo (Job Description) y encontrar a los 10 perfiles de LinkedIn que mejor encajen con los requisitos técnicos.

## PROCESO
1. **ANÁLISIS DEL JD**: Extrae los "Must-have skills" y el nivel de seniority.
2. **BÚSQUEDA**: Utilizarás una herramienta interna para buscar en LinkedIn.
3. **RANKING**: Evaluarás los perfiles encontrados basándote en su título y resumen, dándoles una puntuación de 0 a 100 según el "match" con el JD.

## REGLAS DE ORO
- Si NO hay un JD (texto o archivo), solicítalo amablemente al usuario.
- Siempre proporciona los enlaces directos a los perfiles de LinkedIn.
- Usa un tono profesional y directo. No inventes experiencia que no esté en el fragmento del perfil encontrado.`;

export class LinkedInScouterAgent extends BaseMetaSpecialist {
    protected getName(): string { return 'LinkedInScouter'; }

    protected async *execute(context: MetaContext): AsyncGenerator<MetaStreamEvent, any, unknown> {
        const { userMessage, files, docContext, metaId, model: modelName } = context;

        const model = new ChatGoogleGenerativeAI({
            apiKey: process.env.GEMINI_API_KEY,
            model: modelName || 'gemini-2.0-flash',
            temperature: 0.2,
            maxOutputTokens: 8192
        });

        // 1. Verificar si tenemos un JD (mensaje o archivos)
        const safeUserMessage = userMessage || '';
        const hasJD = safeUserMessage.length > 5 || (docContext && docContext.length > 10);

        if (!hasJD) {
            return {
                status: 'success',
                ai_response: '👋 ¡Hola! Soy tu asistente de búsqueda en LinkedIn. Para empezar, por favor envíame la **descripción del puesto** (texto o PDF) que quieres cubrir.',
                specialist: metaId,
                timestamp: new Date().toISOString()
            };
        }

        try {
            // 2. Extraer keywords para la búsqueda
            // Combinamos mensaje y contexto documental
            const fullJD = `[MENSAJE USUARIO]: ${safeUserMessage}\n[CONTEXTO TRABAJO]: ${docContext || ''}`;

            console.log(`[LinkedInScouter] Analizando JD para extraer query...`);
            yield { type: 'status', message: 'Analizando la oferta de trabajo y generando estrategia de búsqueda...' };
            const extractionPrompt = `Analiza la siguiente oferta de trabajo y genera una ÚNICA cadena de búsqueda para Google que encuentre perfiles de LinkedIn relevantes.
            Usa el formato: "Role Name" "Skill 1" "Skill 2" "Location"
            Solo responde con la cadena de búsqueda, sin explicaciones.
            [JD]: ${fullJD}`;

            const queryRes = await model.invoke([new HumanMessage(extractionPrompt)]);
            const searchQuery = (queryRes.content as string).replace(/"/g, '').trim();

            console.log(`[LinkedInScouter] Query generada: ${searchQuery}`);

            // 3. Ejecutar búsqueda en Google (filtro site:linkedin.com/in ya está en el CSE o se añade aquí)
            // Nota: Si el CSE no tiene el filtro, lo añadimos manualmente
            yield { type: 'status', message: `Buscando perfiles en LinkedIn para: ${searchQuery}...` };
            const results: SearchResult[] = (await searchLinkedInProfiles(searchQuery)) || [];

            if (results.length === 0) {
                return {
                    status: 'success',
                    ai_response: `He intentado buscar candidatos para "${searchQuery}", pero no he obtenido resultados. ¿Podrías ser más específico con los requisitos o la ubicación?`,
                    specialist: metaId,
                    timestamp: new Date().toISOString()
                };
            }

            // 4. Ranking de perfiles con Gemini
            console.log(`[LinkedInScouter] Ranking de ${results.length} resultados...`);
            yield { type: 'status', message: `Se han encontrado ${results.length} candidatos potenciales. Evaluando perfiles e idoneidad...` };
            const rankingPrompt = `Dados los siguientes resultados brutos de búsqueda de LinkedIn, compáralos con la oferta original y selecciona a los candidatos más relevantes.
            
            [OFERTA]: ${fullJD}
            [RESULTADOS]: ${JSON.stringify(results)}
            
            INSTRUCCIONES DE DEPURACIÓN:
            1. Examina el JSON de RESULTADOS. Algunos pueden ser páginas de error de LinkedIn, empresas, o "basura" del buscador. Ignóralos por completo.
            2. Filtra estrictamente y quédate solo con personas (candidatos reales).
            3. Genera un informe detallado con una tabla Markdown de los candidatos válidos. Columnas: Nombre/Headline | Match % | Enlace.
            4. Añade un breve párrafo explicando por qué el Top 1 es el mejor candidato.
            
            NO inventes texto para rellenar, sé directo y objetivo.`;

            const finalResponse = await model.invoke([
                new SystemMessage(SYSTEM_PROMPT),
                new HumanMessage(rankingPrompt)
            ]);

            return {
                status: 'success',
                ai_response: finalResponse.content as string,
                specialist: metaId,
                timestamp: new Date().toISOString()
            };

        } catch (err: any) {
            console.error(`[LinkedInScouter] Error:`, err.message);
            return {
                status: 'success',
                ai_response: `⚠️ **Ha ocurrido un problema técnico:** ${err.message}. \n\nHe intentado buscar en Google y DuckDuckGo como respaldo, pero algo ha fallado. Revisa tu configuración o inténtalo de nuevo en unos minutos.`,
                specialist: metaId,
                timestamp: new Date().toISOString()
            };
        }
    }
}

export const linkedinScouterAgent = new LinkedInScouterAgent();
