import * as xlsx from 'xlsx';
import PDFDocument from 'pdfkit';
import { CVProfile } from './cv_parser';

export interface RankingResult {
  puesto: string;
  pesos: {
    skills: number;
    experiencia: number;
    formacion: number;
    idiomas: number;
    softSkills: number;
  };
  candidatos: {
    nombre: string;
    puntuacion: number;
    resumen: string;
    highlight: string;
    datos?: CVProfile;
  }[];
}

/**
 * 📊 GENERADOR DE INFORMES (EXCEL Y PDF)
 */
export class RankingGenerator {

  /**
   * Genera un Excel detallado con todos los candidatos y sus puntuaciones
   */
  static generateExcel(data: RankingResult): Buffer {
    const wb = xlsx.utils.book_new();
    
    // Preparar filas para el Excel
    const rows = data.candidatos.map((c, index) => ({
      'Ranking': index + 1,
      'Nombre': c.nombre,
      'Puntuación (0-100)': c.puntuacion,
      'Highlight': c.highlight,
      'Resumen': c.resumen,
      'Exp. Total (Años)': c.datos?.experienciaTotalAnos || 'N/A',
      'Último Cargo': c.datos?.ultimoCargo || 'N/A',
      'Skills': (c.datos?.habilidadesTecnicas || []).join(', '),
      'Idiomas': (c.datos?.idiomas || []).map(i => `${i.idioma} (${i.nivel})`).join(', ')
    }));

    const ws = xlsx.utils.json_to_sheet(rows);
    
    // Ajustar anchos de columna (aproximado)
    ws['!cols'] = [
      { wch: 8 }, { wch: 25 }, { wch: 15 }, { wch: 30 }, { wch: 50 },
      { wch: 15 }, { wch: 25 }, { wch: 40 }, { wch: 30 }
    ];

    xlsx.utils.book_append_sheet(wb, ws, 'Ranking RRHH');
    
    // Hoja secundaria con los pesos utilizados
    const weightsWs = xlsx.utils.json_to_sheet([
      { 'Criterio': 'Habilidades Técnicas', 'Peso %': data.pesos.skills },
      { 'Criterio': 'Experiencia', 'Peso %': data.pesos.experiencia },
      { 'Criterio': 'Formación', 'Peso %': data.pesos.formacion },
      { 'Criterio': 'Idiomas', 'Peso %': data.pesos.idiomas },
      { 'Criterio': 'Soft Skills', 'Peso %': data.pesos.softSkills }
    ]);
    xlsx.utils.book_append_sheet(wb, weightsWs, 'Configuración Pesos');

    return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  /**
   * Genera un PDF ejecutivo y visual (con pdfkit)
   */
  static async generatePDF(data: RankingResult): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];
      
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // --- CABECERA ---
      doc.fillColor('#2c3e50')
         .fontSize(22)
         .text('INFORME DE CRIBADO RRHH', { align: 'center' });
      
      doc.fontSize(14)
         .fillColor('#7f8c8d')
         .text(`Puesto: ${data.puesto}`, { align: 'center' })
         .moveDown(1.5);

      doc.moveTo(50, 110).lineTo(545, 110).stroke('#bdc3c7');
      doc.moveDown(1);

      // --- CONFIGURACIÓN DE PESOS ---
      doc.fillColor('#2c3e50').fontSize(12).text('Criterios de Evaluación Seleccionados:', { underline: true });
      doc.fontSize(10).fillColor('#34495e');
      doc.text(`• Skills: ${data.pesos.skills}% | Exp: ${data.pesos.experiencia}% | Formación: ${data.pesos.formacion}% | Idiomas: ${data.pesos.idiomas}% | Soft: ${data.pesos.softSkills}%`);
      doc.moveDown(2);

      // --- EL PODIO (TOP 3) ---
      doc.font('Helvetica-Bold')
         .fontSize(14)
         .fillColor('#c0392b')
         .text('🏆 TOP CANDIDATOS')
         .moveDown(0.5);
      
      doc.font('Helvetica');

      data.candidatos.slice(0, 3).forEach((c, i) => {
        const medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : '🥉');
        
        doc.rect(50, doc.y, 495, 60).fillAndStroke('#f9f9f9', '#ecf0f1');
        doc.fillColor('#2c3e50').fontSize(12).font('Helvetica-Bold').text(`${medal} ${c.nombre}`, 60, doc.y + 10);
        doc.font('Helvetica');
        doc.fillColor('#e67e22').fontSize(11).text(`${c.puntuacion}/100`, 480, doc.y - 12, { align: 'right' });
        doc.fillColor('#34495e').fontSize(10).text(c.highlight, 60, doc.y + 2);
        doc.moveDown(2.5);
      });

      // --- TABLA COMPLETA ---
      doc.fontSize(12).fillColor('#2c3e50').text('Listado Completo de Evaluación', 50, doc.y + 10, { underline: true }).moveDown(1);
      
      // Cabeceras tabla
      doc.fontSize(9).fillColor('#7f8c8d');
      doc.text('Rank', 50, doc.y);
      doc.text('Candidato', 100, doc.y - 9);
      doc.text('Puntos', 300, doc.y - 9);
      doc.text('Highlight', 360, doc.y - 9);
      doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).stroke('#ecf0f1');
      doc.moveDown(0.5);

      data.candidatos.forEach((c, i) => {
        if (doc.y > 750) doc.addPage();
        doc.fillColor('#34495e').fontSize(9);
        doc.text(`${i + 1}`, 50, doc.y);
        doc.text(c.nombre, 100, doc.y - 9);
        doc.text(`${c.puntuacion}`, 300, doc.y - 9);
        doc.text(c.highlight.substring(0, 45) + (c.highlight.length > 45 ? '...' : ''), 360, doc.y - 9);
        doc.moveDown(0.2);
      });

      doc.fillColor('#95a5a6').fontSize(8).text('Informe generado automáticamente por OLAWEE AI', 50, 780, { align: 'center' });

      doc.end();
    });
  }

  /**
   * 🏗️ QA HELPER: Genera un DOCX de prueba con N candidatos
   * (Requiere mammoth o similar para leer, pero aquí solo escribimos texto simple para simular)
   */
  static async generateTestCVsDocx(candidates: { nombre: string; experienciaTotalAnos: number }[]): Promise<Buffer> {
    // Para simplificar sin añadir dependencias de escritura DOCX complejas (como docx library),
    // vamos a devolver un Buffer de texto plano que mammoth pueda leer como si fuera un DOC sin formato,
    // o simplemente un archivo de texto que el DocumentService pueda procesar.
    // NOTA: El DocumentService de OLAWEE también acepta archivos de texto.
    
    let content = "=== ARCHIVO DE PRUEBA: 10 CANDIDATOS PARA OLAWEE ===\n\n";
    candidates.forEach((c, i) => {
      content += `CANDIDATO #${i+1}\n`;
      content += `Nombre: ${c.nombre}\n`;
      content += `Experiencia: ${c.experienciaTotalAnos} años en desarrollo de software.\n`;
      content += `Skills: React, TypeScript, Python, Node.js, SQL.\n`;
      content += `Formación: Grado en Ingeniería Informática.\n`;
      content += `Idiomas: Inglés B2, Español Nativo.\n`;
      content += `Resumen: Desarrollador apasionado con amplia experiencia en stacks modernos y resolución de problemas.\n\n`;
    });

    return Buffer.from(content, 'utf-8');
  }
}
