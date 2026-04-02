// Test directo del modo update_row
import * as fs from 'fs';
import * as xlsx from 'xlsx';
import { editExcel } from '../services/meta-assistants/specialists/grant-justification/excel_editor';

const buf = fs.readFileSync('test_outputs/excel_resultado_test.xlsx');

// Simular: "cambiar FAC-2024-003 → total: 999.9" (equivalente al G63 real)
const result = editExcel(buf, null, [{ total: 999.9 }], { mode: 'update_row', value: 'FAC-2024-003' });
fs.writeFileSync('test_outputs/excel_update_row_test.xlsx', result);

// Verificar resultado
const wb = xlsx.read(result, { type: 'buffer' });
const ws = wb.Sheets[wb.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];

const headerRow = data[3] as string[];
const totalIdx = headerRow.findIndex((h: string) => String(h).toLowerCase().includes('total factura'));
const targetRow = data.find(r => r.some((c: any) => String(c).includes('FAC-2024-003'))) as any[];

console.log('\n=== TEST UPDATE_ROW ===');
console.log('Fila encontrada:', JSON.stringify(targetRow));
console.log(`Total Factura (col ${totalIdx}):`, targetRow?.[totalIdx]);

const passed = targetRow && parseFloat(String(targetRow[totalIdx])) === 999.9;
console.log(passed ? '✅ UPDATE_ROW CORRECTO: 999.9' : `❌ FALLO: esperado 999.9, obtenido ${targetRow?.[totalIdx]}`);

// También verificar que otras facturas no se tocaron
const fac001Row = data.find(r => r.some((c: any) => String(c).includes('FAC-2024-001'))) as any[];
const original001Total = fac001Row?.[totalIdx];
console.log(`\nFAC-2024-001 total sin cambios: ${original001Total} (esperado 2420) ${original001Total == 2420 ? '✅' : '❌'}`);

process.exit(passed ? 0 : 1);
