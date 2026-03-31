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
exports.extractDataFromFiles = extractDataFromFiles;
const xlsx = __importStar(require("xlsx"));
const google_genai_1 = require("@langchain/google-genai");
const messages_1 = require("@langchain/core/messages");
/**
 * Recibe un array de archivos (los subidos por el usuario en el motor)
 * y devuelve el contenido extraído: texto para PDFs, JSON estructurado para Excels.
 */
async function extractDataFromFiles(files) {
    const result = {
        pdfTexts: [],
        excelData: []
    };
    for (const file of files) {
        const filename = file.originalname.toLowerCase();
        // Parsear PDFs
        if (filename.endsWith('.pdf')) {
            try {
                const { documentAnalysisService } = require('../../../shared/document-analysis.service');
                const extractedText = await documentAnalysisService.transcribePDF(file.buffer);
                result.pdfTexts.push({
                    filename: file.originalname,
                    text: extractedText
                });
            }
            catch (error) {
                console.error(`Error procesando PDF ${file.originalname}:`, error);
            }
        }
        // Parsear Excels
        else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
            try {
                const workbook = xlsx.read(file.buffer, { type: 'buffer' });
                const sheetsData = {};
                for (const sheetName of workbook.SheetNames) {
                    const sheet = workbook.Sheets[sheetName];
                    // Usamos { header: 1 } para obtener un array de arrays (filas x columnas)
                    // Esto es más seguro porque las cabeceras reales de estos Excels están en la fila 6 o 7
                    const json = xlsx.utils.sheet_to_json(sheet, { header: 1 });
                    sheetsData[sheetName] = json;
                }
                result.excelData.push({
                    filename: file.originalname,
                    sheets: sheetsData
                });
            }
            catch (error) {
                console.error(`Error procesando Excel ${file.originalname}:`, error);
            }
        }
    }
    return result;
}
/**
 * Fallback para OCR: Pasa el PDF nativo a Gemini 1.5 Pro/Flash,
 * que soporta extraer texto de PDFs visuales sin necesidad de transformarlos en imágenes primero.
 * (Asegúrate de tener process.env.GEMINI_API_KEY configurado).
 */
async function extractTextViaVisionModel(file) {
    try {
        const visionModel = new google_genai_1.ChatGoogleGenerativeAI({
            model: "gemini-1.5-flash", // Muy rápido y barato para OCR
            apiKey: process.env.GEMINI_API_KEY,
            temperature: 0,
        });
        const b64Data = file.buffer.toString('base64');
        // Construimos el mensaje soportado por LangChain Google GenAI para adjuntos
        const message = new messages_1.HumanMessage({
            content: [
                {
                    type: "text",
                    text: "Extrae absolutamente todo el texto visible en este documento. Devuélvelo en formato texto claro, respetando los datos numéricos, tablas, fechas, importes (bases, ivas, totales) y proveedores. No añadas comentarios extra, solo el texto extraído."
                },
                {
                    type: "image_url",
                    // LangChain Gemini mapper soporta application/pdf mediante este "hack" oficial
                    image_url: `data:application/pdf;base64,${b64Data}`
                }
            ]
        });
        const response = await visionModel.invoke([message]);
        return response.content.toString();
    }
    catch (error) {
        console.warn(`[DocumentParser] Error en el OCR de Gemini: ${error.message}. Devolviendo texto vacío.`);
        return "(Documento ilegible o error de lectura OCR)";
    }
}
