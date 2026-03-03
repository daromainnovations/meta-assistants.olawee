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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pymesToolsService = exports.PymesToolsService = void 0;
const tools_1 = require("@langchain/core/tools");
const zod_1 = require("zod");
const pdfkit_1 = __importDefault(require("pdfkit"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const docx_1 = require("docx");
const google_genai_1 = require("@langchain/google-genai");
const xlsx = __importStar(require("xlsx"));
const tool_executor_service_1 = require("../shared/tool-executor.service");
const downloadsDir = path_1.default.join(process.cwd(), 'public', 'downloads');
if (!fs_1.default.existsSync(downloadsDir)) {
    fs_1.default.mkdirSync(downloadsDir, { recursive: true });
}
class PymesToolsService {
    // 1. GENERADOR DE FACTURAS
    getFacturasTool() {
        return new tools_1.DynamicStructuredTool({
            name: "toolFacturas",
            description: "Genera facturas profesionales en PDF para empresas y autónomos, calcula IVA/IGIC totales y retenciones y retorna un enlace (URL) de descarga del documento creado.",
            schema: zod_1.z.object({
                emisor: zod_1.z.object({
                    nombre: zod_1.z.string().describe("Nombre de la empresa emisora o autónomo"),
                    nif: zod_1.z.string().describe("NIF/CIF del emisor"),
                    direccion: zod_1.z.string().describe("Dirección o ciudad del emisor")
                }),
                cliente: zod_1.z.object({
                    nombre: zod_1.z.string().describe("Nombre del cliente o empresa receptora"),
                    nif: zod_1.z.string().describe("NIF/CIF del cliente"),
                    direccion: zod_1.z.string().describe("Dirección o ciudad del cliente")
                }),
                lineas: zod_1.z.array(zod_1.z.object({
                    concepto: zod_1.z.string().describe("Descripción del producto o servicio"),
                    cantidad: zod_1.z.number().describe("Cantidad (ej: 1)"),
                    precio_unitario: zod_1.z.number().describe("Precio unitario base (sin impuestos)")
                })),
                impuesto_tipo: zod_1.z.enum(["IVA_21", "IVA_10", "IVA_4", "IGIC_7", "CERO"]).describe("Tipo impositivo a aplicar"),
                aplicar_retencion_irpf: zod_1.z.boolean().describe("Si es factura de autónomo a empresa sujeto a retención del IRPF (generalmente 15%)")
            }),
            func: async ({ emisor, cliente, lineas, impuesto_tipo, aplicar_retencion_irpf }) => {
                try {
                    const filename = `factura_${Date.now()}.pdf`;
                    const filepath = path_1.default.join(downloadsDir, filename);
                    return await new Promise((resolve, reject) => {
                        const doc = new pdfkit_1.default({ margin: 50 });
                        const writeStream = fs_1.default.createWriteStream(filepath);
                        doc.pipe(writeStream);
                        doc.fontSize(20).text("FACTURA", { align: "right" }).moveDown();
                        doc.fontSize(12).text(`Emisor: ${emisor.nombre} (NIF: ${emisor.nif})`, { align: 'left' });
                        doc.fontSize(10).text(emisor.direccion, { align: 'left' }).moveDown();
                        doc.fontSize(12).text(`Cliente: ${cliente.nombre} (NIF: ${cliente.nif})`);
                        doc.fontSize(10).text(cliente.direccion).moveDown(2);
                        // Lines
                        let subtotal = 0;
                        doc.text("CONCEPTO", 50, doc.y, { continued: true })
                            .text("CANTIDAD", 300, doc.y, { continued: true })
                            .text("PRECIO", 400, doc.y, { continued: true })
                            .text("TOTAL", 480, doc.y);
                        doc.moveTo(50, doc.y + 15).lineTo(550, doc.y + 15).stroke();
                        doc.moveDown();
                        lineas.forEach(l => {
                            const totalLinea = l.cantidad * l.precio_unitario;
                            subtotal += totalLinea;
                            doc.moveDown(1);
                            doc.text(l.concepto, 50, doc.y, { continued: true, width: 230 })
                                .text(l.cantidad.toString(), 300, doc.y, { continued: true })
                                .text(l.precio_unitario.toFixed(2) + " €", 400, doc.y, { continued: true })
                                .text(totalLinea.toFixed(2) + " €", 480, doc.y);
                        });
                        doc.moveDown(2);
                        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke().moveDown();
                        // Totals Calculation
                        let porcentajeImpuesto = 0;
                        if (impuesto_tipo === "IVA_21")
                            porcentajeImpuesto = 0.21;
                        if (impuesto_tipo === "IVA_10")
                            porcentajeImpuesto = 0.10;
                        if (impuesto_tipo === "IVA_4")
                            porcentajeImpuesto = 0.04;
                        if (impuesto_tipo === "IGIC_7")
                            porcentajeImpuesto = 0.07;
                        const valorImpuesto = subtotal * porcentajeImpuesto;
                        const retencion = aplicar_retencion_irpf ? (subtotal * 0.15) : 0;
                        const totalFactura = subtotal + valorImpuesto - retencion;
                        doc.text(`Subtotal Base: ${subtotal.toFixed(2)} €`, { align: 'right' });
                        doc.text(`Impuesto (${impuesto_tipo}): +${valorImpuesto.toFixed(2)} €`, { align: 'right' });
                        if (aplicar_retencion_irpf) {
                            doc.text(`Retención IRPF (15%): -${retencion.toFixed(2)} €`, { align: 'right' });
                        }
                        doc.moveDown().fontSize(16).text(`TOTAL A PAGAR: ${totalFactura.toFixed(2)} €`, { align: 'right' });
                        doc.end();
                        writeStream.on('finish', () => {
                            // En producción este sería la URL pública del backend HTTP
                            const url = `http://localhost:3000/downloads/${filename}`;
                            resolve(`[EXITO] Factura generada correctamente. Enlace de descarga (informar al usuario): ${url}`);
                        });
                        writeStream.on('error', (err) => reject(err));
                    });
                }
                catch (error) {
                    return `Error al generar la factura: ${error.message}`;
                }
            }
        });
    }
    // 2. CALCULADORA DE IMPUESTOS
    getImpuestosTool() {
        return new tools_1.DynamicStructuredTool({
            name: "toolImpuestos",
            description: "Calcula el IVA a pagar, IRPF o estimaciones de retenciones mensuales o trimestrales de un autónomo o pyme en base a la normativa española.",
            schema: zod_1.z.object({
                ingresos_totales: zod_1.z.number().describe("Total de ingresos brutos sin impuestos"),
                gastos_deducibles: zod_1.z.number().describe("Total de gastos deducibles sin impuestos"),
                porcentaje_iva_ventas: zod_1.z.enum(["21", "10", "4", "0"]).describe("IVA principal que factura la empresa (21%, 10%, 4%, o 0%)"),
                porcentaje_iva_gastos: zod_1.z.enum(["21", "10", "4", "0"]).describe("IVA principal de los gastos (ej: 21%)"),
                aplicar_retencion_irpf: zod_1.z.boolean().describe("Si o no debe aplicar estimación del modelo 130 o retención de IRPF al 15%"),
                nuevos_autonomos: zod_1.z.boolean().optional().describe("Si es primer año se aplica 7% de IRPF en lugar del 15%. Obligatorio indicarlo verdadero o falso o null.")
            }),
            func: async (params) => {
                const ivaVentas = params.ingresos_totales * (Number(params.porcentaje_iva_ventas) / 100);
                const ivaGastos = params.gastos_deducibles * (Number(params.porcentaje_iva_gastos) / 100);
                const ivaResultadoTrimestre = ivaVentas - ivaGastos;
                const beneficio = params.ingresos_totales - params.gastos_deducibles;
                let porcentajeIRPF = params.nuevos_autonomos ? 0.07 : 0.15;
                let retencionOModelo130 = 0;
                if (params.aplicar_retencion_irpf) {
                    // El IRPF sobre el beneficio o en la propia factura de ingresos
                    retencionOModelo130 = params.ingresos_totales * porcentajeIRPF;
                }
                let recomendacion = `
### Desglose Fiscal Estimado

- **Ingresos Brutos declarados**: ${params.ingresos_totales.toFixed(2)} €
- **Gastos Deducibles declarados**: ${params.gastos_deducibles.toFixed(2)} €
- **Beneficio Neto Bruto (antes de impuestos finales)**: ${beneficio.toFixed(2)} €

**1. Cálculo de IVA (Modelo 303 trimestral)**:
- IVA Repercutido (ventas al ${params.porcentaje_iva_ventas}%): +${ivaVentas.toFixed(2)} €
- IVA Soportado (compras al ${params.porcentaje_iva_gastos}%): -${ivaGastos.toFixed(2)} €
- **Resultado IVA (Lo que debes pagar a Hacienda)**: ${ivaResultadoTrimestre > 0 ? ivaResultadoTrimestre.toFixed(2) + " € a PAGAR" : Math.abs(ivaResultadoTrimestre).toFixed(2) + " € a COMPENSAR O DEVOLVER"}

**2. Retenciones / IRPF (Modelo 130)**:
- Porcentaje aplicado: ${porcentajeIRPF * 100}%
- Total retenido a descontar de liquidez: ${retencionOModelo130.toFixed(2)} €

*Nota del calendario fiscal: El IVA trimestral y el IRPF (Mod. 130) se presentan los días 1 a 20 de Abril (T1), Julio (T2), Octubre (T3), y el cuarto al finalizar Enero (T4).*
`;
                return recomendacion;
            }
        });
    }
    // 3. GENERADOR DE CONTRATOS
    getContratosTool() {
        return new tools_1.DynamicStructuredTool({
            name: "toolContratos",
            description: "Genera documentos legales y contratos comerciales formales en formato .docx (Word) para clientes, freelance y proveedores en España. Retorna el enlace de descarga del contrato.",
            schema: zod_1.z.object({
                tipo_contrato: zod_1.z.enum(["fijo", "practicas", "servicios_freelance", "compraventa"]).describe("Tipo de contrato genérico (laboral o comercial)"),
                parte_a: zod_1.z.object({ nombre: zod_1.z.string(), nif: zod_1.z.string() }).describe("Empresa o contratador principal"),
                parte_b: zod_1.z.object({ nombre: zod_1.z.string(), nif: zod_1.z.string() }).describe("Trabajador o proveedor"),
                salario_o_precio: zod_1.z.string().describe("Precio o salario final acordado"),
                fecha_inicio: zod_1.z.string().describe("Día de inicio del acuerdo (DD/MM/AAAA)"),
                actividad_o_puesto: zod_1.z.string().describe("Descripción del puesto de trabajo o servicio a realizar")
            }),
            func: async ({ tipo_contrato, parte_a, parte_b, salario_o_precio, fecha_inicio, actividad_o_puesto }) => {
                try {
                    const doc = new docx_1.Document({
                        creator: "OLAWEE AI Assistant",
                        description: `Contrato de tipo: ${tipo_contrato}`,
                        title: "Contrato " + tipo_contrato,
                        sections: [{
                                properties: {},
                                children: [
                                    new docx_1.Paragraph({ text: "CONTRATO (" + tipo_contrato.toUpperCase() + ")", heading: "Heading1" }),
                                    new docx_1.Paragraph({ text: "\nReunidos por una parte:" }),
                                    new docx_1.Paragraph({ text: `- ${parte_a.nombre} (en adelante, 'LA EMPRESA' / 'CONTRATADOR'), con NIF ${parte_a.nif}.`, bullet: { level: 0 } }),
                                    new docx_1.Paragraph({ text: "Y por otra parte:" }),
                                    new docx_1.Paragraph({ text: `- ${parte_b.nombre} (en adelante, 'TRABAJADOR' / 'PROVEEDOR'), con NIF ${parte_b.nif}.`, bullet: { level: 0 } }),
                                    new docx_1.Paragraph({ text: "\nACUERDAN LAS SIGUIENTES CLÁUSULAS:", heading: "Heading2" }),
                                    new docx_1.Paragraph({ text: `PRIMERA: El TRABAJADOR/PROVEEDOR se compromete a realizar las labores de "${actividad_o_puesto}".` }),
                                    new docx_1.Paragraph({ text: `SEGUNDA: La fecha de inicio de efectos del presente acuerdo queda fijada en ${fecha_inicio}.` }),
                                    new docx_1.Paragraph({ text: `TERCERA: La remuneración total bruta pactada por este servicio/cargo asciende a la cantidad de ${salario_o_precio}.` }),
                                    new docx_1.Paragraph({ text: "CUARTA: Este contrato estará sujeto a la Ley Española, y tanto retenciones como cargas fiscales se aplicarán a la legislación vigente." }),
                                    new docx_1.Paragraph({ text: "\nEn prueba de conformidad, se firma el presente documento digitalmente." }),
                                    new docx_1.Paragraph({ text: "\n\nFirma PARTE A ___________________________       Firma PARTE B ___________________________" })
                                ],
                            }],
                    });
                    const filename = `contrato_${Date.now()}.docx`;
                    const filepath = path_1.default.join(downloadsDir, filename);
                    const buffer = await docx_1.Packer.toBuffer(doc);
                    fs_1.default.writeFileSync(filepath, buffer);
                    const url = `http://localhost:3000/downloads/${filename}`;
                    return `[EXITO] Documento DOCX (Contrato de ${tipo_contrato}) generado correctamente. Informa al usuario que puede descargarlo aquí: ${url}`;
                }
                catch (e) {
                    return `Error generando contrato en docx: ${e.message}`;
                }
            }
        });
    }
    // 4. GENERADOR DE CONTENIDO MARKETING (Self-Prompting Nested LLM)
    getMarketingTool() {
        return new tools_1.DynamicStructuredTool({
            name: "toolMarketing",
            description: "Esta herramienta crea publicaciones excepcionales, newsletters y copywriting ultra persuasivo optimizado para redes sociales utilizando una capa LLM profunda separada.",
            schema: zod_1.z.object({
                red_social: zod_1.z.enum(["LinkedIn", "Instagram", "Facebook", "Newsletter", "GoogleAds"]).describe("Red objetivo"),
                nicho_sector: zod_1.z.string().describe("A qué sector se dedica la empresa del usuario (e.g. tecnología, construcción)"),
                tono: zod_1.z.enum(["Formal", "Informal/Divertido", "Agresivo Comercial", "Inspirador", "Experto"]).describe("El tono exigido por el usuario"),
                objetivo_call_to_action: zod_1.z.string().describe("¿Qué queremos que la gente haga al final? (ej: Suscribirse, Reservar, Ir al enlace)"),
                tema_principal: zod_1.z.string().describe("Sobre qué trata la publicación, qué queremos vender o comunicar")
            }),
            func: async (params) => {
                try {
                    // Creamos una micro-agencia de Marketing al vuelo dentro de la herramienta usando Gemini veloz o el disponible en tu .env.
                    const model = new google_genai_1.ChatGoogleGenerativeAI({
                        apiKey: process.env.GEMINI_API_KEY,
                        model: 'gemini-2.0-flash',
                        temperature: 0.8
                    });
                    const msg = `Actúa como el mejor copywriter comercial del mundo afincado en España.
Necesitas escribir una publicación perfecta lista para usarse. Cumple estrictamente estas reglas:
- Destino: ${params.red_social}
- Sector del Cliente: ${params.nicho_sector}
- Tono forzado: ${params.tono}
- Tema central del post: ${params.tema_principal}
- Call to Action indispensable: ${params.objetivo_call_to_action}

RESTRICCIONES:
Genera ÚNICAMENTE la publicación terminada. Si es Instagram/LinkedIn, usa Emojis coherentes, Saltos de línea, y Hashtags al final. Si es Ads, directo al punto. No metas introducciones tipo "Aquí tienes tu post:".`;
                    const res = await model.invoke(msg);
                    return `[RESULTADO ELABORADO CON EXCELENCIA POR AGENCIA DE MARKETING]:\n\n${res.content}\n\n(Dile al usuario que aquí tiene el borrador sugerido)`;
                }
                catch (e) {
                    return `[ERROR en Herramienta de Marketing]: Dile al usuario que disculpe, falló la sub-red de generación: ${e.message}`;
                }
            }
        });
    }
    // 5. CREADOR DE CUADRANTES DE TURNOS (EXCEL)
    getCuadrantesTool() {
        return new tools_1.DynamicStructuredTool({
            name: "toolCuadrantes",
            description: "Genera o actualiza un cuadrante de turnos en formato Excel (.xlsx) para residencias, hospitales o empresas completas. Excelente para asignar distribuciones horas o hacer sustituciones si el usuario pide cambios y reemplazar a un empleado por otro. Devuelve el enlace de descarga del archivo Excel.",
            schema: zod_1.z.object({
                titulo: zod_1.z.string().describe("Título o nombre del cuadrante (ej: 'Cuadrante Residencia Mayo 2026')"),
                dias: zod_1.z.array(zod_1.z.string()).describe("IMPORTANTE: TÚ COMO IA DEBES INFERIR Y AUTO-GENERAR estos días en base a lo que pida el usuario (ej. si pide Primera semana de Mayo, genera: ['1-May', '2-May', '3-May', '4-May', '5-May', '6-May', '7-May']). NUNCA SE LO PIDAS DE VUELTA AL USUARIO."),
                empleados: zod_1.z.array(zod_1.z.object({
                    nombre: zod_1.z.string().describe("Nombre del empleado"),
                    puesto: zod_1.z.string().describe("Labor (ej: Enfermería, Gerocultor, Cocina)"),
                    total_horas: zod_1.z.number().describe("Horas asignadas al trabajador en la tabla (Auto-calculadas por ti)"),
                    turnos: zod_1.z.array(zod_1.z.string()).describe("Turnos asignados día por día. DEBE TENER LA MISMA LONGITUD que el array de dias entero. Inferidos por ti. Ej: ['M', 'T', 'L', 'L', 'N']")
                }))
            }),
            func: async ({ titulo, dias, empleados }) => {
                try {
                    const excelData = [];
                    empleados.forEach(emp => {
                        const fila = {
                            "Empleado": emp.nombre,
                            "Sector / Puesto": emp.puesto,
                            "Horas": emp.total_horas
                        };
                        dias.forEach((dia, index) => {
                            fila[dia] = emp.turnos[index] || "-";
                        });
                        excelData.push(fila);
                    });
                    const wb = xlsx.utils.book_new();
                    const ws = xlsx.utils.json_to_sheet(excelData);
                    // Asegurar anchos de columna para que el excel se vea profesional
                    const cols = [{ wch: 25 }, { wch: 20 }, { wch: 8 }];
                    dias.forEach(() => cols.push({ wch: 10 }));
                    ws['!cols'] = cols;
                    xlsx.utils.book_append_sheet(wb, ws, "Cuadrante_Turnos");
                    const filename = `cuadrante_${Date.now()}.xlsx`;
                    const filepath = path_1.default.join(downloadsDir, filename);
                    xlsx.writeFile(wb, filepath);
                    const url = `http://localhost:3000/downloads/${filename}`;
                    return `[EXITO] Documento Cuadrante EXCEL (.xlsx) ('${titulo}') generado correctamente. Informa al usuario que puede descargarlo aquí para enviar: ${url}`;
                }
                catch (e) {
                    return `Error generando cuadrante de turnos en Excel: ${e.message}`;
                }
            }
        });
    }
    // Helper para retornar segmentado según el array recibido
    getAllTools(toolIds = []) {
        const all = [
            { id: 1, tool: this.getFacturasTool() },
            { id: 2, tool: this.getImpuestosTool() },
            { id: 3, tool: this.getContratosTool() },
            { id: 4, tool: this.getMarketingTool() },
            { id: 5, tool: this.getCuadrantesTool() }
        ];
        // Obtener las herramientas base de producción (las que no requieren ID y siempre están activas)
        // Usamos array vacío [] para que ToolExecutorService nos devuelva solo las coreTools
        const baseTools = tool_executor_service_1.toolExecutorService.getTools([]);
        // Si viene vacío, devolvemos solo las base
        if (toolIds.length === 0) {
            return [...baseTools];
        }
        // Si vienen IDs, filtramos y devolvemos las base + las PYMES seleccionadas.
        const selectedPymesTools = all.filter(t => toolIds.includes(t.id)).map(t => t.tool);
        return [...baseTools, ...selectedPymesTools];
    }
}
exports.PymesToolsService = PymesToolsService;
exports.pymesToolsService = new PymesToolsService();
