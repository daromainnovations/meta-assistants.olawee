import * as xlsx from 'xlsx';

export interface GastoAnexo2 {
  refGasto: string; // Ej: G28
  numFactura: string;
  proveedor: string;
  partida: string;
  actividad: string; // ej: Madrid Impulsa tech
  fecha: string | number;
  concepto: string;
  baseImponible: number;
  iva: number;
  retencion: number;
  total: number;
  importeImputado: number;
  observacionesFactura: string;
  refJustificante: string; // Ej: J28
  fechaPago: string | number;
  importePagado: number;
  observacionesPago: string;
}

export interface JustificanteAnexo3 {
  refJustificante: string; // Ej: J28
  refGastoVinculado: string; // Ej: G28
  partida: string;
  actividad: string;
  tipoDocumento: string; // Ej: TRANSFERENCIA
  descripcion: string;
  fecha: string | number;
  observaciones: string;
}

export function generateExcelBuffer(gastos: GastoAnexo2[], justificantes: JustificanteAnexo3[]): Buffer {
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

  const filasAnexo2: any[][] = [
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

  const filasAnexo3: any[][] = [
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
