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
    async processDocuments(provider: string, files: Express.Multer.File[], meta: any): Promise<TranscriptionResult> {
        console.log(`[DocumentService] Processing ${files.length} documents for ${provider}`);

        let allNewContent = '';
        let lastDocType = 'unknown';

        for (const file of files) {
            console.log(`[DocumentService] File: ${file.originalname} (${file.mimetype}, ${file.size} bytes)`);
            let transcription = '';
            let docType = 'unknown';

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

                // Concatenar el contenido formateado de todos los archivos procesados en esta petición
                allNewContent += `\n\n[Archivo ${docType}: ${file.originalname}]\n${transcription}`;
                lastDocType = docType;
            } catch (error) {
                const errMsg = error instanceof Error ? error.message : String(error);
                console.error(`[DocumentService] Error processing file ${file.originalname}:`, errMsg);
                allNewContent += `\n\n[Archivo ${file.originalname}]: Error procesando este archivo: ${errMsg}`;
            }
        }

        allNewContent = allNewContent.trim(); // Limpiar extremos

        return {
            status: 'success',
            provider: provider,
            fileName: files.length > 1 ? `${files.length} archivos` : (files[0]?.originalname || 'Sin nombre'),
            fileSize: files.reduce((acc, f) => acc + f.size, 0),
            mimeType: files.length > 1 ? 'multiple/files' : (files[0]?.mimetype || 'unknown'),
            docType: files.length > 1 ? 'MultiplesArchivos' : lastDocType,
            transcription: allNewContent,
            contentPreview: allNewContent.substring(0, 100) + '...',
            savedToDb: false // Persistence is now completely handled by webhook.service.ts
        };
    }
}

export const documentService = new DocumentService();
