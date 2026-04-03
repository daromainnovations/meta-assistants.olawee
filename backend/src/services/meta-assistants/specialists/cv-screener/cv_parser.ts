import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import * as xlsx from 'xlsx';
import * as mammoth from 'mammoth';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 🛠️ DEBUG LOGGER (Sobrevive a crashes del proceso)
 */
function debugLog(msg: string) {
  try {
    const logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, 'cv_parser_raw.log');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logPath, `[${timestamp}] [DEBUG] ${msg}\n`);
    console.log(`[CVParser-Debug] ${msg}`);
  } catch (e) {
    console.error(`[CVParser-Debug] Error writing log:`, e);
  }
}

export interface CVProfile {
  nombre?: string;
  email?: string;
  telefono?: string;
  ubicacion?: string;
  experienciaTotalAnos?: number;
  ultimoCargo?: string;
  resumenPerfil?: string;
  habilidadesTecnicas?: string[];
  habilidadesBlandas?: string[];
  formacionAcademica?: { titulo: string; institucion: string; año?: string }[];
  idiomas?: { idioma: string; nivel: string }[];
  experienciaDetallada?: { cargo: string; empresa: string; periodo: string; descripcion: string }[];
}

export interface ExtractedCVData {
  filename: string;
  profiles: CVProfile[];
  error?: string;
}

/**
 * 👤 EXTRACTOR DE CURRICULUMS (OCR + IA)
 */
export async function extractCVsFromFiles(files: Express.Multer.File[]): Promise<ExtractedCVData[]> {
  const results: ExtractedCVData[] = [];
  let visionCallCount = 0;

  for (const file of files) {
    const filename = file.originalname.toLowerCase();

    if (filename.endsWith('.pdf') || filename.endsWith('.jpg') || filename.endsWith('.jpeg') || filename.endsWith('.png') || filename.endsWith('.docx')) {
        try {
          if (visionCallCount > 0) {
            await new Promise(resolve => setTimeout(resolve, 1200));
          }
          visionCallCount++;

          let profiles: CVProfile[] = [];
          if (filename.endsWith('.docx')) {
            debugLog(`Iniciando extracción Word: ${file.originalname}`);
            try {
              if (!file.buffer) {
                debugLog(`❌ ERROR: file.buffer es nulo para ${file.originalname}`);
                throw new Error('Buffer de archivo no encontrado.');
              }
              
              debugLog(`Llamando a Mammoth... (Buffer size: ${file.buffer.length})`);
              const { value: text } = await mammoth.extractRawText({ buffer: file.buffer });
              debugLog(`Mammoth éxito. Texto obtenido (${text.length} chars).`);
              
              if (!text || text.trim().length === 0) {
                debugLog(`⚠️ Texto de Word vacío.`);
                throw new Error('Documento Word vacío o ilegible.');
              }
              
              debugLog(`Llamando a Gemini Text para parsear CVs...`);
              profiles = await extractCVViaGeminiText(text);
              debugLog(`Gemini Text éxito. Perfiles extraídos: ${profiles.length}`);
            } catch (err: any) {
              debugLog(`❌ Error en bloque Word: ${err.message}`);
              console.error(`[CVParser] ❌ Error en Mammoth/Text: ${err.message}`);
              profiles = [];
            }
          } else {
            debugLog(`Iniciando Vision para: ${file.originalname}`);
            profiles = await extractCVViaGeminiVision(file);
            debugLog(`Vision éxito. Perfiles extraídos: ${profiles.length}`);
          }

          results.push({ filename: file.originalname, profiles });
        } catch (error: any) {
          console.error(`[CVParser] ❌ Error crítico en archivo ${file.originalname}: ${error.message}`);
          results.push({ filename: file.originalname, profiles: [], error: error.message });
        }
    }
  }

  return results;
}

/**
 * 🤖 OCR ESPECIALIZADO EN CVs CON GEMINI VISION
 */
