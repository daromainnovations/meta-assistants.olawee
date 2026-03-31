import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { getPrisma } from '../shared/prisma.service';

/**
 * ============================================================
 * 🧪 META MEMORY SERVICE
 * Gestiona el historial de conversaciones del modo Meta
 * Tablas: chatsmeta / mensajesmeta
 * ============================================================
 */
export class MetaMemoryService {

    // 🎯 Caché temporal en memoria para buffers de archivos e hilos (aislamiento por Meta ID)
    private sessionFilesCache = new Map<string, Express.Multer.File[]>();
    private sessionContextCache = new Map<string, string>();
    private sessionTimeouts = new Map<string, NodeJS.Timeout>();

    private readonly SESSION_TTL = 30 * 60 * 1000; // 30 minutos

    private getCacheKey(sessionId: string, metaId: string): string {
        return `${sessionId}_${metaId}`;
    }

    /**
     * Refresca el temporizador de vida de una sesión aislada.
     */
    private refreshSession(sessionId: string, metaId: string) {
        const key = this.getCacheKey(sessionId, metaId);
        if (this.sessionTimeouts.has(key)) {
            clearTimeout(this.sessionTimeouts.get(key));
        }

        const timeout = setTimeout(() => {
            console.log(`[MetaMemory] 🧹 TTL Expirado. Limpiando caché aislada: ${key}`);
            this.sessionFilesCache.delete(key);
            this.sessionContextCache.delete(key);
            this.sessionTimeouts.delete(key);
        }, this.SESSION_TTL);

        this.sessionTimeouts.set(key, timeout);
    }

    /**
     * Recupera el historial de chat AISLADO por Meta ID
     */
    async getMetaChatHistory(sessionId: string, metaId: string): Promise<BaseMessage[]> {
        const db = getPrisma();
        console.log(`[MetaMemory] Loading isolated chat history for: ${sessionId} (Specialist: ${metaId})`);

        try {
            const mensajes = await db.mensajesmeta.findMany({
                where: { session_id: sessionId },
                orderBy: { id: 'asc' }
            });

            const langChainMessages: BaseMessage[] = [];

            for (const msg of mensajes) {
                if (!msg.message) continue;
                const payload = msg.message as { type?: string; content?: string; meta_id?: string };

                // FILTRADO ESTRICTO: Solo mensajes de este especialista (o globales si no tienen ID pero el usuario lo permite)
                if (payload.meta_id !== metaId) continue;

                if (payload.type === 'human' && payload.content) {
                    langChainMessages.push(new HumanMessage(payload.content));
                } else if (payload.type === 'ai' && payload.content) {
                    langChainMessages.push(new AIMessage(payload.content));
                } else if (payload.type === 'system' && payload.content) {
                    langChainMessages.push(new SystemMessage(payload.content));
                }
            }

            console.log(`[MetaMemory] Loaded ${langChainMessages.length} isolated messages.`);
            return langChainMessages;

        } catch (error) {
            console.error(`[MetaMemory] Error fetching history:`, error);
            return [];
        }
    }

    /**
     * Guarda el contexto (transcripción) en la caché de sesión aislada.
     */
    saveSessionContext(sessionId: string, metaId: string, context: string) {
        if (context && context.trim().length > 0) {
            const key = this.getCacheKey(sessionId, metaId);
            this.sessionContextCache.set(key, context);
            this.refreshSession(sessionId, metaId);
        }
    }

    /**
     * Recupera el mejor contexto disponible (Aislado)
     */
    async getEffectiveContext(sessionId: string, metaId: string, currentContext?: string): Promise<string> {
        if (currentContext && currentContext.trim().length > 10) {
            this.saveSessionContext(sessionId, metaId, currentContext);
            return currentContext;
        }

        const key = this.getCacheKey(sessionId, metaId);
        const cached = this.sessionContextCache.get(key);
        if (cached) {
            this.refreshSession(sessionId, metaId);
            return cached;
        }

        return await this.getDocumentContext(sessionId, metaId);
    }

    /**
     * Recupera el contexto AISLADO desde la tabla chatsmeta
     */
    async getDocumentContext(sessionId: string, metaId: string): Promise<string> {
        const db = getPrisma();
        try {
            const row = await db.chatsmeta.findFirst({ 
                where: { 
                    session_id: sessionId,
                    meta_id: metaId
                },
                orderBy: { created_at: 'desc' }
            });
            const context = row?.systemprompt_doc || '';
            if (context) this.saveSessionContext(sessionId, metaId, context);
            return context;
        } catch (error) {
            console.error('[MetaMemory] Error loading isolated doc context:', error);
            return '';
        }
    }

    /**
     * Guarda un mensaje de la conversación Meta AISLADO por Meta ID
     */
    async saveMessage(sessionId: string, metaId: string, type: 'human' | 'ai' | 'system', content: string) {
        const db = getPrisma();
        try {
            await db.mensajesmeta.create({
                data: {
                    session_id: sessionId,
                    message: {
                        type,
                        content,
                        meta_id: metaId, // 🔒 AISLAMIENTO
                        timestamp: new Date().toISOString()
                    }
                }
            });
            console.log(`[MetaMemory] Isolated message (${type}) saved for: ${sessionId} (${metaId})`);
        } catch (error) {
            console.error(`[MetaMemory] Error saving message:`, error);
        }
    }

    /**
     * Guarda los archivos subidos en una caché temporal AISLADA
     */
    saveSessionFiles(sessionId: string, metaId: string, files: Express.Multer.File[]) {
        if (!files || files.length === 0) return;
        
        const key = this.getCacheKey(sessionId, metaId);
        const existing = this.sessionFilesCache.get(key) || [];
        const filteredExisting = existing.filter(ex => !files.some(f => f.originalname === ex.originalname));
        
        this.sessionFilesCache.set(key, [...filteredExisting, ...files]);
        this.refreshSession(sessionId, metaId);
        
        console.log(`[MetaMemory] 💾 Guardados ${files.length} archivos en caché AISLADA para: ${key}`);
    }

    /**
     * Recupera los archivos guardados para esta sesión aislada
     */
    getSessionFiles(sessionId: string, metaId: string): Express.Multer.File[] {
        const key = this.getCacheKey(sessionId, metaId);
        return this.sessionFilesCache.get(key) || [];
    }
}

export const metaMemoryService = new MetaMemoryService();
