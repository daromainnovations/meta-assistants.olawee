import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { BaseMetaSpecialist } from '../../base-specialist';
import { MetaContext, MetaResult, MetaStreamEvent } from '../../meta.types';
import { metaMemoryService } from '../../meta-memory.service';
import { extractCVsFromFiles } from './cv_parser';
import { RankingGenerator, RankingResult } from './ranking_generator';

const SYSTEM_PROMPT = `👤 Eres OLAWEE CV-Screener, el headhunter digital experto.

## TU MISIÓN
Tu objetivo es guiar al usuario en el cribado de candidatos siguiendo un proceso profesional de RRHH en 3 etapas:

### ETAPA 1: RECEPCIÓN Y BIENVENIDA
- Si es el inicio de la charla y NO hay CVs en el contexto, saluda y solicita los archivos.
- **CRÍTICO**: Si el contexto de candidatos está VACÍO, di claramente que no has recibido archivos todavía. **PROHIBIDO INVENTAR nombres o perfiles**.
- Si has recibido CVs, confirma el número exacto y resume brevemente quiénes son (nombres reales del contexto).
- SI NO hay una descripción del puesto (Job Description), pídela amablemente.

### ETAPA 2: CONFIGURACIÓN DE CRITERIOS (SOLO SI HAY CVs)
- Una vez tengas el puesto y los CVs reales, **SUGIERE pesos de evaluación**.
- **PROHIBIDO CALCULAR PUNTUACIONES** hasta que el usuario confirme los pesos. Tus respuestas iniciales deben ser solo comparaciones cualitativas basadas en los datos reales suministrados.

## REGLAS DE ORO
- NUNCA inventes información que no esté en el [CONTEXTO].
- Si el contexto está vacío, tu única misión es pedir los archivos y el puesto.
- Mantén tus respuestas en el chat limpias y profesionales.`;

export class CVScreenerAgent extends BaseMetaSpecialist {
  protected getName(): string { return 'CVScreener'; }