async function extractCVViaGeminiVision(file: Express.Multer.File): Promise<CVProfile[]> {
  const visionModel = new ChatGoogleGenerativeAI({
    model: 'gemini-2.0-flash',
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0,
  });

  const mimeType = file.originalname.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
  const b64Data = file.buffer.toString('base64');

  const message = new HumanMessage({
    content: [
      {
        type: 'text',
        text: `Analiza este documento que puede contener uno o VARIOS Currículums Vitae independientes.
        
Devuelve ÚNICAMENTE un objeto JSON con una lista de candidatos bajo la clave "candidatos".
Estructura esperada:
{
  "candidatos": [
    {
      "nombre": "nombre completo",
      "email": "ejemplo@correo.com",
      "telefono": "numero de contacto",
      "ubicacion": "ciudad, pais",
      "experienciaTotalAnos": 5.5,
      "ultimoCargo": "título del puesto más reciente",
      "resumenPerfil": "breve resumen de su trayectoria",
      "habilidadesTecnicas": ["java", "python", "aws"],
      "habilidadesBlandas": ["liderazgo", "trabajo en equipo"],
      "formacionAcademica": [
        { "titulo": "Grado en...", "institucion": "Universidad...", "año": "2020" }
      ],
      "idiomas": [
        { "idioma": "Inglés", "nivel": "C1" }
      ]
    }
  ]
}

- Detecta separaciones entre personas (páginas distintas o bloques de contacto nuevos).
- Si solo hay una persona, devuelve la lista con un único elemento.`
      },
      {
        type: 'image_url',
        image_url: `data:${mimeType};base64,${b64Data}`
      }
    ]
  });

  const response = await visionModel.invoke([message]);
  const rawText = response.content.toString().trim();

  // Limpiar posible markdown code block
  const jsonText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    const parsed = JSON.parse(jsonText);
    return (parsed.candidatos || parsed) as CVProfile[];
  } catch (error) {
    console.warn(`[CVParser] ⚠️ Error al parsear JSON, intentando recuperación...`);
    const startIdx = jsonText.indexOf('{');
    const endIdx = jsonText.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1) {
      try {
        const recovered = JSON.parse(jsonText.substring(startIdx, endIdx + 1));
        return (recovered.candidatos || [recovered]) as CVProfile[];
      } catch {
        console.error(`[CVParser] ❌ Fallo total en la extracción de perfiles.`);
      }
    }
    return [];
  }
}

/**
 * 🤖 EXTRACCIÓN DESDE TEXTO (WORD/DOCX) CON GEMINI FLASH
 */
async function extractCVViaGeminiText(text: string): Promise<CVProfile[]> {
  const model = new ChatGoogleGenerativeAI({
    model: 'gemini-2.0-flash',
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0,
  });

  const prompt = `Analiza este texto que contiene uno o VARIOS Currículums Vitae independientes.
  
Devuelve ÚNICAMENTE un objeto JSON con una lista de candidatos bajo la clave "candidatos".
Estructura:
{
  "candidatos": [
    {
      "nombre": "nombre completo",
      "email": "ejemplo@correo.com",
      "telefono": "numero de contacto",
      "ubicacion": "ciudad, pais",
      "experienciaTotalAnos": 5.5,
      "ultimoCargo": "título del puesto más reciente",
      "resumenPerfil": "resumen de trayectoria",
      "habilidadesTecnicas": ["java", "python"],
      "habilidadesBlandas": ["liderazgo"],
      "formacionAcademica": [{ "titulo": "Grado...", "institucion": "Univ...", "año": "2020" }],
      "idiomas": [{ "idioma": "Inglés", "nivel": "C1" }]
    }
  ]
}

- Identifica perfiles distintos basándote en los datos de contacto y nombres.

TEXTO DEL DOCUMENTO:
${text}`;

  const response = await model.invoke([new HumanMessage(prompt)]);
  const rawText = response.content.toString().trim();
  const jsonText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    const parsed = JSON.parse(jsonText);
    return (parsed.candidatos || parsed) as CVProfile[];
  } catch {
    return [];
  }
}
