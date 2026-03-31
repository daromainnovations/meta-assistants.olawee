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
exports.generateExcelBuffer = generateExcelBuffer;
const xlsx = __importStar(require("xlsx"));
function generateExcelBuffer(gastos, justificantes) {
    // Crear un nuevo Workbook
    const wb = xlsx.utils.book_new();
    // Construir Hoja de Anexo 2 (Gastos)
    const cabecerasAnexo2 = [
        'Ref del gasto (G+nº de orden)',
        'Nº DOCUMENTO / FACTURA',
        'EMISOR / PROVEEDOR',
        'PARTIDA DE GASTO A LA QUE PERTENECE',
        'ACTIVIDAD A LA QUE PERTENECE',
        'FECHA',
        'CONCEPTO',
        'BASE IMPONIBLE',
        'IVA',
        'RETENCIÓN IRPF',
        'TOTAL FACTURA',
        'IMPORTE IMPUTADO EN LA JUSTIFICACIÓN',
        'OBSERVACIONES DE LA FACTURA',
        'Ref del justificante (según Anexo 3)',
        'FECHA DE PAGO',
        'IMPORTE PAGADO',
        'OBSERVACIONES DEL PAGO'
    ];
    const filasAnexo2 = [
        ['ANEXO 2 RELACIÓN DE GASTOS ACTUALIZADA'],
        [],
        cabecerasAnexo2
    ];
    for (const g of gastos) {
        filasAnexo2.push([
            g.refGasto, g.numFactura, g.proveedor, g.partida, g.actividad,
            g.fecha, g.concepto, g.baseImponible, g.iva, g.retencion,
            g.total, g.importeImputado, g.observacionesFactura, g.refJustificante,
            g.fechaPago, g.importePagado, g.observacionesPago
        ]);
    }
    const wsAnexo2 = xlsx.utils.aoa_to_sheet(filasAnexo2);
    xlsx.utils.book_append_sheet(wb, wsAnexo2, 'Anexo 2 Gastos');
    // Construir Hoja de Anexo 3 (Justificantes)
    const cabecerasAnexo3 = [
        'Ref del doc justificativo (J+nº de orden)',
        'Ref del gasto del Anexo 2 vinculado',
        'PARTIDA DE GASTO A LA QUE PERTENECE',
        'ACTIVIDAD A LA QUE PERTENECE',
        'TIPO DE DOCUMENTO',
        'DESCRIPCIÓN DOCUMENTO',
        'FECHA',
        'OBSERVACIONES'
    ];
    const filasAnexo3 = [
        ['ANEXO 3 DOCUMENTOS JUSTIFICATIVOS ACTUALIZADA'],
        [],
        cabecerasAnexo3
    ];
    for (const j of justificantes) {
        filasAnexo3.push([
            j.refJustificante, j.refGastoVinculado, j.partida, j.actividad,
            j.tipoDocumento, j.descripcion, j.fecha, j.observaciones
        ]);
    }
    const wsAnexo3 = xlsx.utils.aoa_to_sheet(filasAnexo3);
    xlsx.utils.book_append_sheet(wb, wsAnexo3, 'Anexo 3 Justificantes');
    // Generar Buffer
    return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
