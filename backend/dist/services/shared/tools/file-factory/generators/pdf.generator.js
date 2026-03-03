"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pdfGenerator = exports.PdfGenerator = void 0;
const pdfkit_1 = __importDefault(require("pdfkit"));
class PdfGenerator {
    /**
     * Genera un archivo PDF básico a partir de texto en memoria
     */
    async generate(title, paragraphs) {
        return new Promise((resolve, reject) => {
            console.log(`[PdfGenerator] Construyendo PDF en RAM: '${title}'`);
            try {
                const doc = new pdfkit_1.default({ margin: 50 });
                const chunks = [];
                // Guardar los chunks producidos en la memoria RAM
                doc.on('data', (chunk) => chunks.push(chunk));
                doc.on('end', () => {
                    const result = Buffer.concat(chunks);
                    resolve(result);
                });
                // Título
                doc.fontSize(24)
                    .fillColor('#1f2937') // Dark grey / Olawee style
                    .text(title, { align: 'center', paragraphGap: 20 });
                doc.moveDown();
                // Párrafos
                doc.fontSize(12)
                    .fillColor('#374151');
                paragraphs.forEach((par) => {
                    doc.text(par, { align: 'justify', paragraphGap: 10 });
                });
                // Finalizar y emitir "end"
                doc.end();
            }
            catch (err) {
                reject(err);
            }
        });
    }
}
exports.PdfGenerator = PdfGenerator;
exports.pdfGenerator = new PdfGenerator();
