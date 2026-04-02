import * as xlsx from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================
// 📚 DICCIONARIO SEMÁNTICO DE SUBVENCIONES
// Mapea los campos lógicos a posibles nombres de columna en Excel.
// ============================================================
const SEMANTIC_MAP: Record<string, string[]> = {
  refGasto:            ['ref', 'ref.', 'referencia', 'ref gasto', 'código', 'cod', 'id'],
  numFactura:          ['nº factura', 'num factura', 'factura', 'nº doc', 'num doc', 'documento', 'referencia factura', 'justificante', 'nº justificante'],
  proveedor:           ['proveedor', 'empresa', 'emisor', 'razón social', 'razon social', 'nombre proveedor', 'acreedor'],
  partida:             ['partida', 'partida presupuestaria', 'capítulo', 'capitulo', 'concepto presup', 'línea presup'],
  actividad:           ['actividad', 'acción', 'subproyecto', 'paquete trabajo', 'wp'],
  fecha:               ['fecha', 'fecha factura', 'fecha emision', 'fecha emisión', 'f. factura', 'fecha doc'],
  concepto:            ['concepto', 'descripción', 'descripcion', 'detalle', 'objeto', 'servicio', 'bien'],
  baseImponible:       ['base imponible', 'base', 'importe base', 'importe neto', 'neto', 'subtotal', 'bi'],
  iva:                 ['iva', 'iva (euros)', 'iva €', 'imp. iva', 'importe iva', '% iva', 'cuota iva'],
  retencion:           ['retención', 'retencion', 'irpf', '% retención', 'retención irpf'],
  total:               ['total', 'importe total', 'total factura', 'total €', 'imp. total', 'total bruto'],
  importeImputado:     ['importe imputado', 'imputado', 'importe subv', 'importe subvencionable', 'importe justificado'],
  observacionesFactura:['observaciones', 'obs', 'notas factura', 'comentarios', 'notas'],
  refJustificante:     ['ref justificante', 'justificante pago', 'ref pago', 'nº transferencia', 'ref transf'],
  fechaPago:           ['fecha pago', 'f. pago', 'fecha transferencia', 'fecha abono'],
  importePagado:       ['importe pagado', 'pagado', 'importe abonado', 'abonado'],
  observacionesPago:   ['observaciones pago', 'obs pago', 'notas pago'],
};

const DEBUG_LOG = path.join(process.cwd(), 'justification_debug.log');

function writeLog(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(DEBUG_LOG, line); } catch {}
  console.log(`[ExcelEditor] ${msg}`);
}

/**
 * Encuentra el índice de columna para un campo lógico usando el diccionario semántico.
 * Devuelve el índice y la puntuación de confianza del match.
 */
function findColumnIndex(headers: string[], fieldKey: string): { index: number; matchedHeader: string; score: number } {
  const synonyms = SEMANTIC_MAP[fieldKey] || [fieldKey];
  let bestMatch = { index: -1, matchedHeader: '', score: 0 };

  headers.forEach((h, i) => {
    const normalizedH = h.toLowerCase().trim().replace(/[_\-\.]/g, ' ');
    for (const synonym of synonyms) {
      const normalizedS = synonym.toLowerCase().trim();
      // Match exacto = mayor puntuación
      if (normalizedH === normalizedS) {
        if (10 > bestMatch.score) bestMatch = { index: i, matchedHeader: h, score: 10 };
      }
      // Match parcial bidireccional
      else if (normalizedH.includes(normalizedS) || normalizedS.includes(normalizedH)) {
        const score = normalizedS.length / Math.max(normalizedH.length, normalizedS.length) * 8;
        if (score > bestMatch.score) bestMatch = { index: i, matchedHeader: h, score };
      }
    }
  });

  return bestMatch;
}

/**
 * Motor de Edición Robusto de Excel (Mapeo Semántico + Preservación de Estilos)
 */
