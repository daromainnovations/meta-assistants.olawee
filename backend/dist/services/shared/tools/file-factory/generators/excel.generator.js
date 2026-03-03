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
exports.excelGenerator = exports.ExcelGenerator = void 0;
const xlsx = __importStar(require("xlsx"));
class ExcelGenerator {
    /**
     * Genera un archivo XLSX a partir de datos estructurados en memoria (array de objetos).
     */
    async generate(data, sheetName = 'Datos') {
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
exports.ExcelGenerator = ExcelGenerator;
exports.excelGenerator = new ExcelGenerator();
