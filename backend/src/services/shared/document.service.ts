import { documentAnalysisService } from './document-analysis.service';



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

export interface GenericFile {
    originalname: string;
    mimetype: string;
    size: number;
    buffer?: Buffer; // Para compatibilidad con legacy/multer
    arrayBuffer?: () => Promise<ArrayBuffer>; // Para Web API File
}

export class DocumentService {

    /**
     * Procesa documentos recibidos. Soporta tanto archivos de Multer (legacy)
     * como archivos de la Web API (Next.js / NextRequest).
     */
    async processDocuments(provider: string, files: GenericFile[], meta: any): Promise<TranscriptionResult> {
        console.log(`[DocumentService] Processing ${files.length} documents for ${provider}`);

        let allNewContent = '';
        let lastDocType = 'unknown';

        for (const file of files) {
            console.log(`[DocumentService] File: ${file.originalname} (${file.mimetype}, ${file.size} bytes)`);
            let transcription = '';
            let docType = 'unknown';

            try {
                // Obtener Buffer independientemente del origen (Multer o Web API)
                let buffer: Buffer;
                if (file.buffer) {
                    buffer = file.buffer;
                } else if (file.arrayBuffer) {
                    buffer = Buffer.from(await file.arrayBuffer());
                } else {
                    throw new Error('No buffer or arrayBuffer found in file object');
                }

                // 1. Transcribir según tipo de archivo
                if (file.mimetype === 'application/pdf') {
                    docType = 'PDF';
                    transcription = await documentAnalysisService.transcribePDF(buffer);
                } else if (file.mimetype.includes('spreadsheet') || file.mimetype.includes('excel') || file.originalname.endsWith('.xlsx')) {
                    docType = 'Excel';
                    transcription = await documentAnalysisService.transcribeExcel(buffer);
                } else if (file.originalname.endsWith('.docx') || file.originalname.endsWith('.doc')) {
                    docType = 'DOC';
                    transcription = await documentAnalysisService.transcribeDoc(buffer);
                } else if (file.mimetype.startsWith('image/')) {
                    docType = 'Imagen';
                    transcription = await documentAnalysisService.describeImageWithGemini(buffer, file.mimetype);
                } else {
                    docType = 'Texto';
                    transcription = buffer.toString('utf-8');
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
