import * as xlsx from 'xlsx';

export class ExcelGenerator {
    /**
     * Genera un archivo XLSX a partir de datos estructurados en memoria (array de objetos).
     */
    async generate(data: Record<string, any>[], sheetName: string = 'Datos'): Promise<Buffer> {
        console.log(`[ExcelGenerator] Construyendo Excel en RAM. Total filas: ${data.length}`);

        // 1. Crear un 'libro de trabajo' (Workbook) virtual
        const wb = xlsx.utils.book_new();

        // 2. Transforma el Array de JSON a una Hoja (Worksheet)
        const ws = xlsx.utils.json_to_sheet(data);

        // 3. Añade la Hoja al Libro
        xlsx.utils.book_append_sheet(wb, ws, sheetName);

        // 4. Exporta el libro a un Buffer de memoria en lugar de a disco
        const fileBuffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

        return fileBuffer;
    }
}

export const excelGenerator = new ExcelGenerator();
