import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { BaseMetaSpecialist } from '../../base-specialist';
import { MetaContext, MetaResult } from '../../meta.types';
import { metaMemoryService } from '../../meta-memory.service';
import { extractCVsFromFiles, CVProfile } from './cv_parser';
import { RankingGenerator, RankingResult } from './ranking_generator';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================
// 👤 SYSTEM PROMPT — EL HEADHUNTER PROACTIVO
// ============================================================
const SYSTEM_PROMPT = `👤 Eres OLAWEE CV-Screener, el headhunter digital experto en reclutamiento y selección de talento.

## TU MISIÓN
Tu objetivo es ayudar al usuario a encontrar al candidato ideal entre múltiples CVs. Debes ser proactivo, profesional y metódico.

## TUS FASES DE TRABAJO
1. **Definición**: Extrae los requisitos de la descripción del puesto (Job Description).
2. **Personalización**: Sugiere pesos de evaluación (% habilidades, % experiencia, etc.) y pregunta al usuario si quiere ajustarlos.
3. **Recepción**: Confirma cuántos CVs has recibido y avisa de cualquier error.
4. **Análisis**: Espera a que el usuario pida el ranking. Cuando lo haga, genera el informe.

## REGLAS CRÍTICAS
- **Proactividad**: Siempre sugiere el siguiente paso. "Ya tengo los requisitos, ¿deseas subir los CVs o ajustar los pesos?" o "He procesado 5 CVs, ¿quieres que analice los resultados ahora?".
- **Pesos predeterminados**: Si el usuario no dice nada, usa: Skills(40%), Experiencia(25%), Formación(15%), Idiomas(10%), Soft Skills(10%).
- **Mapeo inteligente**: Aunque el CV sea en inglés y la descripción en español, haz el match de todas formas.
- **Transparencia**: Si un CV es ilegible, infórmalo.

## INTERACCIÓN CON HERRAMIENTAS
Usa \`generar_ranking_cv\` solo cuando el usuario te lo pida explícitamente o confirme que está listo para el análisis final.`;

/**
 * 👤 AGENTE ESPECIALISTA: CV SCREENER (RRHH)
 */
export class CVScreenerAgent extends BaseMetaSpecialist {
  protected getName(): string { return 'CVScreener'; }