  protected async *execute(context: MetaContext): AsyncGenerator<MetaStreamEvent, any, unknown> {
    const { userMessage, files, sessionId, docContext, metaId, model: modelName } = context;
    const model = new ChatOpenAI({ apiKey: process.env.OPENAI_API_KEY, model: 'gpt-4o-mini', temperature: 0 });

    try {
      // 1. Extracción de perfiles (Asegurar que siempre procesamos los archivos de la sesión)
      let extractedContext = '';
      const allFiles = files || [];

      if (allFiles.length > 0) {
        // En un entorno real, podríamos cachear esto para no llamar a Gemini cada vez,
        // pero para asegurar persistencia turno-a-turno, los extraemos del context.files
        yield { type: 'status', message: 'Leyendo información de los currículums...' };
        const extractedData = await extractCVsFromFiles(allFiles);
        extractedData.forEach(fd => fd.profiles.forEach(p => {
          extractedContext += `\n📄 CV: ${p.nombre}\n- Skills: ${p.habilidadesTecnicas?.join(', ')}\n- Exp: ${p.experienciaTotalAnos}y\n- Resumen: ${p.resumenPerfil}\n`;
        }));
      }

      console.log(`[CVScreener] Debug Context: 
        - Files in session: ${allFiles.length}
        - New Extracted: ${extractedContext.length > 0 ? 'YES' : 'NO'}
        - Previous DocContext: ${docContext?.length || 0} chars`);

      const lower = userMessage.toLowerCase();

      // Disparador de Ranking:
      const isRankingRequest = (lower.includes('excel') || lower.includes('pdf') || lower.includes('genera el ranking') || lower.includes('haz el ranking')) ||
        ((lower.includes('adelante') || lower.includes('perfecto') || lower.includes('ok') || lower.includes('está bien')) && (docContext?.includes('pesos') || extractedContext.includes('CV:')));

      const hasCvs = (docContext && docContext.length > 20) || (extractedContext && extractedContext.length > 20);

      // 2. Lógica Determinista de Ranking
      if (isRankingRequest) {
        if (!hasCvs) {
          return {
            status: 'success',
            ai_response: "Aún no he procesado ningún currículum. Por favor, sube los archivos (PDF, Excel, TXT) para poder realizar el ranking.",
            specialist: metaId,
            timestamp: new Date().toISOString()
          };
        }

        console.log(`[CVScreener] 📊 Generando ranking solicitado.`);
        yield { type: 'status', message: 'Generando ranking de candidatos por competencias...' };
        const analysisPrompt = `Genera un ranking de los candidatos para el puesto. 
          [CANDIDATOS]: ${docContext || ''} ${extractedContext}
          [JD/MENSAJE]: ${userMessage}
          Respuesta en JSON: { "puesto": "...", "candidatos": [ { "nombre": "...", "puntuacion": 0-100, "resumen": "...", "highlight": "..." } ] }`;

        const res = await model.invoke([new SystemMessage("Eres un analista de RRHH que responde en JSON."), new HumanMessage(analysisPrompt)]);
        const content = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
        const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
        const rankingData = JSON.parse(jsonStr);

        const rankingResult: RankingResult = {
          puesto: rankingData.puesto,
          pesos: { skills: 40, experiencia: 25, formacion: 15, idiomas: 10, softSkills: 10 },
          candidatos: rankingData.candidatos
        };
        metaMemoryService.saveSessionMetadata(sessionId, metaId, 'last_ranking', rankingResult);

        let tableMd = `\n\n### 📊 Ranking Final\n| # | Candidato | Puntos | Punto Fuerte |\n|---|-----------|--------|--------------|\n`;
        rankingData.candidatos.forEach((c: any, i: number) => {
          tableMd += `| ${i + 1} | **${c.nombre}** | ${c.puntuacion}/100 | ${c.highlight} |\n`;
        });

        let generatedFiles = [];
        if (lower.includes('excel') || lower.includes('pdf')) {
          const isPdf = lower.includes('pdf');
          yield { type: 'status', message: `Exportando resultados del ranking a formato ${isPdf ? 'PDF' : 'Excel'}...` };
          const buffer = isPdf ? await RankingGenerator.generatePDF(rankingResult) : await RankingGenerator.generateExcel(rankingResult);
          generatedFiles.push({
            filename: `Ranking_${isPdf ? 'PDF' : 'Excel'}_${Date.now()}.${isPdf ? 'pdf' : 'xlsx'}`,
            buffer,
            mimetype: isPdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          });
        }

        return {
          status: 'success',
          ai_response: `Análisis completado conforme a tus criterios.\n${tableMd}\n\n${generatedFiles.length > 0 ? 'He generado el archivo descargable.' : '¿Te gustaría que exporte este resultado a **Excel** o **PDF**?'}`,
          specialist: metaId,
          generated_files: generatedFiles.length > 0 ? generatedFiles : undefined,
          timestamp: new Date().toISOString()
        };
      }

      // 3. Respuesta Conversacional Guíada (Solo si hay CVs)
      if (!hasCvs) {
        return {
          status: 'success',
          ai_response: `¡Hola! Soy OLAWEE CV-Screener, tu headhunter digital experto. 👋

Todavía no he recibido ningún currículum para analizar. Por favor, sube los archivos y facilítame la descripción del puesto deseado para empezar.`,
          specialist: metaId,
          timestamp: new Date().toISOString()
        };
      }

      yield { type: 'status', message: 'Analizando perfiles...' };
      const response = await model.invoke([
        new SystemMessage(SYSTEM_PROMPT),
        new HumanMessage(`[CONTEXTO RECIENTE]\n${docContext || ''}\n[NUEVOS DATOS]\n${extractedContext}\n\n[USER]: ${userMessage}`)
      ]);

      return {
        status: 'success',
        ai_response: typeof response.content === 'string' ? response.content : "No he podido procesar la respuesta.",
        specialist: metaId,
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      console.error(`[CVScreener] Error: ${error.message}`);
      return { status: 'error', ai_response: `Error: ${error.message}`, specialist: metaId, timestamp: new Date().toISOString() };
    }
  }
}

export const cvScreenerAgent = new CVScreenerAgent();
