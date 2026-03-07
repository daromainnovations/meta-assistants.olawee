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
                dataContent: z.array(z.record(z.string(), z.any())).describe("Array de objetos a escribir. Ejemplo: [{\"Gasto\":\"Alquiler\",\"Monto\":500}, {\"Gasto\":\"Coche\",\"Monto\":150}]")
            }),
            func: async ({ fileName, sheetName, dataContent }) => {
                console.log(`[FileFactory - ✍️ EXCEL] LLM solicitó generar Excel: ${fileName}`);
                try {
                    let data = dataContent;

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
                sectionsContent: z.array(z.object({
                    heading: z.string().describe("Título de la sección"),
                    content: z.array(z.string()).describe("Lista de párrafos de texto de la sección")
                })).describe("Lista de secciones del documento")
            }),
            func: async ({ fileName, title, sectionsContent }) => {
                console.log(`[FileFactory - ✍️ WORD] LLM solicitó generar Word: ${fileName}`);
                try {
                    let sections = sectionsContent;

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
                slidesContent: z.array(z.object({
                    title: z.string().describe("Título de la diapositiva"),
                    points: z.array(z.string()).describe("Lista de puntos clave (bullets) de la diapositiva")
                })).describe("Lista de diapositivas de la presentación")
            }),
            func: async ({ fileName, presentationTitle, slidesContent }) => {
                console.log(`[FileFactory - ✍️ PPT] LLM solicitó generar presentación: ${fileName}`);
                try {
                    let slides = slidesContent;

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
                paragraphsContent: z.array(z.string()).describe("Array de strings (párrafos de texto). Ejemplo: [\"Párrafo 1\", \"Párrafo 2\"]")
            }),
            func: async ({ fileName, title, paragraphsContent }) => {
                console.log(`[FileFactory - ✍️ PDF] LLM solicitó generar PDF: ${fileName}`);
                try {
                    let paragraphs = paragraphsContent;

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
