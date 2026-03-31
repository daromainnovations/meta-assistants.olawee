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
exports.editExcel = editExcel;
const xlsx = __importStar(require("xlsx"));
/**
 * Motor de Edición Robusto de Excel (Mapeo de Columnas y Preservación de Estilos)
 */
function editExcel(templateBuffer, sheetName, newRows, insertionOptions) {
    // 1. Cargar el libro original
    const wb = xlsx.read(templateBuffer, { type: 'buffer', cellStyles: true, bookVBA: true });
    // 2. Localizar la hoja objetivo
    let targetSheetName = sheetName;
    const names = wb.SheetNames;
    if (!targetSheetName || !wb.Sheets[targetSheetName]) {
        targetSheetName = names.find(n => n.toLowerCase().includes('gasto') ||
            n.toLowerCase().includes('anexo 2') ||
            n.toLowerCase().includes('justificante') ||
            n.toLowerCase().includes('anexo 3')) || names[0];
    }
    console.log(`[ExcelEditor] 📝 Editando hoja detectada: "${targetSheetName}"`);
    const ws = wb.Sheets[targetSheetName];
    // 3. DETECTAR CABECERAS Y MAPEAR COLUMNAS
    const aoa = xlsx.utils.sheet_to_json(ws, { header: 1, range: 0, defval: '' });
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(aoa.length, 10); i++) {
        const row = aoa[i];
        if (row.some(cell => String(cell).toLowerCase().includes('factura') || String(cell).toLowerCase().includes('proveedor') || String(cell).toLowerCase().includes('importe'))) {
            headerRowIndex = i;
            break;
        }
    }
    const headers = aoa[headerRowIndex].map(h => String(h).trim());
    console.log(`[ExcelEditor] 🚩 Cabeceras detectadas en la fila ${headerRowIndex + 1}:`, headers);
    // 4. PREPARAR FILAS (Mapeo de JSON Keys -> Header Indices)
    const rowsToInsert = [];
    for (const rawRow of newRows) {
        const rowArray = new Array(headers.length).fill('');
        console.log(`[ExcelEditor] 🛠️ Mapeando fila:`, rawRow);
        for (const [key, value] of Object.entries(rawRow)) {
            const cleanKey = String(key).trim();
            const lowerKey = cleanKey.toLowerCase();
            let colIndex = headers.findIndex(h => {
                const cleanH = h.toLowerCase();
                return cleanH === lowerKey ||
                    cleanH.includes(lowerKey) ||
                    lowerKey.includes(cleanH) ||
                    (cleanH.includes('factura') && lowerKey.includes('factura')) ||
                    (cleanH.includes('proveedor') && lowerKey.includes('proveedor')) ||
                    (cleanH.includes('gasto') && lowerKey.includes('gasto'));
            });
            if (colIndex === -1 && cleanKey.startsWith('__EMPTY')) {
                const parts = cleanKey.split('_');
                if (parts.length === 1)
                    colIndex = 1;
                else {
                    const idx = parseInt(parts[parts.length - 1]);
                    if (!isNaN(idx))
                        colIndex = idx + 1;
                }
                if (colIndex >= headers.length)
                    colIndex = -1;
            }
            if (colIndex !== -1) {
                rowArray[colIndex] = value;
                console.log(`   ✅ "${key}" -> Col ${colIndex} ("${headers[colIndex] || 'Columna sin nombre'}")`);
            }
            else {
                console.warn(`   ⚠️ No se encontró columna para la llave: "${key}"`);
            }
        }
        rowsToInsert.push(rowArray);
    }
    // 5. DETERMINAR PUNTO DE INSERCIÓN (MODO AVANZADO)
    let insertionPoint = headerRowIndex + 1;
    const range = xlsx.utils.decode_range(ws['!ref'] || 'A1');
    if (insertionOptions && insertionOptions.mode === 'after_value') {
        console.log(`[ExcelEditor] 🔍 Buscando valor de referencia: "${insertionOptions.value}"...`);
        for (let r = headerRowIndex; r <= range.e.r; r++) {
            for (let c = range.s.c; c <= range.e.c; c++) {
                const cell = ws[xlsx.utils.encode_cell({ r, c })];
                if (cell && String(cell.v).includes(String(insertionOptions.value))) {
                    insertionPoint = r + 1;
                    console.log(`   📍 Encontrado en fila ${r + 1}. Insertando después (fila ${insertionPoint + 1}).`);
                    break;
                }
            }
            if (insertionPoint > headerRowIndex + 1)
                break;
        }
    }
    else if (insertionOptions && insertionOptions.mode === 'at_index') {
        insertionPoint = insertionOptions.value;
    }
    else {
        let lastDataRow = headerRowIndex;
        for (let r = range.e.r; r > headerRowIndex; r--) {
            let hasData = false;
            for (let c = range.s.c; c <= range.e.c; c++) {
                const cell = ws[xlsx.utils.encode_cell({ r, c })];
                if (cell && cell.v !== undefined && cell.v !== '') {
                    hasData = true;
                    break;
                }
            }
            if (hasData) {
                lastDataRow = r;
                break;
            }
        }
        insertionPoint = lastDataRow + 1;
    }
    console.log(`[ExcelEditor] 📥 Inserción en fila ${insertionPoint + 1} (Modo: ${insertionOptions?.mode || 'append'})`);
    // 6. DESPLAZAR FILAS (SI NO ES EL FINAL)
    if (insertionPoint < range.e.r) {
        console.log(`[ExcelEditor] 🔄 Desplazando ${range.e.r - insertionPoint + 1} filas hacia abajo...`);
        const tailAoa = xlsx.utils.sheet_to_json(ws, {
            header: 1,
            range: { s: { r: insertionPoint, c: range.s.c }, e: range.e }
        });
        xlsx.utils.sheet_add_aoa(ws, tailAoa, { origin: insertionPoint + rowsToInsert.length });
    }
    // 7. INSERTAR NUEVOS DATOS
    xlsx.utils.sheet_add_aoa(ws, rowsToInsert, { origin: insertionPoint });
    // 8. Actualizar rango
    const newRange = {
        s: range.s,
        e: {
            r: Math.max(range.e.r, insertionPoint + rowsToInsert.length + (range.e.r - insertionPoint)),
            c: range.e.c
        }
    };
    ws['!ref'] = xlsx.utils.encode_range(newRange);
    return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
