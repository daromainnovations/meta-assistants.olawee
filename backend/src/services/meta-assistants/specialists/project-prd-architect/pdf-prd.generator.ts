import PDFDocument from 'pdfkit';

export interface PrdData {
    title: string;
    summary: string;
    vision: string;
    features: { module: string; description: string; priority: string }[];
    objectives: string[];
    architecture: string;
    risks: { risk: string; impact: string; mitigation: string }[];
    timeline: { phase: string; duration: string; description: string }[];
    resources: { role: string; count: string; notes: string }[];
    kpis: string[];
}

export class PrdPdfGenerator {
    async generate(data: PrdData): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            console.log(`[PrdPdfGenerator] Construyendo PRD PROFESIONAL PDF: '${data.title}'`);
            try {
                const doc = new PDFDocument({ margin: 50, size: 'A4' });
                const chunks: Buffer[] = [];

                doc.on('data', (chunk) => chunks.push(chunk));
                doc.on('end', () => resolve(Buffer.concat(chunks)));

                // Funciones de ayuda
                const checkPageBreak = (neededSpace: number) => {
                    if (doc.y + neededSpace > 750) {
                        doc.addPage();
                    }
                };

                const titleText = (text: string) => {
                    checkPageBreak(50);
                    doc.moveDown(1);
                    doc.fontSize(16).fillColor('#1e40af').font('Helvetica-Bold').text(text);
                    doc.moveDown(0.5);
                };

                const bodyText = (text: string) => {
                    doc.fontSize(11).fillColor('#374151').font('Helvetica').text(text, { align: 'justify', paragraphGap: 10 });
                };

                const bulletText = (text: string) => {
                    doc.fontSize(11).fillColor('#4b5563').font('Helvetica').text(`• ${text}`, { align: 'justify', indent: 15, paragraphGap: 5 });
                };

                // ---- PORTADA ----
                doc.moveDown(5);
                doc.fontSize(32).fillColor('#1f2937').font('Helvetica-Bold')
                   .text('Product Requirement Document', { align: 'center' });
                doc.moveDown(1);
                doc.fontSize(22).fillColor('#4f46e5')
                   .text(data.title, { align: 'center' });
                doc.moveDown(2);
                doc.fontSize(12).fillColor('#6b7280').font('Helvetica').text(`Generado por OLAWEE Project-PRD-Architect`, { align: 'center' });
                doc.text(`Fecha: ${new Date().toLocaleDateString()}`, { align: 'center' });
                
                doc.addPage();

                // ---- 1. RESUMEN EJECUTIVO Y VISIÓN ----
                titleText('1. Resumen Ejecutivo y Visión');
                bodyText(data.summary);
                doc.moveDown(0.5);
                doc.fontSize(12).fillColor('#111827').font('Helvetica-Bold').text('Visión del Producto:');
                bodyText(data.vision);

                // ---- 2. OBJETIVOS PRINCIPALES ----
                titleText('2. Objetivos de Negocio y Producto');
                data.objectives.forEach(obj => bulletText(obj));

                // ---- 3. ALCANCE Y FUNCIONALIDADES (FEATURES) ----
                titleText('3. Alcance y Funcionalidades Principales');
                data.features.forEach(f => {
                    checkPageBreak(60);
                    doc.fontSize(12).fillColor('#111827').font('Helvetica-Bold').text(`Módulo: ${f.module} [Prioridad: ${f.priority}]`);
                    doc.fontSize(11).fillColor('#4b5563').font('Helvetica').text(f.description, { indent: 15, paragraphGap: 10, align: 'justify' });
                });

                // ---- 4. ARQUITECTURA PROPUESTA ----
                titleText('4. Arquitectura y Stack Tecnológico');
                bodyText(data.architecture);

                // ---- 5. RIESGOS Y MITIGACIONES ----
                titleText('5. Matriz de Riesgos y Dependencias');
                data.risks.forEach(r => {
                    checkPageBreak(70);
                    doc.fontSize(11).fillColor('#b91c1c').font('Helvetica-Bold').text(`⚠️ Riesgo: ${r.risk}`);
                    doc.fontSize(10).fillColor('#374151').font('Helvetica-Oblique').text(`Impacto/Razón: ${r.impact}`, { indent: 15 });
                    doc.fontSize(10).fillColor('#047857').font('Helvetica').text(`Solución / Mitigación: ${r.mitigation}`, { indent: 15, paragraphGap: 10 });
                });

                // ---- 6. ESTIMACIÓN DE TIEMPOS (TABLA) ----
                titleText('6. Roadmap y Tiempos de Desarrollo');
                
                // Header Tabla Tiempos
                checkPageBreak(100);
                let startY = doc.y;
                doc.fontSize(10).fillColor('#111827').font('Helvetica-Bold');
                doc.text('Fase', 50, startY);
                doc.text('Duración', 180, startY);
                doc.text('Descripción / Hitos', 280, startY);
                doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(50, startY + 12).lineTo(545, startY + 12).stroke();
                
                doc.font('Helvetica').fillColor('#4b5563');
                let rowY = startY + 20;
                
                data.timeline.forEach((item) => {
                    // Check if row exceeds page
                    if (rowY > 750) {
                        doc.addPage();
                        rowY = 50;
                    }
                    doc.text(item.phase, 50, rowY, { width: 120 });
                    doc.text(item.duration, 180, rowY, { width: 90 });
                    doc.text(item.description, 280, rowY, { width: 260 });
                    
                    // Actualizar Y a la línea más baja de las 3 columnas
                    rowY = doc.y + 10;
                    doc.strokeColor('#f3f4f6').lineWidth(1).moveTo(50, rowY - 5).lineTo(545, rowY - 5).stroke();
                });
                // Restauramos el X e Y por defecto del documento tras la tabla
                doc.x = 50;
                doc.y = rowY + 20;

                // ---- 7. RECURSOS NECESARIOS (TABLA) ----
                titleText('7. Equipo Técnico y Recursos Necesarios');
                
                checkPageBreak(100);
                startY = doc.y;
                doc.fontSize(10).fillColor('#111827').font('Helvetica-Bold');
                doc.text('Rol / Recurso', 50, startY);
                doc.text('Cantidad', 180, startY);
                doc.text('Funciones y Notas', 280, startY);
                doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(50, startY + 12).lineTo(545, startY + 12).stroke();
                
                doc.font('Helvetica').fillColor('#4b5563');
                rowY = startY + 20;
                
                data.resources.forEach((item) => {
                    if (rowY > 750) {
                        doc.addPage();
                        rowY = 50;
                    }
                    doc.text(item.role, 50, rowY, { width: 120 });
                    doc.text(item.count, 180, rowY, { width: 90 });
                    doc.text(item.notes, 280, rowY, { width: 260 });
                    
                    rowY = doc.y + 10;
                    doc.strokeColor('#f3f4f6').lineWidth(1).moveTo(50, rowY - 5).lineTo(545, rowY - 5).stroke();
                });
                doc.x = 50;
                doc.y = rowY + 20;

                // ---- 8. KPIs DE ÉXITO ----
                titleText('8. Métricas de Éxito y KPIs');
                data.kpis.forEach(kpi => {
                    doc.fontSize(11).fillColor('#059669').font('Helvetica-Bold').text(`★ ${kpi}`, { indent: 10, paragraphGap: 5 });
                });

                doc.end();

            } catch (err) {
                console.error('[PrdPdfGenerator] Error:', err);
                reject(err);
            }
        });
    }
}

export const prdPdfGenerator = new PrdPdfGenerator();
