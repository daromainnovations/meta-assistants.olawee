import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

import { excelGenerator } from "./generators/excel.generator";
import { wordGenerator } from "./generators/word.generator";
import { pptGenerator } from "./generators/ppt.generator";
import { pdfGenerator } from "./generators/pdf.generator";
import { supabaseStorageService } from "../../storage/supabase-storage.service";

/**
 * ============================================================
 * 🏭 FILE FACTORY SERVICE
 * ============================================================
 * Fabrica de archivos que expone diferentes "Tools" de LangChain.
 * Estas tools permiten que un LLM genere Archivos (Excel, Docx, Pptx)
 * e instantáneamente reciba el Link de descarga guardado en Supabase Storage.
 */
export class FileFactoryService {

    /**
     * 1️⃣ Tool de Generación de Excel (.xlsx)
     */
    getCreateExcelTool() {
        return new DynamicStructuredTool({
            name: "create_excel_document",
            description: "Útil cuando el usuario explícitamente pide 'crear un archivo excel' o 'generar una tabla (.xlsx)' o un spreadsheet.",
            schema: z.object({
                fileName: z.string().describe("El nombre deseado para el archivo sin extension. (ej: 'Presupuesto_2026')"),
                sheetName: z.string().describe("El nombre de la hoja inferior del excel."),
                dataContent: z.string().describe("Texto en formato JSON con el array de objetos a escribir. Ejemplo estricto: '[{\"Gasto\":\"Alquiler\",\"Monto\":500}, {\"Gasto\":\"Coche\",\"Monto\":150}]'")
            }),
            func: async ({ fileName, sheetName, dataContent }) => {
                console.log(`[FileFactory - ✍️ EXCEL] LLM solicitó generar Excel: ${fileName}`);
                try {
                    let data: Record<string, any>[];
                    try {
                        data = JSON.parse(dataContent);
                        if (!Array.isArray(data)) throw new Error("No es un array");
                    } catch (e) {
                        return "Error: dataContent debe ser un String con un array JSON válido. Ejemplo: '[{\"a\": 1}]'. Por favor, reintenta llamando a la herramienta correctamente.";
                    }

                    // Genera Buffer
                    const buffer = await excelGenerator.generate(data, sheetName);

                    // Sube a Supabase //TODO: Add fake base url support if non provided?
                    const publicUrl = await supabaseStorageService.uploadBuffer(
                        buffer,
                        `${fileName}.xlsx`,
                        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                    );

                    return `¡Archivo de Excel (.xlsx) creado exitosamente!\n\nProporciona al usuario el siguiente enlace de descarga para obtener su archivo: ${publicUrl} \n\nInstrucción estricta: dile que ya puede descargar su excel y proporciona tu respuesta con estilo Markdown como [Descargar ${fileName}](${publicUrl})`;

                } catch (error: any) {
                    console.error("[FileFactory - ✍️ EXCEL] ❌ ERROR:", error);
                    return `Error interno creando Excel: ${error.message}`;
                }
            }
        });
    }

    /**
     * 2️⃣ Tool de Generación de Word (.docx)
     */
    getCreateWordTool() {
        return new DynamicStructuredTool({
            name: "create_word_document",
            description: "Útil cuando el usuario te solicita 'escribe un documento de word', 'crear un .docx' con estructura de título y párrafos.",
            schema: z.object({
                fileName: z.string().describe("Nombre de archivo sin extensión (ej: 'Informe_Auditoria')"),
                title: z.string().describe("Título principal que irá grande en el documento."),
                sectionsContent: z.string().describe("Texto en formato JSON con las secciones. Ejemplo: '[{\"heading\":\"Introducción\",\"content\":[\"Párrafo 1\",\"Párrafo 2\"]}]'")
            }),
            func: async ({ fileName, title, sectionsContent }) => {
                console.log(`[FileFactory - ✍️ WORD] LLM solicitó generar Word: ${fileName}`);
                try {
                    let sections: { heading: string; content: string[] }[];
                    try {
                        sections = JSON.parse(sectionsContent);
                        if (!Array.isArray(sections)) throw new Error("No es un array");
                    } catch (e) {
                        return "Error: sectionsContent debe ser un String con un array JSON válido. Ejemplo: '[{\"heading\":\"T\",\"content\":[\"p\"]}]'. Reintenta llamando a la herramienta correctamente.";
                    }

                    const buffer = await wordGenerator.generate(title, sections);
                    const publicUrl = await supabaseStorageService.uploadBuffer(
                        buffer,
                        `${fileName}.docx`,
                        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                    );

                    return `¡Archivo Word (.docx) creado exitosamente!\n\nProporciona al usuario el enlace de descarga: ${publicUrl}\nDile que puede descargarlo y formatea tu respuesta en Markdown como [Descargar Documento](${publicUrl})`;
                } catch (error: any) {
                    console.error("[FileFactory - ✍️ WORD] ❌ ERROR:", error);
                    return `Error interno creando Word: ${error.message}`;
                }
            }
        });
    }

