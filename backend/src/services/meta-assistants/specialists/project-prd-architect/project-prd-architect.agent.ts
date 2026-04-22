import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { BaseMetaSpecialist } from '../../base-specialist';
import { MetaContext, MetaResult, MetaStreamEvent } from '../../meta.types';
import { prdPdfGenerator, PrdData } from './pdf-prd.generator';
import { supabaseStorageService } from '../../../shared/storage/supabase-storage.service';

export class ProjectPrdArchitectAgent extends BaseMetaSpecialist {
    protected getName(): string { return 'Project-PRD-Architect'; }

    protected async *execute(context: MetaContext): AsyncGenerator<MetaStreamEvent, any, unknown> {
        const { userMessage, files, docContext, metaId, model: modelName } = context;

        const model = new ChatOpenAI({
            openAIApiKey: process.env.OPENAI_API_KEY,
            modelName: 'gpt-4o',
            temperature: 0.4
        });

        const fullBrief = `[MENSAJE USUARIO]: ${userMessage}\n[CONTEXTO DOCUMENTOS]: ${docContext || ''}`;
        if (fullBrief.length < 50) {
            return {
                status: 'success',
                ai_response: '👋 ¡Hola! Soy tu Project-PRD-Architect. La idea parece muy corta. Para generar un Product Requirement Document (PRD) verdaderamente profesional y detallado, por favor descríbeme un poco más la lógica del negocio o sube un documento con tu idea.',
                specialist: metaId,
                timestamp: new Date().toISOString()
            };
        }

        try {
            console.log(`[ProjectPrdArchitect] Iniciando cadena profunda de 3 agentes...`);

            // ----------------------------------------------------
            // AGENTE 1: Executive CPO (Director de Producto)
            // ----------------------------------------------------
            console.log(`[ProjectPrdArchitect] -> Agente 1 (Product Officer) pensando...`);
            yield { type: 'status', message: '🤖 CPO Virtual analizando el modelo de negocio y visión...' };
            const agent1Prompt = `Eres el Chief Product Officer (CPO) de una top startup tecnológica.
            Tu misión es leer este pequeño briefing y visualizar un Sistema Masivo y Robusto.
            Extrae de forma EXHAUSTIVA y EXTENSA:
            1. Un "Resumen Ejecutivo de Alto Nivel".
            2. La "Visión del Producto" a medio y largo plazo.
            3. Lista súper detallada de funcionalidades Core separadas por Módulos y Prioridades.
            4. Objetivos del negocio reales y agresivos (crecimiento, adopción, etc.).

            PIENSA EN GRANDE. Elabora los módulos como si fueras a levantar una ronda de inversión. Describe CADA funcionalidad.

            [BRIEF DEL USUARIO]:
            ${fullBrief}`;
            const res1 = await model.invoke([new HumanMessage(agent1Prompt)]);
            const briefAnalysis = res1.content as string;

            // ----------------------------------------------------
            // AGENTE 2: CTO / Arquitecto de Software
            // ----------------------------------------------------
            console.log(`[ProjectPrdArchitect] -> Agente 2 (Arquitecto CTO) pensando...`);
            yield { type: 'status', message: '🤖 CTO Virtual diseñando sistema y matriz de riesgos...' };
            const agent2Prompt = `Eres un Chief Technology Officer (CTO) súper experimentado y meticuloso.
            A partir del Brief y la visión del CPO, tu trabajo es diseñar el apartado técnico y ver los posibles DESASTRES.
            Redacta de forma PROFUNDA:
            1. Propuesta de Arquitectura y Stack Tecnológico (Microservicios, APIs, BD Relacional vs NoSQL, Cloud AWS/GCP, lenguajes).
            2. Una Matriz de Riesgos y Dependencias exhaustiva. Para cada riesgo, indica su "Impacto crítico" y la "Mitigación paso a paso". Analiza a fondo el modelo de negocio expuesto. NO des respuestas obvias o vagas. Revisa la ciberseguridad, regulaciones y escalabilidad en relación estricta con la idea enviada.
            
            NO seas breve. Profundiza en por qué eliges ciertas tecnologías y cómo protegerás el sistema.
            
            [BRIEF USUARIO]: \n${fullBrief}
            
            [VISIÓN DEL CPO]: \n${briefAnalysis}`;
            const res2 = await model.invoke([new HumanMessage(agent2Prompt)]);
            const riskAnalysis = res2.content as string;

            // ----------------------------------------------------
            // AGENTE 3: Ingeniero de Documentación (Genera el JSON final)
            // ----------------------------------------------------
            console.log(`[ProjectPrdArchitect] -> Agente 3 (Ingeniero de Documentación) armando PRD JSON...`);
            yield { type: 'status', message: '🤖 Arquitecto AI transformando el análisis profundo en un documento PRD JSON...' };
            const agent3Prompt = `Eres un Documentador Técnico Experto. Tu trabajo es ensamblar toda la inteligencia aportada por el CPO y el CTO en un gran documento PRD JSON.
            
            IMPORTANTE: TU RESPUESTA DEBE SER ESTRICTAMENTE UN JSON VÁLIDO. ABSOLUTAMENTE NINGÚN CARÁCTER ADICIONAL NI MARKDOWN.
            Sé EXTREMADAMENTE VERBOSO y DESCRIPTIVO en los textos de los arrays.
            ADVERTENCIA CRÍTICA: La estructura de abajo contiene datos de EJEMPLO. ¡¡NO COPIES MIS EJEMPLOS!! Debes CREAR RIESGOS NUEVOS Y KPIs NUEVOS, súper específicos al negocio y tecnología del cliente.
            
            ESTRUCTURA EXACTA REQUERIDA (Genera al menos 5 riesgos y 5 KPIs):
            {
                "title": "Nombre Oficial del Proyecto",
                "summary": "Resumen ejecutivo muy detallado de la aplicación.",
                "vision": "La visión a largo plazo del CPO.",
                "features": [
                    { "module": "Nombre del Módulo o Épica real", "description": "Descripción muy larga y funcional...", "priority": "Alta" }
                ],
                "objectives": ["Objetivo súper descriptivo 1", "Objetivo súper descriptivo 2"],
                "architecture": "Tres o cuatro párrafos súper técnicos explicando el Stack Cloud y Backend.",
                "risks": [
                    { "risk": "Nombre de un Riesgo Real y Específico", "impact": "Detalle del impacto destructivo en este proyecto", "mitigation": "Arquitectura y solución específica recomendada" }
                ],
                "timeline": [
                    { "phase": "Nombre de Fase Técnica", "duration": "Ej: 3 Sems", "description": "Detalle riguroso técnico de esta fase" }
                ],
                "resources": [
                    { "role": "Perfil Experto", "count": "1x", "notes": "Por qué es necesario y sus responsabilidades." }
                ],
                "kpis": ["KPI técnico u operativo real 1 con detalle de cómo medirlo", "KPI de producto o negocio 2 con métrica y contexto", "Métrica de Adopción específica", "KPI de Rendimiento técnico"]
            }
            
            [VISIÓN CPO]: \n${briefAnalysis}
            
            [DISEÑO TÉCNICO Y RIESGOS CTO]: \n${riskAnalysis}`;

            const modelJson = new ChatOpenAI({
                openAIApiKey: process.env.OPENAI_API_KEY,
                modelName: 'gpt-4o',
                temperature: 0.3,
            });
            const res3 = await modelJson.invoke([new HumanMessage(agent3Prompt)], {
                // If model has response_mime_type, we can set it for safety, but typically cleaning the string is enough
            });

            // Extracción robusta del JSON
            let jsonString = (res3.content as string).trim();
            const jsonStartIdx = jsonString.indexOf('{');
            const jsonEndIdx = jsonString.lastIndexOf('}');
            if (jsonStartIdx !== -1 && jsonEndIdx !== -1) {
                jsonString = jsonString.substring(jsonStartIdx, jsonEndIdx + 1);
            }

            const prdData: PrdData = JSON.parse(jsonString);

            // ----------------------------------------------------
            // FINAL: Generación del PDF Extenso
            // ----------------------------------------------------
            console.log(`[ProjectPrdArchitect] Generando PDF Extenso para: ${prdData.title}...`);
            yield { type: 'status', message: `Generando PDF Final: ${prdData.title}...` };
            const pdfBuffer = await prdPdfGenerator.generate(prdData);

            const bucketName = 'prd-documents';
            const fileName = `PRD_Ultra_${prdData.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${Date.now()}.pdf`;

            const fileUrl = await supabaseStorageService.uploadBuffer(
                pdfBuffer,
                fileName,
                'application/pdf',
                bucketName
            );

            const finalAiMessage = `¡Tu **Product Requirement Document (PRD) Nivel Enterprise** está listo! 🚀🚀\n\nNuestros especialistas de IA (CPO de Negocio y CTO Técnico) han analizado en **profundidad máxima** tu solicitud. Hemos estructurado una propuesta arquitectónica seria, desglosado funcionales críticos, y evaluado impactos de seguridad reales.\n\n📥 **[Descargar Documento PRD Completo (PDF)](${fileUrl})**\n\n**Lo que encontrarás dentro:**\n- 🏗️ Una Arquitectura Técnica completa y Stack Propuesto.\n- 🛡️ Matriz de Mitigación de Riesgos (Niveles de impacto).\n- 🚀 Los Módulos funcionales detallados.\n- 📈 Fases del Timeline con descripciones extensas.\n\nÉchale un ojo, ahora sí que tienes un documento profundo preparado para inversores o un equipo técnico senior. 💪`;

            return {
                status: 'success',
                ai_response: finalAiMessage,
                specialist: metaId,
                timestamp: new Date().toISOString()
            };

        } catch (err: any) {
            console.error(`[ProjectPrdArchitect] Error Deep:`, err);
            return {
                status: 'success',
                ai_response: `⚠️ **Ha ocurrido un problema al procesar tanto detalle:** ${err.message}. \n\nEsto suele pasar si la Inteligencia intentó escribir más datos de los esperados y rompió el formato. Dímelo de otra manera y volvemos a intentarlo.`,
                specialist: metaId,
                timestamp: new Date().toISOString()
            };
        }
    }
}

export const projectPrdArchitectAgent = new ProjectPrdArchitectAgent();
