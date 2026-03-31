// @ts-nocheck
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
// @ts-ignore
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { extractDataFromFiles } from './document_parser';
import { generateExcelBuffer, GastoAnexo2, JustificanteAnexo3 } from './excel_generator';
import { getPrisma } from '../../../shared/prisma.service';


export class GrantJustificationAgent {
  
  async run(
    userMessage: string,
    files: Express.Multer.File[],
    sessionId: string,
    docContext: string
  ): Promise<any> {
    
    console.log(`[GrantJustifier] 🧠 MEMORY CHECK: Se han recibido ${docContext.length} caracteres de contexto documental unificado.`);

    // Variables de estado para compartir datos LLM -> Salida


    let generatedBuffer: Buffer | null = null;
    let excelFileName: string = '';

    // 3. Definición de Herramientas
    const generarExcelTool = new DynamicStructuredTool({
      name: 'generar_excel_justificacion',
      description: 'Genera un archivo Excel (.xlsx) con nuevas filas para el Anexo 2 (Gastos) y Anexo 3 (Justificantes). Úsala cuando el usuario te pida rellenar el excel o añadir facturas. Se encargará de crear el búfer en memoria.',
      schema: z.object({
        filename: z.string().describe('El nombre que tendrá el archivo generado. (Ej: Anexos_Subvencion_Actualizados.xlsx)'),
        nuevosGastos: z.array(z.object({
          refGasto: z.string().describe('Ej: G28'),
          numFactura: z.string(),
          proveedor: z.string(),
          partida: z.string(),
          actividad: z.string(),
          fecha: z.union([z.string(), z.number()]),
          concepto: z.string(),
          baseImponible: z.number(),
          iva: z.number(),
          retencion: z.number().default(0),
          total: z.number(),
          importeImputado: z.number(),
          observacionesFactura: z.string().optional().default(''),
          refJustificante: z.string().describe('Ej: J28'),
          fechaPago: z.union([z.string(), z.number()]),
          importePagado: z.number(),
          observacionesPago: z.string().optional().default('')
        })).describe('Array de objetos representando cada nueva línea que irá al Anexo 2'),
        nuevosJustificantes: z.array(z.object({
          refJustificante: z.string().describe('Ej: J28'),
          refGastoVinculado: z.string().describe('Ej: G28'),
          partida: z.string(),
          actividad: z.string(),
          tipoDocumento: z.string().default('TRANSFERENCIA'),
          descripcion: z.string(),
          fecha: z.union([z.string(), z.number()]),
          observaciones: z.string().optional().default('')
        })).describe('Array de objetos representando la justificación de pago (Anexo 3)')
      }),
      func: async (args) => {
        try {
          const { filename, nuevosGastos, nuevosJustificantes } = args;
          generatedBuffer = generateExcelBuffer(
            nuevosGastos as GastoAnexo2[], 
            nuevosJustificantes as JustificanteAnexo3[]
          );
          excelFileName = filename;
          return "El Excel se ha generado en memoria correctamente y entregado a la plataforma OLAWEE. Dile al usuario que puede descargar el archivo en el enlace o interfaz proporcionado.";
        } catch (error: any) {
          return `Error al generar el Excel: ${error.message}`;
        }
      }
    });

    const tools = [generarExcelTool];

    // 4. Configurar LangChain (Modelo Gemini 2.0 Flash)
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY no configurado en el entorno (.env)');

    const llm = new ChatGoogleGenerativeAI({
      apiKey,
      model: "gemini-2.0-flash",
      temperature: 0
    });



    const promptText = `Eres un auditor experto en Subvenciones Españolas. Tu nombre es "Asistente Justificador".
Recibes facturas en PDF y hojas Excel (Anexo 2 de gastos, Anexo 3 de justificantes y resúmenes).
Tu trabajo es responder a la petición del usuario, comprobando si las facturas emitidas por proveedores coinciden con los Excels,
o usando la herramienta "generar_excel_justificacion" para crear los Anexos 2 y 3 si el usuario lo exige.
Comunícate siempre en español claro y profesional.
Alerta de incongruencias (IVA que no cuadra, facturas sin justificante).

{document_context}
`;


    const prompt = ChatPromptTemplate.fromMessages([
      ["system", promptText],
      ["user", "{input}"],
      new MessagesPlaceholder("agent_scratchpad"),
    ]);

    const agent = createToolCallingAgent({
      llm,
      tools,
      prompt,
    });

    const agentExecutor = new AgentExecutor({
      agent,
      tools,
      verbose: true // Ideal para ver los logs en el backend de servidor
    });

    // 5. Ejecutar Agente
    console.log(`[GrantJustificationAgent] Iniciando Invocación. Sesión: ${sessionId}`);
    const safeInput = userMessage && userMessage.trim().length > 0 
        ? userMessage 
        : "Revisa los documentos adjuntos y dime si está todo en orden o si necesitas algo más.";

    const agentResult = await agentExecutor.invoke({
      input: safeInput,
      document_context: docContext || '⚠️ AVISO: No hay documentos disponibles aún. Solicita al usuario el Excel de gastos y las facturas.'
    });

    // 6. Preparar Respuesta
    const returnObj: any = {
      ai_response: agentResult.output,
      status: 'success',
      specialist: 'grant_justification',
      timestamp: new Date().toISOString()
    };

    // Si la Tool fue llamada y construyó un Buffer, lo empaquetamos aquí en Raw Data (Capa limpia de Arquitectura)
    if (generatedBuffer) {
      returnObj.generated_files = [
        {
          filename: excelFileName || 'Anexos_Subvencion.xlsx',
          mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          // base64: generatedBuffer.toString('base64') -> (Si preferis base64 lo podéis descomentar)
          buffer: generatedBuffer // Lo dejamos como raw buffer para que OLAWEE haga de las suyas (ej. Supabase)
        }
      ];
    }

    return returnObj;
  }
}

export const grantJustificationAgent = new GrantJustificationAgent();
