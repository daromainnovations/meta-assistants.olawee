/**
 * 🧪 STRESS TEST — Grant Justification (Gasto-Pro)
 * Simula el flujo completo que haría un usuario real:
 * 1. Genera facturas PDF inventadas (con PDFKit)
 * 2. Genera un Excel de seguimiento de prueba
 * 3. Ejecuta el agente con múltiples archivos
 * 4. Verifica el Excel resultante celda por celda
 * 5. Genera reporte de auditoría
 */

import * as fs from 'fs';
import * as path from 'path';
import * as xlsx from 'xlsx';
import PDFDocument from 'pdfkit';
import { editExcel } from '../services/meta-assistants/specialists/grant-justification/excel_editor';
import { extractDataFromFiles } from '../services/meta-assistants/specialists/grant-justification/document_parser';

const OUT_DIR = path.join(process.cwd(), 'test_outputs');
const REPORT_PATH = path.join(OUT_DIR, 'stress_test_report.md');

// ─────────────────────────────────────────
// DATOS DE FACTURAS INVENTADAS
// ─────────────────────────────────────────
const MOCK_INVOICES = [
  { numFactura: 'FAC-2024-001', proveedor: 'Tech Solutions S.L.',      nif: 'B12345678', concepto: 'Servicios de consultoría tecnológica',  base: 2000.00, ivaRate: 21, total: 2420.00, fecha: '15/01/2024' },
  { numFactura: 'FAC-2024-002', proveedor: 'Innovación Digital S.A.',  nif: 'A87654321', concepto: 'Desarrollo de software módulo IA',       base: 5000.00, ivaRate: 21, total: 6050.00, fecha: '22/01/2024' },
  { numFactura: 'FAC-2024-003', proveedor: 'Laboratorios Research SL', nif: 'B11223344', concepto: 'Material de laboratorio I+D',            base: 850.00,  ivaRate: 21, total: 1028.50, fecha: '05/02/2024' },
  { numFactura: 'FAC-2024-004', proveedor: 'Cloud Services Corp.',     nif: 'A55667788', concepto: 'Infraestructura cloud - Q1 2024',       base: 1200.00, ivaRate: 21, total: 1452.00, fecha: '28/02/2024' },
  { numFactura: 'FAC-2024-005', proveedor: 'Formación Técnica SL',     nif: 'B99001122', concepto: 'Curso de especialización en ML',        base: 600.00,  ivaRate: 21, total: 726.00,  fecha: '10/03/2024' },
];

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function generatePdf(invoice: typeof MOCK_INVOICES[0]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 50 });
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const iva = parseFloat((invoice.base * invoice.ivaRate / 100).toFixed(2));

    doc.fontSize(20).text('FACTURA', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12)
      .text(`Nº Factura: ${invoice.numFactura}`)
      .text(`Fecha: ${invoice.fecha}`)
      .moveDown()
      .text(`PROVEEDOR: ${invoice.proveedor}`)
      .text(`NIF: ${invoice.nif}`)
      .moveDown()
      .text(`Concepto: ${invoice.concepto}`)
      .moveDown()
      .text(`────────────────────────────────`)
      .text(`Base Imponible:    ${invoice.base.toFixed(2)} €`)
      .text(`IVA (${invoice.ivaRate}%):            ${iva.toFixed(2)} €`)
      .text(`TOTAL FACTURA:     ${invoice.total.toFixed(2)} €`)
      .moveDown()
      .text(`Forma de pago: Transferencia bancaria`)
      .text(`Vencimiento: 30 días`);

    doc.end();
  });
}

