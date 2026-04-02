import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage } from '@langchain/core/messages';
import * as xlsx from 'xlsx';

export interface ExtractedData {
  pdfTexts: { filename: string; text: string; structured?: InvoiceData }[];
  excelData: { filename: string; sheets: { [sheetName: string]: any[] } }[];
}

export interface InvoiceData {
  numFactura?: string;
  proveedor?: string;
  fecha?: string;
  baseImponible?: number;
  iva?: number;
  total?: number;
  concepto?: string;
  nif?: string;
}

/**
 * 📄 EXTRACTOR PRINCIPAL DE ARCHIVOS
 * Usa Gemini Vision para PDFs e imágenes (OCR de alta fidelidad).
 */
export async function extractDataFromFiles(files: Express.Multer.File[]): Promise<ExtractedData> {
  const result: ExtractedData = { pdfTexts: [], excelData: [] };

  for (const file of files) {
    const filename = file.originalname.toLowerCase();

    // === PDF / Imágenes: OCR con Gemini Vision ===
    if (filename.endsWith('.pdf') || filename.endsWith('.jpg') || filename.endsWith('.jpeg') || filename.endsWith('.png')) {
      try {
        console.log(`[DocumentParser] 🔍 Extrayendo con Gemini Vision: ${file.originalname}`);
        const { text, structured } = await extractViaGeminiVision(file);
        result.pdfTexts.push({ filename: file.originalname, text, structured });
        console.log(`[DocumentParser] ✅ Extraído: ${file.originalname} | Factura: ${structured?.numFactura || 'N/A'} | Total: ${structured?.total || 'N/A'}`);
      } catch (error: any) {
        console.error(`[DocumentParser] ❌ Error OCR ${file.originalname}: ${error.message}`);
        result.pdfTexts.push({ filename: file.originalname, text: '(Error de lectura del documento)' });
      }
    }
    // === Excel ===
    else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
      try {
        const workbook = xlsx.read(file.buffer, { type: 'buffer' });
        const sheetsData: { [sheetName: string]: any[] } = {};
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          sheetsData[sheetName] = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        }
        result.excelData.push({ filename: file.originalname, sheets: sheetsData });
      } catch (error: any) {
        console.error(`[DocumentParser] ❌ Error Excel ${file.originalname}: ${error.message}`);
      }
    }
  }

  return result;
}

/**
 * 🤖 OCR CON GEMINI VISION (Alta Fidelidad)
 * Extrae texto Y estructura datos de facturas en JSON.
 */
async function extractViaGeminiVision(file: Express.Multer.File): Promise<{ text: string; structured: InvoiceData }> {
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
        text: `Analiza este documento de justificación de gasto (factura, recibo, ticket o justificante de pago).
        
Devuelve ÚNICAMENTE un objeto JSON válido con esta estructura (sin markdown, sin explicaciones extra):
{
  "numFactura": "número o referencia de la factura",
  "proveedor": "nombre del proveedor/emisor",
  "nif": "NIF/CIF del proveedor si aparece",
  "fecha": "fecha de la factura en formato DD/MM/YYYY",
  "concepto": "descripción del gasto o servicio",
  "baseImponible": 0.00,
  "iva": 0.00,
  "retencion": 0.00,
  "total": 0.00,
  "formaPago": "transferencia / efectivo / tarjeta / etc.",
  "textoCompleto": "todo el texto visible en el documento"
}

Si algún campo no está disponible, usa null. Los importes deben ser números, no strings.`
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

  let structured: InvoiceData = {};
  let fullText = jsonText;

  try {
    const parsed = JSON.parse(jsonText);
    structured = {
      numFactura: parsed.numFactura,
      proveedor: parsed.proveedor,
      fecha: parsed.fecha,
      baseImponible: typeof parsed.baseImponible === 'number' ? parsed.baseImponible : parseFloat(parsed.baseImponible) || undefined,
      iva: typeof parsed.iva === 'number' ? parsed.iva : parseFloat(parsed.iva) || undefined,
      total: typeof parsed.total === 'number' ? parsed.total : parseFloat(parsed.total) || undefined,
      concepto: parsed.concepto,
      nif: parsed.nif,
    };
    fullText = parsed.textoCompleto || jsonText;
  } catch {
    // Si no es JSON válido, devolver como texto plano
    console.warn(`[DocumentParser] ⚠️ No se pudo parsear JSON, usando texto plano.`);
    fullText = rawText;
  }

  return { text: fullText, structured };
}
