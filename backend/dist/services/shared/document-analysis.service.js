"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.documentAnalysisService = exports.DocumentAnalysisService = void 0;
// pdf-parse loaded dynamically inside the method
const xlsx = __importStar(require("xlsx"));
const mammoth = __importStar(require("mammoth"));
const generative_ai_1 = require("@google/generative-ai");
class DocumentAnalysisService {
    /**
     * Extrae texto de un PDF.
     */
    async transcribePDF(buffer) {
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
            }
            finally {
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
                const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
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
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[DocumentAnalysis] Error transcribing PDF:', msg);
            throw new Error(`Failed to transcribe PDF. Reason: ${msg}`);
        }
    }
    /**
     * Extrae datos de un Excel y los devuelve como texto estructurado.
     */
    async transcribeExcel(buffer) {
        try {
            console.log('[DocumentAnalysis] Transcribing Excel...');
            const workbook = xlsx.read(buffer, { type: 'buffer' });
            const allSheetsText = [];
            for (const sheetName of workbook.SheetNames) {
                const sheet = workbook.Sheets[sheetName];
                const rows = xlsx.utils.sheet_to_json(sheet);
                allSheetsText.push(`--- Hoja: ${sheetName} (${rows.length} filas) ---`);
                allSheetsText.push(JSON.stringify(rows, null, 2));
            }
            const result = allSheetsText.join('\n');
            console.log(`[DocumentAnalysis] Excel Sheets: ${workbook.SheetNames.length}`);
            return result;
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[DocumentAnalysis] Error transcribing Excel:', msg);
            throw new Error('Failed to transcribe Excel');
        }
    }
    /**
     * Extrae texto de un archivo .doc/.docx usando mammoth.
     */
    async transcribeDoc(buffer) {
        try {
            console.log('[DocumentAnalysis] Transcribing DOC/DOCX...');
            const result = await mammoth.extractRawText({ buffer: buffer });
            console.log(`[DocumentAnalysis] DOC Characters: ${result.value.length}`);
            return result.value;
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[DocumentAnalysis] Error transcribing DOC:', msg);
            throw new Error('Failed to transcribe DOC');
        }
    }
    /**
     * Envía una imagen a Gemini AI para obtener una descripción detallada.
     */
    async describeImageWithGemini(buffer, mimeType) {
        try {
            console.log('[DocumentAnalysis] Sending image to Gemini for description...');
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey || apiKey === 'tu_api_key_de_gemini_aqui') {
                throw new Error('GEMINI_API_KEY is not configured in .env');
            }
            const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
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
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[DocumentAnalysis] Error with Gemini image analysis:', msg);
            throw new Error(`Failed to describe image with Gemini: ${msg}`);
        }
    }
}
exports.DocumentAnalysisService = DocumentAnalysisService;
exports.documentAnalysisService = new DocumentAnalysisService();
