import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage } from '@langchain/core/messages';
import * as xlsx from 'xlsx';

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
  profile?: CVProfile;
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

    if (filename.endsWith('.pdf') || filename.endsWith('.jpg') || filename.endsWith('.jpeg') || filename.endsWith('.png')) {
      try {
        // ⏳ Throttle: esperar 1.2s entre llamadas para evitar rate limit (429)
        if (visionCallCount > 0) {
          await new Promise(resolve => setTimeout(resolve, 1200));
        }
        visionCallCount++;

        console.log(`[CVParser] 🔍 [${visionCallCount}] Procesando CV: ${file.originalname}`);
        const profile = await extractCVViaGeminiVision(file);
        results.push({ filename: file.originalname, profile });
      } catch (error: any) {
        console.error(`[CVParser] ❌ Error en ${file.originalname}: ${error.message}`);
        results.push({ filename: file.originalname, error: 'No se pudo leer el archivo' });
      }
    }
  }

  return results;
}

/**
 * 🤖 OCR ESPECIALIZADO EN CVs CON GEMINI VISION
 */
async function extractCVViaGeminiVision(file: Express.Multer.File): Promise<CVProfile> {
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
        text: `Analiza este Curriculum Vitae y extrae la información más relevante de forma estructurada.
        
Devuelve ÚNICAMENTE un objeto JSON válido con esta estructura (sin markdown, sin explicaciones extra):
{
  "nombre": "nombre completo",
  "email": "ejemplo@correo.com",
  "telefono": "numero de contacto",
  "ubicacion": "ciudad, pais",
  "experienciaTotalAnos": 5.5,
  "ultimoCargo": "título del puesto más reciente",
  "resumenPerfil": "breve resumen de 2-3 frases de su trayectoria",
  "habilidadesTecnicas": ["java", "python", "aws"],
  "habilidadesBlandas": ["liderazgo", "trabajo en equipo"],
  "formacionAcademica": [
    { "titulo": "Grado en...", "institucion": "Universidad...", "año": "2020" }
  ],
  "idiomas": [
    { "idioma": "Inglés", "nivel": "C1" }
  ],
  "experienciaDetallada": [
    { "cargo": "Senior dev", "empresa": "Tech Corp", "periodo": "2021-2023", "descripcion": "desarrollo de..." }
  ]
}

- Los años de experiencia deben ser un número.
- Si no encuentras un campo, usa null.`
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
    return JSON.parse(jsonText) as CVProfile;
  } catch (error) {
    console.warn(`[CVParser] ⚠️ No se pudo parsear el JSON de ${file.originalname}, reintentando con limpieza...`);
    // Intento simple de recuperación si hay texto extra
    const startIdx = jsonText.indexOf('{');
    const endIdx = jsonText.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1) {
      try {
        return JSON.parse(jsonText.substring(startIdx, endIdx + 1)) as CVProfile;
      } catch {
        console.error(`[CVParser] ❌ Fallo total en el parseo.`);
      }
    }
    return { resumenPerfil: "Fallo al procesar los datos estructurados del CV" };
  }
}