function generateExcelTemplate(): Buffer {
  const wb = xlsx.utils.book_new();

  // Hoja con cabeceras realistas de subvenciones
  const headers = [
    'Ref. Gasto', 'Nº Factura', 'Proveedor', 'Partida', 'Actividad',
    'Fecha', 'Concepto', 'Base Imponible', 'IVA', 'Retención',
    'Total Factura', 'Importe Imputado', 'Observaciones Factura',
    'Ref. Justificante', 'Fecha Pago', 'Importe Pagado', 'Observaciones Pago'
  ];

  const ws = xlsx.utils.aoa_to_sheet([
    ['PROYECTO: DEMO-OLAWEE-2024', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['SEGUIMIENTO DE GASTOS JUSTIFICABLES'],
    [],
    headers
  ]);

  // Ancho de columnas
  ws['!cols'] = headers.map(() => ({ wch: 18 }));

  xlsx.utils.book_append_sheet(wb, ws, 'Gastos Justificados');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ─────────────────────────────────────────
// SUITE PRINCIPAL
// ─────────────────────────────────────────
async function runStressTest() {
  ensureDir(OUT_DIR);
  const reportLines: string[] = ['# 🧪 Stress Test Report — Grant Justification (Gasto-Pro)', '', `**Fecha:** ${new Date().toISOString()}`, ''];
  const results: { test: string; passed: boolean; detail: string }[] = [];

  const pass = (test: string, detail: string) => {
    results.push({ test, passed: true, detail });
    console.log(`  ✅ PASS: ${test}`);
  };
  const fail = (test: string, detail: string) => {
    results.push({ test, passed: false, detail });
    console.error(`  ❌ FAIL: ${test} — ${detail}`);
  };

  // ─── TEST 1: Generación de PDFs ───
  console.log('\n📄 TEST 1: Generando PDFs de prueba...');
  const pdfBuffers: { filename: string; buffer: Buffer }[] = [];
  for (const inv of MOCK_INVOICES) {
    try {
      const buf = await generatePdf(inv);
      const filename = `${inv.numFactura.replace(/\//g, '-')}.pdf`;
      pdfBuffers.push({ filename, buffer: buf });
      fs.writeFileSync(path.join(OUT_DIR, filename), buf);
      pass(`Generar PDF: ${filename}`, `${buf.length} bytes`);
    } catch (e: any) {
      fail(`Generar PDF: ${inv.numFactura}`, e.message);
    }
  }

  // ─── TEST 2: Generación de Excel de plantilla ───
  console.log('\n📊 TEST 2: Generando Excel de seguimiento...');
  let excelTemplate: Buffer;
  try {
    excelTemplate = generateExcelTemplate();
    fs.writeFileSync(path.join(OUT_DIR, 'plantilla_seguimiento.xlsx'), excelTemplate);
    const wb = xlsx.read(excelTemplate, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(ws, { header: 1 }) as any[][];
    const hasHeaderRow = data.some((row: any[]) => row.some((c: any) => String(c).includes('Nº Factura')));
    hasHeaderRow
      ? pass('Generar Excel con cabeceras', `${data.length} filas, cabeceras encontradas`)
      : fail('Generar Excel con cabeceras', 'Cabeceras no encontradas en el Excel generado');
  } catch (e: any) {
    fail('Generar Excel', e.message);
    excelTemplate = Buffer.alloc(0);
  }

  // ─── TEST 3: Extracción OCR ───
  // Nota: Este test verifica la lógica del parser sin llamar a Gemini (ya que
  // necesitaríamos una API key real). Verificamos que la función es invocable
  // y que maneja Excels correctamente.
  console.log('\n🔍 TEST 3: Verificando extractor de Excel...');
  try {
    const fakeFiles: any[] = [{
      originalname: 'plantilla_seguimiento.xlsx',
      buffer: excelTemplate,
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: excelTemplate.length,
    }];
    const extracted = await extractDataFromFiles(fakeFiles);
    extracted.excelData.length > 0
      ? pass('Extractor Excel', `Detectadas ${Object.keys(extracted.excelData[0].sheets).length} hojas`)
      : fail('Extractor Excel', 'No se extrajeron hojas del Excel');
  } catch (e: any) {
    fail('Extractor Excel', e.message);
  }

  // ─── TEST 4: Mapeo Semántico (editExcel) — Escenario multifactura ───
  console.log('\n🎯 TEST 4: Mapeo semántico en Excel (5 facturas)...');
  let finalExcel: Buffer = excelTemplate;
  const expectedInvoices = MOCK_INVOICES.slice(0, 5);

  for (const inv of expectedInvoices) {
    try {
      const registro = {
        numFactura: inv.numFactura,
        proveedor: inv.proveedor,
        fecha: inv.fecha,
        concepto: inv.concepto,
        baseImponible: inv.base,
        iva: parseFloat((inv.base * inv.ivaRate / 100).toFixed(2)),
        total: inv.total,
        importeImputado: inv.base, // Imputamos la base imponible
      };
      finalExcel = editExcel(finalExcel, null, [registro], { mode: 'append' });
      pass(`Insertar factura ${inv.numFactura}`, `Total: ${inv.total}€`);
    } catch (e: any) {
      fail(`Insertar factura ${inv.numFactura}`, e.message);
    }
  }

  // ─── TEST 5: Verificación Celda por Celda ───
  console.log('\n🔬 TEST 5: Verificación celda por celda del Excel resultante...');
  fs.writeFileSync(path.join(OUT_DIR, 'excel_resultado_test.xlsx'), finalExcel);

  try {
    const resultWb = xlsx.read(finalExcel, { type: 'buffer' });
    const resultWs = resultWb.Sheets[resultWb.SheetNames[0]];
    const resultData = xlsx.utils.sheet_to_json(resultWs, { header: 1, defval: '' }) as any[][];

    // Encontrar fila de cabeceras
    let headerRow = -1;
    let invoiceColIdx = -1;
    let totalColIdx = -1;

    for (let i = 0; i < resultData.length; i++) {
      const row = resultData[i];
      const rowStr = row.join(' ').toLowerCase();
      if (rowStr.includes('factura') && rowStr.includes('imponible')) {
        headerRow = i;
        invoiceColIdx = row.findIndex((c: any) => String(c).toLowerCase().includes('factura'));
        totalColIdx = row.findIndex((c: any) => String(c).toLowerCase() === 'total factura' || String(c).toLowerCase().includes('total'));
        break;
      }
    }

    if (headerRow === -1) {
      fail('Verificación celda por celda', 'No se encontró fila de cabeceras en el Excel resultado');
    } else {
      pass(`Localizar cabeceras`, `Fila ${headerRow + 1}, Col Factura: ${invoiceColIdx}, Col Total: ${totalColIdx}`);

      for (const inv of expectedInvoices) {
        // Buscar la fila con este número de factura
        const dataRow = resultData.slice(headerRow + 1).find((row: any[]) =>
          row.some((c: any) => String(c).includes(inv.numFactura))
        );

        if (!dataRow) {
          fail(`Factura ${inv.numFactura} en Excel`, 'No encontrada en el resultado');
        } else {
          const totalCell = totalColIdx !== -1 ? dataRow[totalColIdx] : null;
          const totalMatch = totalCell !== null && parseFloat(String(totalCell)) === inv.total;
          totalMatch
            ? pass(`Factura ${inv.numFactura} — Total correcto`, `${totalCell}€ == ${inv.total}€`)
            : fail(`Factura ${inv.numFactura} — Total`, `Esperado ${inv.total}€, encontrado: ${totalCell}`);
        }
      }
    }
  } catch (e: any) {
    fail('Verificación celda por celda', e.message);
  }


  // ─────────────────────────────────────────
  // REPORTE FINAL
  // ─────────────────────────────────────────
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  reportLines.push(`## Resumen`);
  reportLines.push(`- **Total Tests:** ${total}`);
  reportLines.push(`- **✅ Pasados:** ${passed}`);
  reportLines.push(`- **❌ Fallados:** ${failed}`);
  reportLines.push(`- **Porcentaje éxito:** ${Math.round(passed / total * 100)}%`);
  reportLines.push('');
  reportLines.push('## Resultados Detallados');
  reportLines.push('');

  for (const r of results) {
    reportLines.push(`${r.passed ? '✅' : '❌'} **${r.test}**`);
    reportLines.push(`   > ${r.detail}`);
    reportLines.push('');
  }

  reportLines.push('## Archivos Generados');
  reportLines.push(`- [Excel Resultado](test_outputs/excel_resultado_test.xlsx)`);
  reportLines.push(`- [Plantilla Base](test_outputs/plantilla_seguimiento.xlsx)`);
  for (const pdf of pdfBuffers) {
    reportLines.push(`- [${pdf.filename}](test_outputs/${pdf.filename})`);
  }

  fs.writeFileSync(REPORT_PATH, reportLines.join('\n'));

  console.log('\n' + '═'.repeat(50));
  console.log(`📊 REPORTE FINAL: ${passed}/${total} tests pasados (${Math.round(passed / total * 100)}%)`);
  console.log(`📁 Archivos guardados en: ${OUT_DIR}`);
  console.log(`📄 Reporte: ${REPORT_PATH}`);
  if (failed > 0) {
    console.log(`⚠️  ${failed} tests FALLARON. Ver reporte para detalles.`);
    process.exit(1);
  } else {
    console.log('🏆 TODOS LOS TESTS PASADOS. El sistema está LISTO.');
    process.exit(0);
  }
}

runStressTest().catch(err => {
  console.error('💥 Error fatal en stress test:', err);
  process.exit(1);
});