    /**
     * 3️⃣ Tool de Generación de PowerPoint (.pptx)
     */
    getCreatePptTool() {
        return new DynamicStructuredTool({
            name: "create_powerpoint_presentation",
            description: "Útil cuando el usuario pide crear 'una presentación', 'un powerpoint', o 'diapositivas'.",
            schema: z.object({
                fileName: z.string().describe("Nombre de archivo sin extensión (ej: 'Presentacion_Lanzamiento')"),
                presentationTitle: z.string().describe("Título enorme de la presentación de la primera diapositiva o portada."),
                slidesContent: z.string().describe("Texto en formato JSON con la lista de diapositivas. Ejemplo: '[{\"title\":\"Problema\",\"points\":[\"Punto A\",\"Punto B\"]}]'")
            }),
            func: async ({ fileName, presentationTitle, slidesContent }) => {
                console.log(`[FileFactory - ✍️ PPT] LLM solicitó generar presentación: ${fileName}`);
                try {
                    let slides: { title: string; points: string[] }[];
                    try {
                        slides = JSON.parse(slidesContent);
                        if (!Array.isArray(slides)) throw new Error("No es un array");
                    } catch (e) {
                        return "Error: slidesContent debe ser un String con un array JSON válido. Ejemplo: '[{\"title\":\"T\",\"points\":[\"p\"]}]'. Reintenta llamando a la herramienta correctamente.";
                    }

                    const buffer = await pptGenerator.generate(presentationTitle, slides);
                    const publicUrl = await supabaseStorageService.uploadBuffer(
                        buffer,
                        `${fileName}.pptx`,
                        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
                    );

                    return `¡Archivo PowerPoint (.pptx) creado!\n\nEnlace de descarga para el usuario: ${publicUrl}\nEntrégale esto en tu chat formateado como: [Descargar Presentación (${fileName})](${publicUrl})`;
                } catch (error: any) {
                    console.error("[FileFactory - ✍️ PPT] ❌ ERROR:", error);
                    return `Error interno creando Presentación: ${error.message}`;
                }
            }
        });
    }

    /**
     * 4️⃣ Tool de Generación de Archivos PDF (.pdf)
     */
    getCreatePdfTool() {
        return new DynamicStructuredTool({
            name: "create_pdf_document",
            description: "Útil cuando el usuario te solicita 'quiero un pdf', 'crea un .pdf' o generar un documento oficial en formato inmutable.",
            schema: z.object({
                fileName: z.string().describe("Nombre de archivo sin extensión (ej: 'Manual_Usuario')"),
                title: z.string().describe("Título principal y enorme que irá centrado en la primera parte."),
                paragraphsContent: z.string().describe("Texto en formato JSON con un array de strings (los párrafos). Ejemplo: '[\"Párrafo 1\", \"Párrafo 2\"]'")
            }),
            func: async ({ fileName, title, paragraphsContent }) => {
                console.log(`[FileFactory - ✍️ PDF] LLM solicitó generar PDF: ${fileName}`);
                try {
                    let paragraphs: string[];
                    try {
                        paragraphs = JSON.parse(paragraphsContent);
                        if (!Array.isArray(paragraphs)) throw new Error("No es un array");
                    } catch (e) {
                        return "Error: paragraphsContent debe ser un String con un array JSON válido. Ejemplo: '[\"p1\", \"p2\"]'. Reintenta llamando a la herramienta correctamente.";
                    }

                    const buffer = await pdfGenerator.generate(title, paragraphs);
                    const publicUrl = await supabaseStorageService.uploadBuffer(
                        buffer,
                        `${fileName}.pdf`,
                        'application/pdf'
                    );

                    return `¡Archivo PDF (.pdf) creado!\n\nProporciona al usuario este enlace de manera amigable: ${publicUrl}\nDile que descargue su PDF haciendo clic y formatea tu respuesta en Markdown como [Descargar Documento PDF](${publicUrl})`;
                } catch (error: any) {
                    console.error("[FileFactory - ✍️ PDF] ❌ ERROR:", error);
                    return `Error interno creando PDF: ${error.message}`;
                }
            }
        });
    }

    /**
     * Devuelve todas las herramientas de generación para inyectarlas donde se pida.
     */
    getAllFactoryTools() {
        return [
            this.getCreateExcelTool(),
            this.getCreateWordTool(),
            this.getCreatePptTool(),
            this.getCreatePdfTool()
        ];
    }
}

export const fileFactoryService = new FileFactoryService();
