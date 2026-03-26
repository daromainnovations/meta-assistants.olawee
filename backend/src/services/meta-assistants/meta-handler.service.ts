import { metaMemoryService } from './meta-memory.service';

// ============================================================
// 🤖 IMPORTAR TODOS LOS AGENTES ESPECIALISTAS AQUÍ
// ============================================================
import { invoiceCheckerAgent } from './specialists/invoice-checker/invoice-checker.agent';
import { docComparatorAgent } from './specialists/doc-comparator/doc-comparator.agent';

/**
 * ============================================================
 * 🔀 META HANDLER — Router de Asistentes Especializados
 * ============================================================
 * Despacha directamente al agente especialista correspondiente.
 * Cada agente gestiona su propio prompt fijo, modelo y herramientas internamente.
 *
 * Para añadir un nuevo especialista:
 *   1. Crea su carpeta en /specialists/mi-agente/
 *   2. Importa el agente arriba
 *   3. Añade su ID al switch de routeToSpecialist()
 * ============================================================
 */

// Mapa de IDs de especialistas disponibles
export const SPECIALIST_REGISTRY: Record<string, string> = {
    'invoice_checker': 'Verificador de Facturas vs Excel',
    'doc_comparator': 'Comparador de Documentos (Genérico)',
    // Aquí irán los futuros especialistas:
    // 'contract_analyzer': 'Analizador de Contratos',
    // 'financial_advisor': 'Asesor Financiero',
};

export class MetaHandlerService {

    /**
     * Despacha la petición al agente especialista según el meta_id
     */
    private async routeToSpecialist(
        metaId: string,
        userMessage: string,
        files: Express.Multer.File[],
        sessionId: string,
        body: any
    ): Promise<any> {
        console.log(`[MetaHandler] 🎯 Routing to SPECIALIST: "${metaId}"`);

        switch (metaId) {
            case 'invoice_checker':
                return await invoiceCheckerAgent.run(userMessage, files, sessionId);

            case 'doc_comparator':
                return await docComparatorAgent.run(userMessage, files, sessionId);

            // case 'contract_analyzer':
            //     return await contractAnalyzerAgent.run(userMessage, files, sessionId);

            default:
                return {
                    status: 'error',
                    message: `Agente especialista "${metaId}" no encontrado. Especialistas disponibles: ${Object.keys(SPECIALIST_REGISTRY).join(', ')}`,
                    timestamp: new Date().toISOString()
                };
        }
    }

    /**
     * Punto de entrada principal del sistema Meta
     */
    async processMessage(
        sessionId: string,
        userMessageContent: string,
        systemPrompt: string,
        modelStr: string,
        historyPayload: any[],
        documentContext: string,
        toolsArray: number[] = [],
        metaId?: string,
        files?: Express.Multer.File[]
    ): Promise<any> {
        if (!metaId) {
             return {
                status: 'error',
                message: `Se requiere un meta_id para enrutar el asistente especialista.`,
                timestamp: new Date().toISOString()
            };
        }

        console.log(`\n[MetaHandler] ▶ SPECIALIST MODE — ID: "${metaId}", Session: "${sessionId}"`);

        // 💾 Guardar mensaje del usuario en tabla de mensajes meta
        await metaMemoryService.saveMessage(sessionId, 'human', userMessageContent);

        const specialistResult = await this.routeToSpecialist(metaId, userMessageContent, files || [], sessionId, {});

        // 💾 Guardar respuesta del especialista en tabla de mensajes meta
        if (specialistResult?.ai_response) {
            await metaMemoryService.saveMessage(sessionId, 'ai', specialistResult.ai_response);
        }

        return specialistResult;
    }
}

export const metaHandlerService = new MetaHandlerService();
