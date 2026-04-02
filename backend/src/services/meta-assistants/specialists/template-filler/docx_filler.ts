import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import * as xpath from 'xpath';

const select = xpath.useNamespaces({
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
});

/**
 * 🔍 ANALIZADOR DE ESTRUCTURA DOCX (NIVEL PRO - DOM)
 */
export async function getDocxStructure(buffer: Buffer): Promise<{ id: string, text: string }[]> {
    try {
        const zip = new PizZip(buffer);
        const xml = zip.file('word/document.xml')?.asText() || '';
        const doc = new DOMParser().parseFromString(xml);
        
        const paragraphs = select('//w:p', doc) as Node[];
        const blocks: { id: string, text: string }[] = [];

        paragraphs.forEach((p, index) => {
            const textContent = p.textContent?.trim() || '';
            if (textContent.length > 0) {
                blocks.push({ id: `ID_${index + 1}`, text: textContent });
            }
        });

        console.log(`[DocxFiller] 📊 Estructura DOM: ${blocks.length} bloques detectados.`);
        return blocks;
    } catch (error) {
        console.error('[DocxFiller] ❌ Error DOM:', error);
        return [];
    }
}

/**
 * 📝 DOCX FILLER (NIVEL PRO - SURGICAL DOM INJECTION)
 */
export async function fillDocxTemplate(buffer: Buffer, data: Record<string, any>): Promise<Buffer> {
    const debugLogPath = path.join(process.cwd(), 'fill_debug.log');
    const writeLog = (msg: string) => fs.appendFileSync(debugLogPath, `[${new Date().toISOString()}] ${msg}\n`);

    try {
        writeLog(`--- Iniciando Edición Pro ---`);
        const zip = new PizZip(buffer);
        
        // NORMALIZACIÓN DE LLAVES (Evitar fallos id_1 vs ID_1)
        const normalizedData: Record<string, any> = {};
        for (const [key, value] of Object.entries(data)) {
            normalizedData[key.trim().toUpperCase()] = value;
        }
        writeLog(`DATOS RECIBIDOS: ${JSON.stringify(Object.keys(normalizedData))}`);

        // --- PASO 1: DOCXTEMPLATER (MOTOR TAGS) ---
        let zipWithTags = zip;
        try {
            const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
            doc.render(normalizedData);
            zipWithTags = doc.getZip();
        } catch (e: any) {
            writeLog(`⚠️ Docxtemplater bypass: ${e.message}`);
        }

        // --- PASO 2: INYECCIÓN QUIRÚRGICA DOM (MOTOR ESTRUCTURAL) ---
        const serializer = new XMLSerializer();
        const parser = new DOMParser();

        const processFileDOM = (xml: string, isMain: boolean): string => {
            const doc = parser.parseFromString(xml);
            const paragraphs = select('//w:p', doc) as any[];

            paragraphs.forEach((p, index) => {
                const currentId = `ID_${index + 1}`;
                
                // SUSTITUCIÓN POR ID (Prioridad Word)
                if (isMain && normalizedData[currentId]) {
                    writeLog(`🎯 REEMPLAZO DOM ID ${currentId}: "${normalizedData[currentId]}"`);
                    fillParagraph(p, String(normalizedData[currentId]), doc);
                    return;
                }

                // SMART MATCH (Si el texto coincide exactamente con una clave larga)
                const text = p.textContent || '';
                for (const [key, value] of Object.entries(normalizedData)) {
                    if (!key.startsWith('ID_') && key.length > 5 && text.includes(key)) {
                        writeLog(`🎯 SMART MATCH DOM: "${key}" -> "${value}"`);
                        fillParagraph(p, String(value), doc);
                        break;
                    }
                }
            });

            return serializer.serializeToString(doc);
        };

        function fillParagraph(pNode: any, text: string, ownerDoc: any) {
            // 1. Localizar o conservar pPr (Formato del párrafo)
            const pPr = select('w:pPr', pNode, true) as any;
            
            // 2. Limpiar todos los hijos excepto pPr
            const children = Array.from(pNode.childNodes);
            children.forEach((child: any) => {
                if (child.nodeName !== 'w:pPr') {
                    pNode.removeChild(child);
                }
            });

            // 3. Inyectar nuevo contenido como un solo bloque limpio
            const rNode = ownerDoc.createElement('w:r');
            const tNode = ownerDoc.createElement('w:t');
            
            // Reemplazar saltos de línea por nodos <w:br/>
            const lines = text.split('\n');
            lines.forEach((line, idx) => {
                const textNode = ownerDoc.createTextNode(line);
                tNode.appendChild(textNode);
                if (idx < lines.length - 1) {
                    tNode.appendChild(ownerDoc.createElement('w:br'));
                }
            });

            rNode.appendChild(tNode);
            pNode.appendChild(rNode);
        }

        const mainDocXml = zipWithTags.file('word/document.xml')?.asText();
        if (mainDocXml) {
            zipWithTags.file('word/document.xml', processFileDOM(mainDocXml, true));
        }

        const headers = ['word/header1.xml', 'word/header2.xml', 'word/header3.xml'];
        headers.forEach(h => {
            const xml = zipWithTags.file(h)?.asText();
            if (xml) zipWithTags.file(h, processFileDOM(xml, false));
        });

        return zipWithTags.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    } catch (error: any) {
        writeLog(`❌ ERROR DOM: ${error.message}`);
        throw error;
    }
}
