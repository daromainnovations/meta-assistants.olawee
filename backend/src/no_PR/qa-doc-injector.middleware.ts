import { Request, Response, NextFunction } from 'express';
import { getPrisma } from '../services/shared/prisma.service';

// ============================================================
// 🚫 NO_PR — Solo entorno QA. NO usar en producción.
//
// En producción, el frontend real ya envía systemprompt_doc
// en cada request. Este middleware lo simula consultando la BD.
//
// Comportamiento:
//   - Sin doc nuevo + doc en BD → inyecta el de BD
//   - Con doc nuevo + doc en BD → concatena BD + nuevo
//   - Con doc nuevo + sin doc en BD → comportamiento normal
//   - Sin doc nuevo + sin doc en BD → no hace nada
// ============================================================

export type ProviderType = 'llm' | 'assistant' | 'meta';

/**
 * Tabla de chat correspondiente a cada modo.
 * Aquí es donde se lee el systemprompt_doc almacenado.
 */
const TABLE_MAP: Record<ProviderType, string> = {
    llm: 'prueba_chatsllms',
    assistant: 'prueba_chatsassistants',
    meta: 'prueba_chatsmeta',
};

/**
 * Lee el systemprompt_doc de la tabla de chats para la sesión dada.
 */
async function getStoredDocContext(providerType: ProviderType, sessionId: string): Promise<string | null> {
    const db = getPrisma();
    try {
        const tableName = TABLE_MAP[providerType];

        // Prisma no admite tabla dinámica, así que usamos un switch tipado
        let record: { systemprompt_doc?: string | null } | null = null;

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

            case 'meta':
                record = await db.prueba_chatsmeta.findFirst({
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

    } catch (err: any) {
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
 * @param providerType - El tipo de proveedor ('llm' | 'assistant' | 'meta')
 */
export function qaDocInjector(providerType: ProviderType) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const sessionId: string = req.body?.session_id;

        if (!sessionId) {
            // Sin session_id no hay nada que buscar
            return next();
        }

        // Los especialistas Meta (invoice_checker, etc.) gestionan sus propios archivos
        // y no usan systemprompt_doc. Los saltamos para no interferir.
        if (providerType === 'meta' && req.body?.meta_id) {
            console.log(`[QA-DocInjector] Skipping Meta Specialist "${req.body.meta_id}" — no systemprompt_doc needed.`);
            return next();
        }

        console.log(`[QA-DocInjector] Checking stored doc context for session "${sessionId}" [${providerType}]...`);

        const storedDoc = await getStoredDocContext(providerType, sessionId);

        if (!storedDoc) {
            console.log(`[QA-DocInjector] No stored doc found for session "${sessionId}". Continuing normally.`);
            return next();
        }

        const incomingDoc: string = req.body?.systemprompt_doc || '';
        const hasNewDoc = incomingDoc.trim() !== '';

        if (hasNewDoc) {
            // CONCATENAR: doc histórico de BD + nuevo doc del request
            console.log(`[QA-DocInjector] ✅ Concatenating stored doc + new doc for session "${sessionId}".`);
            req.body.systemprompt_doc =
                `[Contexto de sesión anterior]\n${storedDoc}\n\n---\n\n[Nuevo documento adjuntado]\n${incomingDoc}`;
        } else {
            // INYECTAR: solo el doc histórico (sin nuevo)
            console.log(`[QA-DocInjector] ✅ Injecting stored doc into request for session "${sessionId}".`);
            req.body.systemprompt_doc = storedDoc;
        }

        next();
    };
}
