"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metaToolsService = exports.MetaToolsService = void 0;
const tool_executor_service_1 = require("../shared/tool-executor.service");
/**
 * ============================================================
 * 🧪 META TOOLS SERVICE — Laboratorio de Asistentes Avanzados
 * ============================================================
 * Este es el lienzo en blanco para desarrollar y probar nuevas
 * herramientas especializadas antes de pasarlas a Producción.
 *
 * Para añadir una nueva herramienta:
 * 1. Crea un nuevo método: getMyNewTool()
 * 2. Regístrala en el Map de getAllTools() con el siguiente ID disponible
 * 3. Desde el frontend de Meta, introduce el ID en el campo "Meta Tool IDs"
 * ============================================================
 */
class MetaToolsService {
    // ============================================================
    // 🔬 ÁREA DE NUEVAS HERRAMIENTAS META
    // (Aquí van las herramientas en desarrollo / experimentales)
    // ============================================================
    // EJEMPLO DE TOOL META #1
    // getMyNewSpecializedTool() {
    //     return new DynamicStructuredTool({
    //         name: "toolNueva",
    //         description: "...descripción precisa para el LLM...",
    //         schema: z.object({
    //             param1: z.string().describe("...")
    //         }),
    //         func: async ({ param1 }) => {
    //             // lógica aquí
    //             return `Resultado: ${param1}`;
    //         }
    //     });
    // }
    // ============================================================
    // 📦 REGISTRO DE HERRAMIENTAS META (por ID numérico)
    // ============================================================
    getAllTools(toolIds = []) {
        // Herramientas Meta registradas con ID (se irán añadiendo aquí)
        const all = new Map([
        // [1, this.getMyNewSpecializedTool()],
        ]);
        // Siempre incluimos las herramientas base (Hora, Wikipedia, Órdenes)
        const baseTools = tool_executor_service_1.toolExecutorService.getTools([]);
        if (toolIds.length === 0) {
            return [...baseTools];
        }
        // Devolvemos las base + las Meta seleccionadas por ID
        const selectedMetaTools = [];
        for (const id of toolIds) {
            const tool = all.get(id);
            if (tool)
                selectedMetaTools.push(tool);
        }
        return [...baseTools, ...selectedMetaTools];
    }
}
exports.MetaToolsService = MetaToolsService;
exports.metaToolsService = new MetaToolsService();
