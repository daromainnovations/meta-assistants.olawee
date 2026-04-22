import { MetaContext, MetaResult, MetaStreamEvent } from './meta.types';
import { GenericFile } from '../shared/document.service';

/**
 * 🔲 BASE META SPECIALIST
 * Clase abstracta que todos los meta-asistentes deben extender.
 * Garantiza la consistencia en el manejo de memoria y documentos.
 */
export abstract class BaseMetaSpecialist {

    /**
     * Punto de entrada principal (invocado por el MetaHandler).
     * El desarrollador solo implementa 'execute'.
     */
    public async *run(context: MetaContext): AsyncGenerator<MetaStreamEvent, any, unknown> {
        console.log(`[${this.getName()}] 🚀 Inyectando Bases (Memory + Docs + Files)`);

        try {
            const finalResult = yield* this.execute(context);
            // IMPORTANTE: Un 'for await' ignora el 'return' final de un generador.
            // Para que el frontend y el orquestador lo capturen, debemos emitirlo explícitamente como 'done'.
            yield { type: 'done', result: finalResult };
            return finalResult;
        } catch (error: any) {
            console.error(`[${this.getName()}] ❌ Execution Error:`, error.message);
            const errResult: MetaResult = {
                status: 'error',
                ai_response: `Lo siento, el asistente ${context.metaId} ha tenido un error: ${error.message}`,
                specialist: context.metaId,
                timestamp: new Date().toISOString()
            };
            yield { type: 'done', result: errResult };
            return errResult;
        }
    }

    /**
     * Lógica pura del asistente (donde ocurre la magia de la IA).
     */
    protected abstract execute(context: MetaContext): AsyncGenerator<MetaStreamEvent, any, unknown>;

    /**
     * Nombre descriptivo para logs.
     */
    protected abstract getName(): string;

    /**
     * Utilidad: Clasifica archivos por tipo para facilitar el procesamiento.
     */
    protected categorizeFiles(files: GenericFile[]) {
        return {
            excels: files.filter(f => f.originalname.toLowerCase().endsWith('.xlsx') || f.originalname.toLowerCase().endsWith('.xls') || f.originalname.toLowerCase().endsWith('.csv')),
            pdfs: files.filter(f => f.mimetype === 'application/pdf' || f.originalname.toLowerCase().endsWith('.pdf')),
            images: files.filter(f => f.mimetype.startsWith('image/')),
            docs: files.filter(f => f.originalname.toLowerCase().endsWith('.docx') || f.originalname.toLowerCase().endsWith('.doc'))
        };
    }
}
