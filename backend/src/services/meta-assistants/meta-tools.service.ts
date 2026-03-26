import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { toolExecutorService } from "../shared/tool-executor.service";

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

export class MetaToolsService {

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
    getAllTools(toolIds: number[] = []) {

        // Herramientas Meta registradas con ID (se irán añadiendo aquí)
        const all = new Map<number, any>([
            // [1, this.getMyNewSpecializedTool()],
        ]);

        // Siempre incluimos las herramientas base (Hora, Wikipedia, Órdenes)
        const baseTools = toolExecutorService.getTools([]);

        if (toolIds.length === 0) {
            return [...baseTools];
        }

        // Devolvemos las base + las Meta seleccionadas por ID
        const selectedMetaTools: any[] = [];
        for (const id of toolIds) {
            const tool = all.get(id);
            if (tool) selectedMetaTools.push(tool);
        }

        return [...baseTools, ...selectedMetaTools];
    }
}

export const metaToolsService = new MetaToolsService();
