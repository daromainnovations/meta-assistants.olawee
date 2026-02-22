import { documentAnalysisService } from './document-analysis.service';

import { getPrisma } from './prisma.service';

export interface TranscriptionResult {
    status: string;
    provider: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    docType: string;
    transcription: string;
    contentPreview: string;
    savedToDb: boolean;
}

export class DocumentService {

    /**
     * Procesa un documento recibido:
     * 1. Identifica el tipo de archivo y lo transcribe.
     * 2. Gestiona el guardado en la tabla 'prueba_chatsllms'.
     *    - Busca por 'session_id'.
     *    - Si 'systemprompt_doc' está vacío, inserta la transcripción.
     *    - Si ya tiene contenido, concatena el antiguo con el nuevo.
     * 3. Devuelve la transcripción para ser usada como contexto.
     */
    async processDocument(provider: string, file: Express.Multer.File, meta: any): Promise<TranscriptionResult> {
        console.log(`[DocumentService] Processing document for ${provider}`);
        console.log(`[DocumentService] File: ${file.originalname} (${file.mimetype}, ${file.size} bytes)`);

        let transcription = '';
        let docType = 'unknown';
        let savedToDb = false;

        try {
            // 1. Transcribir según tipo de archivo
            if (file.mimetype === 'application/pdf') {
                docType = 'PDF';
                transcription = await documentAnalysisService.transcribePDF(file.buffer);
            } else if (file.mimetype.includes('spreadsheet') || file.mimetype.includes('excel') || file.originalname.endsWith('.xlsx')) {
                docType = 'Excel';
                transcription = await documentAnalysisService.transcribeExcel(file.buffer);
            } else if (file.originalname.endsWith('.docx') || file.originalname.endsWith('.doc')) {
                docType = 'DOC';
                transcription = await documentAnalysisService.transcribeDoc(file.buffer);
            } else if (file.mimetype.startsWith('image/')) {
                docType = 'Imagen';
                transcription = await documentAnalysisService.describeImageWithGemini(file.buffer, file.mimetype);
            } else {
                docType = 'Texto';
                transcription = file.buffer.toString('utf-8');
            }

            // Formatear el contenido para que sea descriptivo
            const newContent = `[Archivo ${docType}: ${file.originalname}]\n${transcription}`;

            let finalPrompt = '';
            // 2. Gestionar guardado en 'prueba_chatsllms' o 'prueba_chatsassistants'
            const sessionId = meta?.session_id || meta?.sessionId || meta?.userId;

            if (sessionId) {
                try {
                    const db = getPrisma();
                    const isAssistant = provider === 'assistant' || provider === 'pymes-assistant';
                    const dbTable = isAssistant ? db.prueba_chatsassistants : db.prueba_chatsllms;

                    // Buscar si ya existe una fila para este usuario
                    const existingChat = await (dbTable as any).findFirst({
                        where: { session_id: sessionId }
                    });

                    if (existingChat && existingChat.systemprompt_doc) {
                        // Si ya tiene contenido, concatenamos
                        finalPrompt = `${existingChat.systemprompt_doc}\n\n${newContent}`;
                        console.log(`[DocumentService] Appending new content to existing prompt for ${sessionId} (Table: ${isAssistant ? 'prueba_chatsassistants' : 'prueba_chatsllms'})`);
                    } else {
                        // Si está vacío o no existe la fila, es el primer contenido
                        finalPrompt = newContent;
                        console.log(`[DocumentService] Setting initial prompt for ${sessionId} (Table: ${isAssistant ? 'prueba_chatsassistants' : 'prueba_chatsllms'})`);
                    }

                    // Actualizar o crear la fila (Find First & Create or Update)
                    if (existingChat) {
                        const updateData: any = { systemprompt_doc: finalPrompt, updated_at: new Date() };
                        if (isAssistant && meta?.id_assistant) updateData.id_assistant = meta.id_assistant;

                        await (dbTable as any).update({
                            where: { id: existingChat.id },
                            data: updateData
                        });
                    } else {
                        const createData: any = {
                            session_id: sessionId,
                            titulo: sessionId, // Optional placeholder
                            systemprompt_doc: finalPrompt
                        };
                        if (isAssistant && meta?.id_assistant) createData.id_assistant = meta.id_assistant;

                        await (dbTable as any).create({
                            data: createData
                        });
                    }

                    savedToDb = true;
                    console.log(`[DocumentService] ✅ Updated systemprompt_doc in ${isAssistant ? 'prueba_chatsassistants' : 'prueba_chatsllms'}`);
                } catch (dbError) {
                    const dbMsg = dbError instanceof Error ? dbError.message : String(dbError);
                    console.warn(`[DocumentService] ⚠️ DB update failed: ${dbMsg}`);
                    finalPrompt = newContent; // Fallback to just new content on db error
                }
            } else {
                console.warn('[DocumentService] ⚠️ No sessionId provided, skipping DB update.');
                finalPrompt = newContent;
            }

            return {
                status: 'success',
                provider,
                fileName: file.originalname,
                fileSize: file.size,
                mimeType: file.mimetype,
                docType,
                transcription: finalPrompt, // Aqui retornamos TODO el contenido concatenado
                contentPreview: newContent.substring(0, 200) + (newContent.length > 200 ? '...' : ''),
                savedToDb
            };

        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            console.error('[DocumentService] Error:', errMsg);
            return {
                status: 'error',
                provider,
                fileName: file.originalname,
                fileSize: file.size,
                mimeType: file.mimetype,
                docType,
                transcription: '',
                contentPreview: `Error: ${errMsg}`,
                savedToDb: false
            };
        }
    }
}

export const documentService = new DocumentService();
