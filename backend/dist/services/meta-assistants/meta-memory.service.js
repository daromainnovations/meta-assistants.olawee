"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metaMemoryService = exports.MetaMemoryService = void 0;
const messages_1 = require("@langchain/core/messages");
const prisma_service_1 = require("../shared/prisma.service");
/**
 * ============================================================
 * 🧪 META MEMORY SERVICE
 * Gestiona el historial de conversaciones del modo Meta
 * Tablas: chatsmeta / mensajesmeta
 * ============================================================
 */
class MetaMemoryService {
    constructor() {
        // 🎯 Caché temporal en memoria para buffers de archivos (evita amnesia entre turnos)
        this.sessionFilesCache = new Map();
        this.sessionContextCache = new Map();
        this.sessionTimeouts = new Map();
        this.SESSION_TTL = 30 * 60 * 1000; // 30 minutos
    }
    /**
     * Refresca el temporizador de vida de una sesión.
     * Si no hay actividad en 30 min, se limpia la caché de esa sesión.
     */
    refreshSession(sessionId) {
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
    async getMetaChatHistory(sessionId) {
        const db = (0, prisma_service_1.getPrisma)();
        console.log(`[MetaMemory] Loading chat history for session: ${sessionId}`);
        try {
            const mensajes = await db.mensajesmeta.findMany({
                where: { session_id: sessionId },
                orderBy: { id: 'asc' }
            });
            const langChainMessages = [];
            for (const msg of mensajes) {
                if (!msg.message)
                    continue;
                const payload = msg.message;
                if (payload.type === 'human' && payload.content) {
                    langChainMessages.push(new messages_1.HumanMessage(payload.content));
                }
                else if (payload.type === 'ai' && payload.content) {
                    langChainMessages.push(new messages_1.AIMessage(payload.content));
                }
                else if (payload.type === 'system' && payload.content) {
                    langChainMessages.push(new messages_1.SystemMessage(payload.content));
                }
            }
            console.log(`[MetaMemory] Loaded ${langChainMessages.length} messages for session.`);
            return langChainMessages;
        }
        catch (error) {
            console.error(`[MetaMemory] Error fetching history for session ${sessionId}:`, error);
            return [];
        }
    }
    /**
     * Guarda el contexto (transcripción) en la caché de sesión.
     */
    saveSessionContext(sessionId, context) {
        if (context && context.trim().length > 0) {
            this.sessionContextCache.set(sessionId, context);
            this.refreshSession(sessionId); // 🔥 Refrescar vida
        }
    }
    /**
     * Recupera el mejor contexto disponible para la sesión.
     * Prioridad: Caché de Memoria > Base de Datos.
     */
    async getEffectiveContext(sessionId, currentContext) {
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
    async getDocumentContext(sessionId) {
        const db = (0, prisma_service_1.getPrisma)();
        try {
            const row = await db.chatsmeta.findFirst({
                where: { session_id: sessionId },
                orderBy: { created_at: 'desc' }
            });
            const context = row?.systemprompt_doc || '';
            // Si lo encontramos en la BD, lo subimos a la caché de memoria para la próxima
            if (context)
                this.saveSessionContext(sessionId, context);
            return context;
        }
        catch (error) {
            console.error('[MetaMemory] Error loading doc context:', error);
            return '';
        }
    }
    /**
     * Guarda un mensaje de la conversación Meta en la BD
     */
    async saveMessage(sessionId, type, content) {
        const db = (0, prisma_service_1.getPrisma)();
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
        }
        catch (error) {
            console.error(`[MetaMemory] Error saving ${type} message for session ${sessionId}:`, error);
        }
    }
    // --- Persistencia de Archivos en Sesión ---
    /**
     * Guarda los archivos subidos en una caché temporal para la sesión
     */
    saveSessionFiles(sessionId, files) {
        if (!files || files.length === 0)
            return;
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
    getSessionFiles(sessionId) {
        return this.sessionFilesCache.get(sessionId) || [];
    }
}
exports.MetaMemoryService = MetaMemoryService;
exports.metaMemoryService = new MetaMemoryService();
