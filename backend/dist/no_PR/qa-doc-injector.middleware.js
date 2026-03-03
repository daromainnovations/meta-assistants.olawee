"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.qaDocInjector = qaDocInjector;
const prisma_service_1 = require("../services/shared/prisma.service");
/**
 * Tabla de chat correspondiente a cada modo.
 * Aquí es donde se lee el systemprompt_doc almacenado.
 */
const TABLE_MAP = {
    llm: 'prueba_chatsllms',
    assistant: 'prueba_chatsassistants',
    pymes: 'prueba_chatspymes',
    beta: 'prueba_chatsbeta',
};
/**
 * Lee el systemprompt_doc de la tabla de chats para la sesión dada.
 */
async function getStoredDocContext(providerType, sessionId) {
    const db = (0, prisma_service_1.getPrisma)();
    try {
        const tableName = TABLE_MAP[providerType];
        // Prisma no admite tabla dinámica, así que usamos un switch tipado
        let record = null;
        switch (providerType) {
            case 'llm':
                record = await db.prueba_chatsllms.findFirst({
                    where: { session_id: sessionId },
                    select: { systemprompt_doc: true },
                    orderBy: { id: 'desc' }
                });
                break;
            case 'assistant':
                record = await db.prueba_chatsassistants.findFirst({
                    where: { session_id: sessionId },
                    select: { systemprompt_doc: true },
                    orderBy: { id: 'desc' }
                });
                break;
            case 'pymes':
                record = await db.prueba_chatspymes.findFirst({
                    where: { session_id: sessionId },
                    select: { systemprompt_doc: true },
                    orderBy: { id: 'desc' }
                });
                break;
            case 'beta':
                record = await db.prueba_chatsbeta.findFirst({
                    where: { session_id: sessionId },
                    select: { systemprompt_doc: true },
                    orderBy: { id: 'desc' }
                });
                break;
        }
        if (record?.systemprompt_doc && record.systemprompt_doc.trim() !== '') {
            return record.systemprompt_doc;
        }
        return null;
    }
    catch (err) {
        console.warn(`[QA-DocInjector] ⚠️ Error reading stored doc for session "${sessionId}": ${err.message}`);
        return null;
    }
}
/**
 * Middleware factory — crea un middleware para el provider dado.
 *
 * Uso en webhook.routes.ts:
 *   router.post('/gemini-chat', apiKeyMiddleware, handleUpload, qaDocInjector('llm'), handler)
 *
 * @param providerType - El tipo de proveedor ('llm' | 'assistant' | 'pymes' | 'beta')
 */
function qaDocInjector(providerType) {
    return async (req, res, next) => {
        const sessionId = req.body?.session_id;
        if (!sessionId) {
            // Sin session_id no hay nada que buscar
            return next();
        }
        // Los especialistas Beta (invoice_checker, etc.) gestionan sus propios archivos
        // y no usan systemprompt_doc. Los saltamos para no interferir.
        if (providerType === 'beta' && req.body?.beta_id) {
            console.log(`[QA-DocInjector] Skipping Beta Specialist "${req.body.beta_id}" — no systemprompt_doc needed.`);
            return next();
        }
        console.log(`[QA-DocInjector] Checking stored doc context for session "${sessionId}" [${providerType}]...`);
        const storedDoc = await getStoredDocContext(providerType, sessionId);
        if (!storedDoc) {
            console.log(`[QA-DocInjector] No stored doc found for session "${sessionId}". Continuing normally.`);
            return next();
        }
        const incomingDoc = req.body?.systemprompt_doc || '';
        const hasNewDoc = incomingDoc.trim() !== '';
        if (hasNewDoc) {
            // CONCATENAR: doc histórico de BD + nuevo doc del request
            console.log(`[QA-DocInjector] ✅ Concatenating stored doc + new doc for session "${sessionId}".`);
            req.body.systemprompt_doc =
                `[Contexto de sesión anterior]\n${storedDoc}\n\n---\n\n[Nuevo documento adjuntado]\n${incomingDoc}`;
        }
        else {
            // INYECTAR: solo el doc histórico (sin nuevo)
            console.log(`[QA-DocInjector] ✅ Injecting stored doc into request for session "${sessionId}".`);
            req.body.systemprompt_doc = storedDoc;
        }
        next();
    };
}
