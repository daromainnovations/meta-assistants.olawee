"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metaHandlerService = exports.MetaHandlerService = exports.SPECIALIST_REGISTRY = void 0;
const meta_memory_service_1 = require("./meta-memory.service");
const title_generator_automation_1 = require("../../automations/title-generator.automation");
const supabase_storage_service_1 = require("../shared/storage/supabase-storage.service");
// ============================================================
// 🤖 IMPORTAR TODOS LOS AGENTES ESPECIALISTAS AQUÍ
// ============================================================
const invoice_checker_agent_1 = require("./specialists/invoice-checker/invoice-checker.agent");
const doc_comparator_agent_1 = require("./specialists/doc-comparator/doc-comparator.agent");
const grant_justification_agent_1 = require("./specialists/grant-justification/grant_justification.agent");
// ============================================================
// 📋 REGISTRO DE ESPECIALISTAS
// ============================================================
// Para registrar un nuevo especialista:
//   1. Añade su entrada aquí (con acceptsFiles true o false)
//   2. Importa el agente arriba
//   3. Añade el case en routeToSpecialist()
// ============================================================
exports.SPECIALIST_REGISTRY = {
    'invoice_checker': {
        label: 'Verificador de Facturas vs Excel',
        acceptsFiles: true
    },
    'doc_comparator': {
        label: 'Comparador de Documentos (Genérico)',
        acceptsFiles: true
    },
    'grant_justification': {
        label: 'Asistente Justificador (Subvenciones)',
        acceptsFiles: true
    },
    // Aquí irán los futuros especialistas:
    // 'contract_analyzer': { label: 'Analizador de Contratos', acceptsFiles: true },
    // 'chat_advisor':      { label: 'Asesor de Chat',          acceptsFiles: false },
};
class MetaHandlerService {
    /**
     * CAPA BASE COMÚN — Punto de entrada del sistema Meta.
     *
     * Este método actúa como el "sandwich":
     *  - Pre-procesado superior (fijo): carga BD, archivos, historial, guarda input
     *  - Motor del especialista (intercambiable): según meta_id
     *  - Post-procesado inferior (fijo): guarda output, devuelve respuesta
     */
    async processMessage(sessionId, userMessageContent, systemPrompt, modelStr, historyPayload, documentContext, toolsArray = [], metaId, files) {
        if (!metaId) {
            return {
                status: 'error',
                message: `Se requiere un meta_id para enrutar el asistente especialista.`,
                timestamp: new Date().toISOString()
            };
        }
        const config = exports.SPECIALIST_REGISTRY[metaId];
        if (!config) {
            return {
                status: 'error',
                message: `Especialista "${metaId}" no encontrado. Disponibles: ${Object.keys(exports.SPECIALIST_REGISTRY).join(', ')}`,
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
        // Persistencia de Archivos en Sesión (Memory Cache)
        if (files && files.length > 0) {
            meta_memory_service_1.metaMemoryService.saveSessionFiles(sessionId, files);
        }
        if (config.acceptsFiles && files && files.length > 0) {
            console.log(`[MetaHandler] 📎 Processing ${files.length} files for specialist "${metaId}"...`);
            // Los archivos son pasados directamente al especialista.
            // El especialista los lee con sus propias herramientas (extractExcelData, PDF inline, etc.)
            // porque cada uno los procesa de forma diferente.
        }
        // 2. Guardar mensaje del usuario en BD
        await meta_memory_service_1.metaMemoryService.saveMessage(sessionId, 'human', userMessageContent);
        // 3. Lanzar título automático (fire & forget)
        if (userMessageContent) {
            title_generator_automation_1.titleGeneratorAutomation.generateTitleAsync(sessionId, userMessageContent, 'meta-assistant', metaId).catch((e) => {
                console.error('[MetaHandler] Background title error:', e);
            });
        }
        // ══════════════════════════════════════════════════════════════
        // 🔴 MOTOR DEL ESPECIALISTA — El único punto que cambia por meta_id
        // ══════════════════════════════════════════════════════════════
        const specialistResult = await this.routeToSpecialist(metaId, userMessageContent, files || [], sessionId, finalDocContext, modelStr);
        // ══════════════════════════════════════════════════════════════
        // 🔲 CAPA BASE — POST-PROCESADO (igual para todos los especialistas)
        // ══════════════════════════════════════════════════════════════
        // 4. [NUEVO] Gestión de Archivos Generados (Upload a Storage)
        if (specialistResult?.generated_files && Array.isArray(specialistResult.generated_files)) {
            console.log(`[MetaHandler] 📦 Se han detectado ${specialistResult.generated_files.length} archivos para subir.`);
            for (const file of specialistResult.generated_files) {
                if (file.buffer) {
                    try {
                        const publicUrl = await supabase_storage_service_1.supabaseStorageService.uploadBuffer(file.buffer, file.filename, file.mimetype || 'application/octet-stream');
                        // Añadir enlace al mensaje de la IA
                        const downloadLabel = `\n\n📄 **Descargar:** [${file.filename}](${publicUrl})`;
                        specialistResult.ai_response += downloadLabel;
                        // Guardar URL y limpiar buffer para la respuesta JSON
                        file.url = publicUrl;
                        delete file.buffer;
                    }
                    catch (uploadErr) {
                        console.error(`[MetaHandler] ❌ Error subiendo archivo "${file.filename}":`, uploadErr.message);
                        specialistResult.ai_response += `\n\n⚠️ Error al generar enlace de descarga para ${file.filename}.`;
                    }
                }
            }
        }
        // 5. Guardar respuesta final del especialista en BD
        if (specialistResult?.ai_response) {
            await meta_memory_service_1.metaMemoryService.saveMessage(sessionId, 'ai', specialistResult.ai_response);
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
    async routeToSpecialist(metaId, userMessage, files, sessionId, docContext, model) {
        console.log(`[MetaHandler] 🎯 Routing to SPECIALIST: "${metaId}"`);
        switch (metaId) {
            case 'invoice_checker':
                return await invoice_checker_agent_1.invoiceCheckerAgent.run(userMessage, files, sessionId, docContext);
            case 'doc_comparator':
                return await doc_comparator_agent_1.docComparatorAgent.run(userMessage, files, sessionId, docContext);
            case 'grant_justification':
                return await grant_justification_agent_1.grantJustificationAgent.run(userMessage, files, sessionId, docContext);
            // ──────────────────────────────────────────────────────────────
            // 🆕 AQUÍ AÑADES EL NUEVO ESPECIALISTA:
            // case 'mi_nuevo_asistente':
            //     return await miNuevoAsistenteAgent.run(userMessage, files, sessionId);
            // ──────────────────────────────────────────────────────────────
            default:
                return {
                    status: 'error',
                    message: `Agente especialista "${metaId}" no encontrado. Especialistas disponibles: ${Object.keys(exports.SPECIALIST_REGISTRY).join(', ')}`,
                    timestamp: new Date().toISOString()
                };
        }
    }
}
exports.MetaHandlerService = MetaHandlerService;
exports.metaHandlerService = new MetaHandlerService();
