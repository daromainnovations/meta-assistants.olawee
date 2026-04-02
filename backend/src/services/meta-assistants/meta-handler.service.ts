import { metaMemoryService } from './meta-memory.service';
import { titleGeneratorAutomation } from '../../automations/title-generator.automation';
import { supabaseStorageService } from '../shared/storage/supabase-storage.service';
import { MetaContext, MetaResult } from './meta.types';
import { BaseMetaSpecialist } from './base-specialist';

// ============================================================
// 🤖 IMPORTAR TODOS LOS AGENTES ESPECIALISTAS AQUÍ
// ============================================================
import { invoiceCheckerAgent } from './specialists/invoice-checker/invoice-checker.agent';
import { docComparatorAgent } from './specialists/doc-comparator/doc-comparator.agent';
import { grantJustificationAgent } from './specialists/grant-justification/grant_justification.agent';
import { templateFillerAgent } from './specialists/template-filler/template-filler.agent';

/**
 * Configuración de cada especialista en el registro.
 */
export interface SpecialistConfig {
    label: string;
    acceptsFiles: boolean;
    agent: BaseMetaSpecialist; // Instancia del agente que extiende BaseMetaSpecialist
}

// ============================================================
// 📋 REGISTRO DE ESPECIALISTAS (Plug & Play)
// ============================================================
export const SPECIALIST_REGISTRY: Record<string, SpecialistConfig> = {
    'invoice_checker': {
        label: 'Verificador de Facturas vs Excel',
        acceptsFiles: true,
        agent: invoiceCheckerAgent as any
    },
    'doc_comparator': {
        label: 'Comparador de Documentos (Genérico)',
        acceptsFiles: true,
        agent: docComparatorAgent as any
    },
    'grant_justification': {
        label: 'Asistente Justificador (Subvenciones)',
        acceptsFiles: true,
        agent: grantJustificationAgent as any
    },
    'template_filler': {
        label: 'Rellenador AI de Plantillas',
        acceptsFiles: true,
        agent: templateFillerAgent as any
    }
};

export class MetaHandlerService {

    /**
     * CAPA BASE COMÚN — Punto de entrada del sistema Meta.
     * Gestiona las "Tres Bases" (Chat Memory, Doc Memory, Titling) y delega al Especialista.
     */
    async processMessage(
        sessionId: string,
        userMessageContent: string,
        systemPrompt: string, // No se usa directamente aquí, se prefiere el prompt del especialista
        modelStr: string,
        historyPayload: any[], // Obsoleto, cargamos de BD
        documentContext: string, // Contexto que viene del webhook (transcripción fresca)
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
                message: `Especialista "${metaId}" no encontrado.`,
                timestamp: new Date().toISOString()
            };
        }

        console.log(`\n[MetaHandler] 🚀 --- START SPECIALIST: "${metaId}" ---`);

        // ══════════════════════════════════════════════════════════════
        // 🔲 BASE 1: MEMORIA DE ARCHIVOS (PERSISTENCIA TURNO A TURNO)
        // ══════════════════════════════════════════════════════════════
        if (files && files.length > 0) {
            metaMemoryService.saveSessionFiles(sessionId, metaId, files);
        }
        const allSessionFiles = metaMemoryService.getSessionFiles(sessionId, metaId);

        // ══════════════════════════════════════════════════════════════
        // 🔲 BASE 2: MEMORIA DE DOCUMENTOS (RESILIENTE)
        // ══════════════════════════════════════════════════════════════
        const finalDocContext = await metaMemoryService.getEffectiveContext(sessionId, metaId, documentContext);

        // ══════════════════════════════════════════════════════════════
        // 🔲 BASE 3: MEMORIA DE CONVERSACIÓN (AISLADA)
        // ══════════════════════════════════════════════════════════════
        const history = await metaMemoryService.getMetaChatHistory(sessionId, metaId);

        // ══════════════════════════════════════════════════════════════
        // 🔲 AUTO-TITULADO (FIRE & FORGET)
        // ══════════════════════════════════════════════════════════════
        if (userMessageContent) {
            titleGeneratorAutomation.generateTitleAsync(sessionId, userMessageContent, 'meta-assistant', metaId).catch(e => {
                console.error('[MetaHandler] Title error:', e);
            });
        }

        // GUARDAR MENSAJE USUARIO EN BD (AISLADO)
        await metaMemoryService.saveMessage(sessionId, metaId, 'human', userMessageContent);

        // ══════════════════════════════════════════════════════════════
        // 🔴 EJECUCIÓN DEL ESPECIALISTA (Lógica de Negocio)
        // ══════════════════════════════════════════════════════════════
        const context: MetaContext = {
            sessionId,
            metaId,
            userMessage: userMessageContent,
            files: allSessionFiles,
            docContext: finalDocContext,
            history: history,
            model: modelStr
        };

        const specialistResult: MetaResult = await config.agent.run(context);

        // ══════════════════════════════════════════════════════════════
        // 🔲 POST-PROCESADO: ARCHIVOS GENERADOS Y PERSISTENCIA AI
        // ══════════════════════════════════════════════════════════════
        
        if (specialistResult?.generated_files && specialistResult.generated_files.length > 0) {
            // Mapear bucket por especialista
            const BUCKET_MAP: Record<string, string> = {
                'template_filler': 'template-filler-files',
                'grant_justification': 'grant-justification-files'
            };
            const targetBucket = BUCKET_MAP[metaId] || process.env.SUPABASE_STORAGE_BUCKET || 'olawee-files';

            for (const file of specialistResult.generated_files) {
                if (file.buffer) {
                    try {
                        const publicUrl = await supabaseStorageService.uploadBuffer(
                            file.buffer, 
                            file.filename, 
                            file.mimetype || 'application/octet-stream',
                            targetBucket
                        );
                        file.url = publicUrl;
                        
                        const linkText = `\n\n📄 **Descargar:** [${file.filename}](${publicUrl})`;
                        
                        if (specialistResult.ai_response.includes('{{FILE_LINK}}')) {
                            specialistResult.ai_response = specialistResult.ai_response.replace('{{FILE_LINK}}', linkText);
                        } else {
                            specialistResult.ai_response += linkText;
                        }
                        
                        delete file.buffer;
                    } catch (err: any) {
                        console.error(`[MetaHandler] Error upload:`, err.message);
                    }
                }
            }
        }

        // GUARDAR RESPUESTA IA EN BD (AISLADA)
        if (specialistResult?.ai_response) {
            await metaMemoryService.saveMessage(sessionId, metaId, 'ai', specialistResult.ai_response);
        }

        return specialistResult;
    }
}

export const metaHandlerService = new MetaHandlerService();
