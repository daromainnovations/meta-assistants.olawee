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
exports.wordGenerator = exports.WordGenerator = void 0;
const docx = __importStar(require("docx"));
class WordGenerator {
    /**
     * Genera un archivo DOCX (Word) a partir de un Array de párrafos/texto
     * usando la biblioteca 'docx'.
     */
    async generate(title, sections) {
        console.log(`[WordGenerator] Construyendo Word en RAM: '${title}' con ${sections.length} secciones`);
        const childrenDocs = [];
        // 1. Título principal
        childrenDocs.push(new docx.Paragraph({
            text: title,
            heading: docx.HeadingLevel.HEADING_1,
            spacing: { after: 300 }
        }));
        // 2. Procesar secciones (H2 + Párrafos)
        sections.forEach((section) => {
            // Añadir subtítulo
            childrenDocs.push(new docx.Paragraph({
                text: section.heading,
                heading: docx.HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 100 }
            }));
            // Añadir párrafos
            section.content.forEach((textLine) => {
                childrenDocs.push(new docx.Paragraph({
                    text: textLine,
                    spacing: { after: 120 }
                }));
            });
        });
        // 3. Crear Estructura de Documento
        const doc = new docx.Document({
            creator: "Olawee AI Assistant",
            title: title,
            sections: [
                {
                    properties: {},
                    children: childrenDocs,
                },
            ],
        });
        // 4. Exportar a Buffer directamente en RAM
        const b64 = await docx.Packer.toBuffer(doc);
        return b64;
    }
}
exports.WordGenerator = WordGenerator;
exports.wordGenerator = new WordGenerator();
