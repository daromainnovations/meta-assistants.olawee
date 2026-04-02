import * as xlsx from 'xlsx';

/**
 * 🔍 ANALIZADOR DE ESTRUCTURA XLSX (RADIO-X DE CELDAS)
 */
export async function getXlsxStructure(buffer: Buffer): Promise<{ id: string, text: string }[]> {
    try {
        const wb = xlsx.read(buffer, { type: 'buffer' });
        const blocks: { id: string, text: string }[] = [];
        
        // Escaneamos solo la primera hoja para no saturar al usuario
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        if (!ws) return [];

        const range = xlsx.utils.decode_range(ws['!ref'] || 'A1');
        // Limitamos a un área razonable (ej: primeras 50 filas) para la radiografía
        const maxR = Math.min(range.e.r, 50);
        const maxC = Math.min(range.e.c, 10);

        for (let r = 0; r <= maxR; r++) {
            for (let c = 0; c <= maxC; c++) {
                const cellAddress = xlsx.utils.encode_cell({ r, c });
                const cell = ws[cellAddress];
                if (cell && cell.v) {
                    const text = String(cell.v).trim();
                    if (text.length > 0) {
                        blocks.push({ id: cellAddress, text });
                    }
                }
            }
        }
        return blocks;
    } catch (error) {
        console.error('[XlsxFiller] ❌ Error estructura:', error);
        return [];
    }
}

/**
 * 📊 XLSX FILLER (EDICIÓN QUIRÚRGICA)
 */
export async function fillXlsxTemplate(buffer: Buffer, data: Record<string, any>): Promise<Buffer> {
    try {
        const wb = xlsx.read(buffer, { type: 'buffer', cellStyles: true });
        
        // NORMALIZACIÓN DE LLAVES
        const normalizedData: Record<string, any> = {};
        for (const [key, value] of Object.entries(data)) {
            normalizedData[key.trim().toUpperCase()] = value;
        }

        for (const sheetName of wb.SheetNames) {
            const ws = wb.Sheets[sheetName];
            const range = xlsx.utils.decode_range(ws['!ref'] || 'A1');

            for (let r = range.s.r; r <= range.e.r; r++) {
                for (let c = range.s.c; c <= range.e.c; c++) {
                    const cellAddress = xlsx.utils.encode_cell({ r, c });
                    const cell = ws[cellAddress];

                    if (cell) {
                        let val = String(cell.v || '');
                        let modified = false;

                        // --- 1. MATCH POR COORDENADA (Ej: B3) ---
                        if (normalizedData[cellAddress]) {
                            cell.v = String(normalizedData[cellAddress]);
                            cell.t = 's';
                            continue;
                        }

                        // --- 2. MATCH POR ETIQUETAS Y LITERALES ---
                        if (cell.t === 's') {
                            for (const [key, replacement] of Object.entries(normalizedData)) {
                                if (key.startsWith('ID_')) continue;

                                const patterns = [
                                    new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
                                    new RegExp(`\\{${key}\\}`, 'g')
                                ];

                                for (const pattern of patterns) {
                                    if (pattern.test(val)) {
                                        val = val.replace(pattern, String(replacement));
                                        modified = true;
                                    }
                                }

                                if (key.trim().length > 5 && val.includes(key)) {
                                    val = val.split(key).join(String(replacement));
                                    modified = true;
                                }
                            }

                            if (modified) {
                                cell.v = val;
                            }
                        }
                    }
                }
            }
        }

        return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    } catch (error: any) {
        console.error('[XlsxFiller] ❌ Error:', error.message);
        throw error;
    }
}
