// pdf-parse loaded dynamically inside the method
import * as xlsx from 'xlsx';
import * as mammoth from 'mammoth';
import { GoogleGenerativeAI } from '@google/generative-ai';

export class DocumentAnalysisService {

    /**
     * Extrae texto de un PDF.
     */
    async transcribePDF(buffer: Buffer): Promise<string> {
        try {
            console.log('[DocumentAnalysis] Transcribing PDF...');
            const { PDFParse } = require('pdf-parse');
            const parser = new PDFParse({ data: buffer });
            let extractedText = '';
            let numpages = 0;

            try {
                const data = await parser.getText();
                extractedText = data.text ? data.text.trim() : '';
                const info = await parser.getInfo();
                numpages = info?.total || 0;
            } finally {
                await parser.destroy();
            }

            console.log(`[DocumentAnalysis] PDF Pages: ${numpages}, Characters extracted: ${extractedText.length}`);

            // Si pdf-parse no puede extraer casi texto, probablemente sea un PDF escaneado
            if (extractedText.length < 50) {
                console.log(`[DocumentAnalysis] PDF seems to be an image/scanned. Falling back to Gemini OCR...`);
                const apiKey = process.env.GEMINI_API_KEY;
                if (!apiKey || apiKey === 'tu_api_key_de_gemini_aqui') {
                    throw new Error('GEMINI_API_KEY is not configured in .env');
                }

                const genAI = new GoogleGenerativeAI(apiKey);
                const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

                const pdfPart = {
                    inlineData: {
                        data: buffer.toString('base64'),
                        mimeType: 'application/pdf'
                    }
                };

                const result = await model.generateContent([
                    'Extrae y reproduce exactamente todo el texto visible en todas las páginas de este PDF. Si contiene tablas, mantén su estructura en texto. No resumas, devuelve el texto puro.',
                    pdfPart
                ]);

                const description = result.response.text();
                console.log(`[DocumentAnalysis] Gemini OCR result length: ${description.length} chars`);
                return description;
            }

            return extractedText;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[DocumentAnalysis] Error transcribing PDF:', msg);
            throw new Error(`Failed to transcribe PDF. Reason: ${msg}`);
        }
    }

    /**
     * Extrae datos de un Excel y los devuelve como texto estructurado.
     * Detecta automáticamente la fila de cabeceras para un JSON limpio.
     */
    async transcribeExcel(buffer: Buffer): Promise<string> {
        try {
            console.log('[DocumentAnalysis] Transcribing Excel (Smart Mode)...');
            const workbook = xlsx.read(buffer, { type: 'buffer' });
            const allSheetsText: string[] = [];

            for (const sheetName of workbook.SheetNames) {
                const sheet = workbook.Sheets[sheetName];
                
                // Encontrar la fila de cabeceras (header row)
                const aoa = xlsx.utils.sheet_to_json(sheet, { header: 1, range: 0, defval: '' }) as any[][];
                let headerRowIndex = 0;
                for (let i = 0; i < Math.min(aoa.length, 15); i++) {
                    const row = aoa[i];
                    if (row.some(cell => {
                        const c = String(cell).toLowerCase();
                        return c.includes('factura') || c.includes('proveedor') || c.includes('gasto') || c.includes('importe');
                    })) {
                        headerRowIndex = i;
                        break;
                    }
                }

                // Generamos el JSON desde esa fila exacta
                const rows: any[] = xlsx.utils.sheet_to_json(sheet, { range: headerRowIndex });
                allSheetsText.push(`--- Hoja: ${sheetName} (Desde fila ${headerRowIndex + 1}, ${rows.length} filas datos) ---`);
                allSheetsText.push(JSON.stringify(rows, null, 2));
            }

            const result = allSheetsText.join('\n');
            console.log(`[DocumentAnalysis] Excel Sheets: ${workbook.SheetNames.length}`);
            return result;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[DocumentAnalysis] Error transcribing Excel:', msg);
            throw new Error('Failed to transcribe Excel');
        }
    }

    /**
     * Extrae texto de un archivo .doc/.docx usando mammoth.
     */
    async transcribeDoc(buffer: Buffer): Promise<string> {
        try {
            console.log('[DocumentAnalysis] Transcribing DOC/DOCX...');
            const result = await mammoth.extractRawText({ buffer: buffer });
            console.log(`[DocumentAnalysis] DOC Characters: ${result.value.length}`);
            return result.value;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[DocumentAnalysis] Error transcribing DOC:', msg);
            throw new Error('Failed to transcribe DOC');
        }
    }

    /**
     * Envía una imagen a Gemini AI para obtener una descripción detallada.
     */
    async describeImageWithGemini(buffer: Buffer, mimeType: string): Promise<string> {
        try {
            console.log('[DocumentAnalysis] Sending image to Gemini for description...');

            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey || apiKey === 'tu_api_key_de_gemini_aqui') {
                throw new Error('GEMINI_API_KEY is not configured in .env');
            }

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

            const imagePart = {
                inlineData: {
                    data: buffer.toString('base64'),
                    mimeType: mimeType
                }
            };

            const result = await model.generateContent([
                'Describe this image in detail. Extract any visible text. Provide a comprehensive description that could be used as context for a conversation.',
                imagePart
            ]);

            const description = result.response.text();
            console.log(`[DocumentAnalysis] Gemini description length: ${description.length} chars`);
            return description;

        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[DocumentAnalysis] Error with Gemini image analysis:', msg);
            throw new Error(`Failed to describe image with Gemini: ${msg}`);
        }
    }
}

export const documentAnalysisService = new DocumentAnalysisService();
