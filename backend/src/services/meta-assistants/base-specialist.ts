import { MetaContext, MetaResult } from './meta.types';

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
    public async run(context: MetaContext): Promise<MetaResult> {
        console.log(`[${this.getName()}] 🚀 Inyectando Bases (Memory + Docs + Files)`);
        
        try {
            return await this.execute(context);
        } catch (error: any) {
            console.error(`[${this.getName()}] ❌ Execution Error:`, error.message);
            return {
                status: 'error',
                ai_response: `Lo siento, el asistente ${context.metaId} ha tenido un error: ${error.message}`,
                specialist: context.metaId,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Lógica pura del asistente (donde ocurre la magia de la IA).
     */
    protected abstract execute(context: MetaContext): Promise<MetaResult>;

    /**
     * Nombre descriptivo para logs.
     */
    protected abstract getName(): string;

    /**
     * Utilidad: Clasifica archivos por tipo para facilitar el procesamiento.
     */
    protected categorizeFiles(files: Express.Multer.File[]) {
        return {
            excels: files.filter(f => f.originalname.toLowerCase().endsWith('.xlsx') || f.originalname.toLowerCase().endsWith('.xls') || f.originalname.toLowerCase().endsWith('.csv')),
            pdfs: files.filter(f => f.mimetype === 'application/pdf' || f.originalname.toLowerCase().endsWith('.pdf')),
            images: files.filter(f => f.mimetype.startsWith('image/')),
            docs: files.filter(f => f.originalname.toLowerCase().endsWith('.docx') || f.originalname.toLowerCase().endsWith('.doc'))
        };
    }
}