export function editExcel(
  templateBuffer: Buffer,
  sheetName: string | null,
  newRows: any[],
  insertionOptions?: { mode: 'append' | 'after_value' | 'at_index', value?: any }
): Buffer {
  // Limpiar log de esta ejecución
  writeLog(`--- INICIO EDICIÓN EXCEL ---`);
  writeLog(`Filas a insertar: ${newRows.length} | Modo: ${insertionOptions?.mode || 'append'}`);

  // 1. Cargar el libro
  const wb = xlsx.read(templateBuffer, { type: 'buffer', cellStyles: true, bookVBA: true });

  // 2. Localizar hoja objetivo (con detección inteligente)
  let targetSheetName = sheetName;
  const names = wb.SheetNames;

  if (!targetSheetName || !wb.Sheets[targetSheetName]) {
    targetSheetName = names.find(n =>
      n.toLowerCase().includes('gasto') ||
      n.toLowerCase().includes('anexo 2') ||
      n.toLowerCase().includes('justificante') ||
      n.toLowerCase().includes('anexo 3') ||
      n.toLowerCase().includes('factura') ||
      n.toLowerCase().includes('registro')
    ) || names[0];
  }

  writeLog(`Hoja objetivo: "${targetSheetName}"`);
  const ws = wb.Sheets[targetSheetName];

  // 3. DETECTAR CABECERAS con búsqueda inteligente (primeras 15 filas)
  const aoa = xlsx.utils.sheet_to_json(ws, { header: 1, range: 0, defval: '' }) as any[][];

  let headerRowIndex = -1;
  // Buscar la fila con más matches semánticos
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    const row = aoa[i];
    const rowStr = row.map((c: any) => String(c).toLowerCase()).join(' ');
    const matches = ['factura', 'proveedor', 'importe', 'base', 'fecha', 'concepto', 'total', 'gasto']
      .filter(kw => rowStr.includes(kw)).length;
    if (matches >= 2) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    writeLog(`⚠️ No se detectaron cabeceras estándar. Usando fila 0.`);
    headerRowIndex = 0;
  }

  const headers = aoa[headerRowIndex].map((h: any) => String(h).trim());
  writeLog(`Cabeceras detectadas en fila ${headerRowIndex + 1}: [${headers.join(' | ')}]`);

  // 4. PREPARAR FILAS con Mapeo Semántico
  const rowsToInsert: any[][] = [];

  for (const rawRow of newRows) {
    const rowArray = new Array(headers.length).fill('');
    writeLog(`--- Mapeando fila: ${JSON.stringify(rawRow)}`);

    for (const [key, value] of Object.entries(rawRow)) {
      if (value === null || value === undefined || value === '') continue;

      const match = findColumnIndex(headers, key);

      if (match.index !== -1) {
        rowArray[match.index] = value;
        writeLog(`  ✅ "${key}" → Col ${match.index} ("${match.matchedHeader}") [score: ${match.score.toFixed(1)}]`);
      } else {
        writeLog(`  ⚠️ "${key}" = "${value}" → SIN COLUMNA (se descarta)`);
      }
    }

    rowsToInsert.push(rowArray);
  }

  // 5. DETERMINAR PUNTO DE INSERCIÓN (protegiendo filas de totales/firmas)
  const range = xlsx.utils.decode_range(ws['!ref'] || 'A1');
  let insertionPoint = headerRowIndex + 1;

  if (insertionOptions?.mode === 'after_value' && insertionOptions.value) {
    writeLog(`Buscando valor de referencia: "${insertionOptions.value}"`);
    for (let r = headerRowIndex; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[xlsx.utils.encode_cell({ r, c })];
        if (cell && String(cell.v).includes(String(insertionOptions.value))) {
          insertionPoint = r + 1;
          writeLog(`  📍 Encontrado en fila ${r + 1}. Insertando tras ella.`);
          break;
        }
      }
      if (insertionPoint > headerRowIndex + 1) break;
    }
  } else if (insertionOptions?.mode === 'at_index') {
    insertionPoint = Number(insertionOptions.value);
  } else {
    // MODO APPEND: buscar última fila con datos, pero evitar filas de totales/firmas
    let lastDataRow = headerRowIndex;
    for (let r = range.e.r; r > headerRowIndex; r--) {
      let hasData = false;
      let isFooterRow = false;

      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[xlsx.utils.encode_cell({ r, c })];
        if (cell && cell.v !== undefined && cell.v !== '') {
          const cellStr = String(cell.v).toLowerCase();
          // Detectar filas de pie (totales, firmas, etc.)
          if (['total', 'firma', 'sello', 'observaciones generales', 'subtotal'].some(kw => cellStr.includes(kw))) {
            isFooterRow = true;
          }
          hasData = true;
        }
      }

      if (hasData && !isFooterRow) {
        lastDataRow = r;
        break;
      }
    }
    insertionPoint = lastDataRow + 1;
  }

  writeLog(`Punto de inserción: fila ${insertionPoint + 1} (base 1)`);

  // 6. INSERTAR FILAS
  if (insertionPoint <= range.e.r) {
    // Desplazar filas existentes hacia abajo
    const tailAoa = xlsx.utils.sheet_to_json(ws, {
      header: 1,
      range: { s: { r: insertionPoint, c: range.s.c }, e: range.e }
    }) as any[][];
    xlsx.utils.sheet_add_aoa(ws, tailAoa, { origin: insertionPoint + rowsToInsert.length });
  }

  xlsx.utils.sheet_add_aoa(ws, rowsToInsert, { origin: insertionPoint });

  // 7. Actualizar rango
  const newRange = {
    s: range.s,
    e: {
      r: Math.max(range.e.r + rowsToInsert.length, insertionPoint + rowsToInsert.length),
      c: range.e.c
    }
  };
  ws['!ref'] = xlsx.utils.encode_range(newRange);

  writeLog(`--- FIN EDICIÓN EXCEL ✅ ---`);
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
