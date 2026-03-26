import { metaMemoryService } from './meta-memory.service';
import { documentService } from '../shared/document.service';
import { titleGeneratorAutomation } from '../../automations/title-generator.automation';

// ============================================================
// 🤖 IMPORTAR TODOS LOS AGENTES ESPECIALISTAS AQUÍ
// ============================================================
import { invoiceCheckerAgent } from './specialists/invoice-checker/invoice-checker.agent';
import { docComparatorAgent } from './specialists/doc-comparator/doc-comparator.agent';

// ============================================================
// 📋 TIPOS
// ============================================================

/**
 * Configuración de cada especialista en el registro.
 * acceptsFiles: si true, la capa base procesa y transcribe los archivos
 *               antes de pasarlos al especialista.
 *               si false, el procesador de archivos se salta completamente.
 */
export interface SpecialistConfig {
    label: string;
    acceptsFiles: boolean;
}

/**
 * Contexto pre-procesado que la capa base prepara y entrega al especialista.
 * El especialista recibe todo listo para trabajar.
 */
export interface MetaContext {
    sessionId: string;
    userMessage: string;
    files: Express.Multer.File[];
    docContext: string;
    history: any[];
    model: string;
}

// ============================================================
// 📋 REGISTRO DE ESPECIALISTAS
// ============================================================
// Para registrar un nuevo especialista:
//   1. Añade su entrada aquí (con acceptsFiles true o false)
//   2. Importa el agente arriba
//   3. Añade el case en routeToSpecialist()
// ============================================================
export const SPECIALIST_REGISTRY: Record<string, SpecialistConfig> = {
    'invoice_checker': {
        label: 'Verificador de Facturas vs Excel',
        acceptsFiles: true
    },
    'doc_comparator': {
        label: 'Comparador de Documentos (Genérico)',
        acceptsFiles: true
    },
    // Aquí irán los futuros especialistas:
    // 'contract_analyzer': { label: 'Analizador de Contratos', acceptsFiles: true },
    // 'chat_advisor':      { label: 'Asesor de Chat',          acceptsFiles: false },
};

export class MetaHandlerService {

    /**
     * CAPA BASE COMÚN — Punto de entrada del sistema Meta.
     *
     * Este método actúa como el "sandwich":
     *  - Pre-procesado superior (fijo): carga BD, archivos, historial, guarda input
     *  - Motor del especialista (intercambiable): según meta_id
     *  - Post-procesado inferior (fijo): guarda output, devuelve respuesta
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

        const config = SPECIALIST_REGISTRY[metaId];
        if (!config) {
            return {
                status: 'error',
                message: `Especialista "${metaId}" no encontrado. Disponibles: ${Object.keys(SPECIALIST_REGISTRY).join(', ')}`,
                timestamp: new Date().toISOString()
            };
        }

        console.log(`\n[MetaHandler] ▶ SPECIALIST MODE — ID: "${metaId}" (${config.label}), Session: "${sessionId}"`);

        // ══════════════════════════════════════════════════════════════
        // 🔲 CAPA BASE — PRE-PROCESADO (igual para todos los especialistas)
        // ══════════════════════════════════════════════════════════════

        // 1. [OPCIONAL] Procesar archivos → documentContext
        //    Solo si el especialista lo requiere (acceptsFiles: true)
        let finalDocContext = documentContext || '';
        if (config.acceptsFiles && files && files.length > 0) {
            console.log(`[MetaHandler] 📎 Processing ${files.length} files for specialist "${metaId}"...`);
            // Los archivos son pasados directamente al especialista.
            // El especialista los lee con sus propias herramientas (extractExcelData, PDF inline, etc.)
            // porque cada uno los procesa de forma diferente.
        }

        // 2. Guardar mensaje del usuario en BD
        await metaMemoryService.saveMessage(sessionId, 'human', userMessageContent);

        // 3. Lanzar título automático (fire & forget)
        if (userMessageContent) {
            titleGeneratorAutomation.generateTitleAsync(sessionId, userMessageContent, 'meta-assistant', metaId).catch((e: any) => {
                console.error('[MetaHandler] Background title error:', e);
            });
        }

        // ══════════════════════════════════════════════════════════════
        // 🔴 MOTOR DEL ESPECIALISTA — El único punto que cambia por meta_id
        // ══════════════════════════════════════════════════════════════
        const specialistResult = await this.routeToSpecialist(
            metaId,
            userMessageContent,
            files || [],
            sessionId,
            finalDocContext,
            modelStr
        );

        // ══════════════════════════════════════════════════════════════
        // 🔲 CAPA BASE — POST-PROCESADO (igual para todos los especialistas)
        // ══════════════════════════════════════════════════════════════

        // 4. Guardar respuesta del especialista en BD
        if (specialistResult?.ai_response) {
            await metaMemoryService.saveMessage(sessionId, 'ai', specialistResult.ai_response);
        }

        return specialistResult;
    }

    /**
     * Router: despacha al motor del especialista correcto según meta_id.
     *
     * Para añadir un nuevo especialista:
     *   1. Crea su carpeta en /specialists/mi-agente/
     *   2. Importa el agente arriba
     *   3. Añade su case aquí
     *   4. Añade su entrada en SPECIALIST_REGISTRY
     */
    private async routeToSpecialist(
        metaId: string,
        userMessage: string,
        files: Express.Multer.File[],
        sessionId: string,
        docContext: string,
        model: string
    ): Promise<any> {
        console.log(`[MetaHandler] 🎯 Routing to SPECIALIST: "${metaId}"`);

        switch (metaId) {
            case 'invoice_checker':
                return await invoiceCheckerAgent.run(userMessage, files, sessionId);

            case 'doc_comparator':
                return await docComparatorAgent.run(userMessage, files, sessionId);

            // ──────────────────────────────────────────────────────────────
            // 🆕 AQUÍ AÑADES EL NUEVO ESPECIALISTA:
            // case 'mi_nuevo_asistente':
            //     return await miNuevoAsistenteAgent.run(userMessage, files, sessionId);
            // ──────────────────────────────────────────────────────────────

            default:
                return {
                    status: 'error',
                    message: `Agente especialista "${metaId}" no encontrado. Especialistas disponibles: ${Object.keys(SPECIALIST_REGISTRY).join(', ')}`,
                    timestamp: new Date().toISOString()
                };
        }
    }
}

export const metaHandlerService = new MetaHandlerService();
