import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export class ToolExecutorService {
    /**
     * Devuelve el array de herramientas disponiles para que el modelo decida usarlas
     */
    getTools(toolIds: number[] = []) {
        console.log(`[ToolExecutor] Registering tools for agent... Allowed IDs: ${toolIds.length ? toolIds.join(', ') : 'All'}`);

        // 🛠 Ejemplo de Tool Dinámica 1: Conseguir Hora Actual
        // Esto le da a Gemini/OpenAI conocimiento del tiempo real si el usuario lo pregunta
        const getCurrentTimeTool = new DynamicStructuredTool({
            name: "get_current_time",
            description: "Útil cuando necesitas saber la fecha y hora actual.",
            schema: z.object({}), // No requiere parámetros
            func: async () => {
                const date = new Date();
                return `La fecha y hora actual del servidor es: ${date.toLocaleString()} `;
            }
        });

        // 🛠 Ejemplo de Tool Dinámica 2: Simulación de API Genérica
        const searchOrderTool = new DynamicStructuredTool({
            name: "search_order_status",
            description: "Busca un estado de orden de pedido ficticio por ID.",
            schema: z.object({
                orderId: z.string().describe("El ID de la orden que se quiere buscar")
            }),
            func: async ({ orderId }) => {
                console.log(`[ToolExecutor] 🚀 Ejecutando Tool 'search_order_status' con orderId = ${orderId} `);
                // Aquí podrías hacer llamada a tu BD, Axios a API Externa, etc.
                return `La orden ${orderId} se encuentra 'En tránsito'.`;
            }
        });

        // 🛠 Ejemplo de Tool Dinámica 3: Búsqueda en VIVO por Wikipedia en Español (100% libre de bloqueos)
        const searchWikipediaTool = new DynamicStructuredTool({
            name: "search_wikipedia",
            description: "Útil para buscar en internet información enciclopédica, eventos históricos recientes, biografías o datos generales que desconozcas.",
            schema: z.object({
                query: z.string().describe("Términos de búsqueda explícitos para buscar en wikipedia")
            }),
            func: async ({ query }) => {
                console.log(`[ToolExecutor] 🌍 Ejecutando Tool 'search_wikipedia' buscando: "${query}"`);
                try {
                    const url = `https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json`;
                    const response = await fetch(url);
                    const data = await response.json();

                    if (!data.query || !data.query.search || data.query.search.length === 0) {
                        return "No se encontraron resultados en Wikipedia para esa búsqueda.";
                    }

                    // Tomamos los primeros 5 resultados
                    const topResults = data.query.search.slice(0, 5).map((res: any) => {
                        // Limpiar tags HTML feos como <span class="searchmatch">
                        const cleanSnippet = res.snippet.replace(/<[^>]*>?/gm, '');
                        return `Título: ${res.title}\nFragmento: ${cleanSnippet}\n`;
                    }).join('\n');

                    return `Recortes de Wikipedia para '${query}':\n\n${topResults}`;
                } catch (error: any) {
                    console.error("[ToolExecutor] Error buscando en Wikipedia:", error.message);
                    return `Ocurrió un error consultando la enciclopedia: ${error.message}`;
                }
            }
        });

        // Herramientas Base: SIEMPRE DISPONIBLES EN PRODUCCIÓN
        // (No requieren ID, el Asistente siempre las tiene inyectadas)
        const coreTools = [getCurrentTimeTool, searchOrderTool, searchWikipediaTool];

        // Mapeo Centralizado de Nuevas Herramientas Producción (Assistants / Chat general)
        // Aquí iremos añadiendo las tools 1, 2, 3... que vayamos subiendo desde Pymes
        const allToolsMap = new Map<number, any>([
            // [1, nuevaToolEjemplo]
        ]);

        // Si no se proveen IDs devolvemos solo las Base (y si hay alguna genérica)
        if (!toolIds || toolIds.length === 0) {
            return [...coreTools];
        }

        // Si se proveen IDs, devolvemos las Base + las seleccionadas explícitamente por ID
        const selectedTools: any[] = [...coreTools];
        for (const id of toolIds) {
            const tool = allToolsMap.get(id);
            if (tool) {
                selectedTools.push(tool);
            }
        }

        return selectedTools;
    }
}

export const toolExecutorService = new ToolExecutorService();
