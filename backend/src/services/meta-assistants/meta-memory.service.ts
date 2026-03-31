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

    // 🎯 Caché temporal en memoria para buffers de archivos (evita amnesia entre turnos)
    private sessionFilesCache = new Map<string, Express.Multer.File[]>();
    private sessionContextCache = new Map<string, string>();
    private sessionTimeouts = new Map<string, NodeJS.Timeout>();

    private readonly SESSION_TTL = 30 * 60 * 1000; // 30 minutos

    /**
     * Refresca el temporizador de vida de una sesión.
     * Si no hay actividad en 30 min, se limpia la caché de esa sesión.
     */
    private refreshSession(sessionId: string) {
        // Limpiar el timeout anterior si existe
        if (this.sessionTimeouts.has(sessionId)) {
            clearTimeout(this.sessionTimeouts.get(sessionId));
        }

        // Programar nueva limpieza
        const timeout = setTimeout(() => {
            console.log(`[MetaMemory] 🧹 TTL Expirado. Limpiando caché de sesión: ${sessionId}`);
            this.sessionFilesCache.delete(sessionId);
            this.sessionContextCache.delete(sessionId);
            this.sessionTimeouts.delete(sessionId);
        }, this.SESSION_TTL);

        this.sessionTimeouts.set(sessionId, timeout);
    }

    /**
     * Recupera el historial de chat de una sesión Meta desde la BD
     */
    async getMetaChatHistory(sessionId: string): Promise<BaseMessage[]> {
        const db = getPrisma();
        console.log(`[MetaMemory] Loading chat history for session: ${sessionId}`);

        try {
            const mensajes = await db.mensajesmeta.findMany({
                where: { session_id: sessionId },
                orderBy: { id: 'asc' }
            });

            const langChainMessages: BaseMessage[] = [];

            for (const msg of mensajes) {
                if (!msg.message) continue;
                const payload = msg.message as { type?: string; content?: string };

                if (payload.type === 'human' && payload.content) {
                    langChainMessages.push(new HumanMessage(payload.content));
                } else if (payload.type === 'ai' && payload.content) {
                    langChainMessages.push(new AIMessage(payload.content));
                } else if (payload.type === 'system' && payload.content) {
                    langChainMessages.push(new SystemMessage(payload.content));
                }
            }

            console.log(`[MetaMemory] Loaded ${langChainMessages.length} messages for session.`);
            return langChainMessages;

        } catch (error) {
            console.error(`[MetaMemory] Error fetching history for session ${sessionId}:`, error);
            return [];
        }
    }

    /**
     * Guarda el contexto (transcripción) en la caché de sesión.
     */
    saveSessionContext(sessionId: string, context: string) {
        if (context && context.trim().length > 0) {
            this.sessionContextCache.set(sessionId, context);
            this.refreshSession(sessionId); // 🔥 Refrescar vida
        }
    }

    /**
     * Recupera el mejor contexto disponible para la sesión.
     * Prioridad: Caché de Memoria > Base de Datos.
     */
    async getEffectiveContext(sessionId: string, currentContext?: string): Promise<string> {
        // 1. Si ya nos pasan un contexto válido en esta vuelta, lo usamos y actualizamos caché
        if (currentContext && currentContext.trim().length > 10) {
            this.saveSessionContext(sessionId, currentContext);
            return currentContext;
        }

        // 2. Intentar recuperar de la caché de memoria del servidor
        const cached = this.sessionContextCache.get(sessionId);
        if (cached) {
            this.refreshSession(sessionId); // 🔥 Refrescar vida (está activo)
            return cached;
        }

        // 3. Fallback final: Base de datos
        return await this.getDocumentContext(sessionId);
    }

    /**
     * Recupera el contexto documental guardado en la tabla chatsmeta.
     */
    async getDocumentContext(sessionId: string): Promise<string> {
        const db = getPrisma();
        try {
            const row = await db.chatsmeta.findFirst({ 
                where: { session_id: sessionId },
                orderBy: { created_at: 'desc' }
            });
            const context = row?.systemprompt_doc || '';
            // Si lo encontramos en la BD, lo subimos a la caché de memoria para la próxima
            if (context) this.saveSessionContext(sessionId, context);
            return context;
        } catch (error) {
            console.error('[MetaMemory] Error loading doc context:', error);
            return '';
        }
    }

    /**
     * Guarda un mensaje de la conversación Meta en la BD
     */
    async saveMessage(sessionId: string, type: 'human' | 'ai' | 'system', content: string) {
        const db = getPrisma();

        try {
            await db.mensajesmeta.create({
                data: {
                    session_id: sessionId,
                    message: {
                        type,
                        content,
                        timestamp: new Date().toISOString()
                    }
                }
            });
            console.log(`[MetaMemory] Message (${type}) saved for session: ${sessionId}`);
        } catch (error) {
            console.error(`[MetaMemory] Error saving ${type} message for session ${sessionId}:`, error);
        }
    }

    // --- Persistencia de Archivos en Sesión ---

    /**
     * Guarda los archivos subidos en una caché temporal para la sesión
     */
    saveSessionFiles(sessionId: string, files: Express.Multer.File[]) {
        if (!files || files.length === 0) return;
        
        // Obtenemos lo que ya hubiera para no sobrescribir, sino acumular o actualizar
        const existing = this.sessionFilesCache.get(sessionId) || [];
        
        // Evitamos duplicados por nombre si se suben de nuevo
        const filteredExisting = existing.filter(ex => !files.some(f => f.originalname === ex.originalname));
        this.sessionFilesCache.set(sessionId, [...filteredExisting, ...files]);
        
        this.refreshSession(sessionId); // 🔥 Refrescar vida
        console.log(`[MetaMemory] 💾 Guardados ${files.length} archivos en caché de sesión para: ${sessionId}`);
    }

    /**
     * Recupera los archivos guardados para esta sesión
     */
    getSessionFiles(sessionId: string): Express.Multer.File[] {
        return this.sessionFilesCache.get(sessionId) || [];
    }
}

export const metaMemoryService = new MetaMemoryService();