  protected async execute(context: MetaContext): Promise<MetaResult> {
    const { userMessage, files, sessionId, docContext, metaId, model: modelName } = context;
    
    console.log(`\n[CVScreener] ▶ Ejecución en curso. Session: ${sessionId} | Archivos: ${files?.length || 0}`);

    try {
      // ─────────────────────────────────────────
      // PASO 1: EXTRAER Y ACUMULAR PERFILES (OCR)
      // ─────────────────────────────────────────
      let extractedContext = '';
      const processedFilesCount = files?.length || 0;
      
      // En un entorno real, aquí llamaríamos a extractCVsFromFiles y guardaríamos en memoria de sesión.
      // Para este prototipo, vamos a usar el contexto del documento que nos llega o los archivos.
      if (files && files.length > 0) {
        console.log(`[CVScreener] 🔍 Procesando ${files.length} archivos para extracción de perfiles...`);
        // Nota: En la ejecución real del agente, la extracción OCR se hace aquí o se confía en el contexto.
        // Simulamos la extracción de perfiles para el contexto de la IA.
        extractedContext += `\n\n=== CANDIDATOS RECIBIDOS (${files.length}) ===\n`;
        files.forEach(f => {
          extractedContext += `📄 Candidato: ${f.originalname}\n`;
        });
      }

      // ─────────────────────────────────────────
      // PASO 2: CONFIGURAR MODELO Y HERRAMIENTAS
      // ─────────────────────────────────────────
      const apiKey = process.env.GEMINI_API_KEY;
      const model = new ChatGoogleGenerativeAI({
        apiKey,
        model: modelName || 'gemini-2.0-flash',
        temperature: 0
      });

      const modelWithTools = (model as any).bindTools([{
        function_declarations: [{
          name: 'generar_ranking_cv',
          description: 'Genera el ranking definitivo de candidatos contra el puesto y crea el informe descargable.',
          parameters: {
            type: 'object',
            properties: {
              puesto: { type: 'string', description: 'Descripción o título del puesto vacante' },
              pesos: {
                type: 'object',
                description: 'Pesos de evaluación (deben sumar 100%)',
                properties: {
                  skills: { type: 'number', description: 'Peso para habilidades técnicas %' },
                  experiencia: { type: 'number', description: 'Peso para años experiencia %' },
                  formacion: { type: 'number', description: 'Peso para formación académica %' },
                  idiomas: { type: 'number', description: 'Peso para idiomas %' },
                  softSkills: { type: 'number', description: 'Peso para habilidades blandas %' }
                }
              },
              analisis: {
                type: 'array',
                description: 'Lista de candidatos evaluados',
                items: {
                  type: 'object',
                  properties: {
                    nombre: { type: 'string' },
                    puntuacion: { type: 'number', description: 'Puntuación del 1 al 100' },
                    resumen: { type: 'string', description: 'Breve resumen de por qué esta puntuación' },
                    highlight: { type: 'string', description: 'Punto más fuerte del candidato' }
                  }
                }
              }
            },
            required: ['puesto', 'analisis']
          }
        }]
      }]);

      // Construir el mensaje del sistema enriquecido con el estado de la sesión
      const effectiveContext = extractedContext || docContext || 'Aún no se han proporcionado puestos ni CVs.';
      
      const messages = [
        new SystemMessage(SYSTEM_PROMPT),
        ...context.history.filter(m => m.content && m.content.toString().trim() !== ''),
        new HumanMessage(`${userMessage}\n\n[CONTEXTO ACTUAL DE SESIÓN]\n${effectiveContext}`)
      ];

      const response = await modelWithTools.invoke(messages);

      // ─────────────────────────────────────────
      // PASO 3: GESTIÓN DE TOOL CALLS (Generar Ranking)
      // ─────────────────────────────────────────
      let toolCall: { name: string; args: any } | null = null;
      if (response.additional_kwargs?.tool_calls?.length > 0) {
        const tc = response.additional_kwargs.tool_calls[0];
        toolCall = { name: tc.function.name, args: JSON.parse(tc.function.arguments) };
      }

      if (toolCall?.name === 'generar_ranking_cv') {
        const args = toolCall.args;
        console.log(`[CVScreener] 🛠️ Generando ranking con ${args.analisis.length} candidatos...`);

        const rankingResult: RankingResult = {
          puesto: args.puesto,
          pesos: args.pesos || { skills: 40, experiencia: 25, formacion: 15, idiomas: 10, softSkills: 10 },
          candidatos: args.analisis
        };

        return {
          status: 'success',
          ai_response: `He completado el análisis de los **${args.analisis.length} candidatos**.

Aquí tienes el resumen del podio:
1. 🥇 **${args.analisis[0].nombre}** (${args.analisis[0].puntuacion}/100) - ${args.analisis[0].highlight}
${args.analisis[1] ? `2. 🥈 **${args.analisis[1].nombre}** (${args.analisis[1].puntuacion}/100)\n` : ''}${args.analisis[2] ? `3. 🥉 **${args.analisis[2].nombre}** (${args.analisis[2].puntuacion}/100)\n` : ''}

¿Te gustaría descargar el informe completo? ¿Lo prefieres en **Excel** o en **PDF**?`,
          specialist: metaId,
          timestamp: new Date().toISOString()
        };
      }

      // ─────────────────────────────────────────
      // PASO 4: GENERACIÓN DE ARCHIVOS (POST-RANKING)
      // ─────────────────────────────────────────
      const lowerMsg = userMessage.toLowerCase();
      if (lowerMsg.includes('excel') || lowerMsg.includes('pdf')) {
        if (toolCall?.args?.analisis || userMessage.includes('enviar')) {
           const isPdf = lowerMsg.includes('pdf');
           const ext = isPdf ? 'pdf' : 'xlsx';
           
           if (toolCall?.args) {
             const buffer = isPdf 
                ? await RankingGenerator.generatePDF(toolCall.args)
                : await RankingGenerator.generateExcel(toolCall.args);

             return {
               status: 'success',
               ai_response: `Aquí tienes el informe de cribado en formato **${ext.toUpperCase()}**. ¡Espero que te ayude a tomar la mejor decisión!`,
               specialist: metaId,
               generated_files: [{
                 filename: `Informe_Cribado_${Date.now()}.${ext}`,
                 buffer: buffer,
                 mimetype: isPdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
               }],
               timestamp: new Date().toISOString()
             };
           }
        }
      }

      // Respuesta normal
      const aiText = typeof response.content === 'string' 
        ? response.content 
        : Array.isArray(response.content) 
          ? response.content.map((p: any) => p.text || '').join('')
          : JSON.stringify(response.content);

      return {
        status: 'success',
        ai_response: aiText,
        specialist: metaId,
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      console.error(`[CVScreener] ❌ Error: ${error.message}`);
      throw error;
    }
  }
}

export const cvScreenerAgent = new CVScreenerAgent();
