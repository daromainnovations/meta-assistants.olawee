import * as docx from 'docx';

export class WordGenerator {
    /**
     * Genera un archivo DOCX (Word) a partir de un Array de párrafos/texto
     * usando la biblioteca 'docx'.
     */
    async generate(title: string, sections: { heading: string; content: string[] }[]): Promise<Buffer> {
        console.log(`[WordGenerator] Construyendo Word en RAM: '${title}' con ${sections.length} secciones`);

        const childrenDocs: any[] = [];

        // 1. Título principal
        childrenDocs.push(
            new docx.Paragraph({
                text: title,
                heading: docx.HeadingLevel.HEADING_1,
                spacing: { after: 300 }
            })
        );

        // 2. Procesar secciones (H2 + Párrafos)
        sections.forEach((section) => {
            // Añadir subtítulo
            childrenDocs.push(
                new docx.Paragraph({
                    text: section.heading,
                    heading: docx.HeadingLevel.HEADING_2,
                    spacing: { before: 200, after: 100 }
                })
            );

            // Añadir párrafos
            section.content.forEach((textLine) => {
                childrenDocs.push(
                    new docx.Paragraph({
                        text: textLine,
                        spacing: { after: 120 }
                    })
                );
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

export const wordGenerator = new WordGenerator();
