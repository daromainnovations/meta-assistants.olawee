import { BaseMessage } from "@langchain/core/messages";
import { GenericFile } from '../shared/document.service';

/**
 * Contexto unificado que el Handler le entrega a CUALQUIER meta-asistente.
 * Garantiza que las "Tres Bases" (Historia, Documentos, Título) estén presentes.
 */
export interface MetaContext {
    sessionId: string;
    metaId: string;
    userMessage: string;
    files: GenericFile[];
    docContext: string;           // Memoria de Documentos (systemprompt_doc)
    history: BaseMessage[];       // Memoria de Conversación
    model: string;                // Modelo Gemini configurado
}

/**
 * Resultado estandarizado que devuelve un especialista.
 */
export interface MetaResult {
    status: 'success' | 'error';
    ai_response: string;
    specialist: string;
    generated_files?: {
        filename: string;
        buffer?: Buffer;
        url?: string;
        mimetype?: string;
    }[];
    timestamp: string;
    metadata?: any;
}
