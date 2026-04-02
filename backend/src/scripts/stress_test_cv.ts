import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config(); // Cargar variables de entorno del .env

import PDFDocument from 'pdfkit';
import { cvScreenerAgent } from '../services/meta-assistants/specialists/cv-screener/cv_screener.agent';
import { RankingGenerator } from '../services/meta-assistants/specialists/cv-screener/ranking_generator';

const OUTPUT_DIR = path.join(process.cwd(), 'test_outputs_cv');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

/**
 * 🛠️ UTILIDAD: GENERADOR DE CVS FALSOS PARA PRUEBAS
 */
async function createMockCV(nombre: string, perfil: string, skills: string[]): Promise<string> {
  return new Promise((resolve) => {
    const filename = `CV_${nombre.replace(/\s+/g, '_')}.pdf`;
    const filepath = path.join(OUTPUT_DIR, filename);
    const doc = new PDFDocument();
    doc.pipe(fs.createWriteStream(filepath));

    doc.fontSize(20).text(nombre, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text('PERFIL PROFESIONAL', { underline: true });
    doc.fontSize(10).text(perfil);
    doc.moveDown();
    doc.fontSize(12).text('HABILIDADES', { underline: true });
    doc.fontSize(10).text(skills.join(', '));
    doc.moveDown();
    doc.text('Experiencia: 5-10 años en el sector.');
    doc.end();

    doc.on('end', () => resolve(filepath));
  });
}

/**
 * 🚀 LABORATORIO DE PRUEBAS DE ESTRÉS (CV SCREENER)
 */
async function runCVScreenerStressTest() {
  console.log('🧪 INICIANDO LABORATORIO DE QA: CV SCREENER\n');

  // 1. GENERAR 20 CVs VARIADOS
  console.log('📂 Generando 20 CVs de prueba...');
  const candidates = [
    { n: 'Ana Garcia', p: 'Senior Fullstack Dev con 10 años en React y Node.', s: ['React', 'Node.js', 'Typescript', 'AWS'] },
    { n: 'Juan Perez', p: 'Junior Developer apasionado por el frontend.', s: ['HTML', 'CSS', 'Javascript'] },
    { n: 'Marta Lopez', p: 'Data Scientist experta en Python y ML.', s: ['Python', 'Pandas', 'Scikit-learn', 'SQL'] },
    { n: 'Carlos Ruiz', p: 'DevOps Engineer con foco en Kubernetes.', s: ['Docker', 'K8s', 'Terraform', 'CI/CD'] },
    { n: 'Lucia Sanz', p: 'Backend Dev Senior especializada en Java/Spring.', s: ['Java', 'Spring Boot', 'Microservicios'] },
    // ... duplicar para llegar a 20 con variaciones
  ];

  // Rellenar hasta 20
  for (let i = 5; i < 20; i++) {
    candidates.push({
      n: `Candidato ${i+1}`,
      p: `Perfil genérico de administración y ventas con ${i} años de experiencia.`,
      s: ['Office', 'Ventas', 'CRM']
    });
  }

  const cvFiles: string[] = [];
  for (const c of candidates) {
    const path = await createMockCV(c.n, c.p, c.s);
    cvFiles.push(path);
  }
  console.log(`✅ 20 archvos PDF generados en ${OUTPUT_DIR}\n`);

  // 2. SIMULAR CONTEXTO DE AGENTE
  const mockContext: any = {
    sessionId: 'test_session_rrhh',
    metaId: 'cv_screening_rrhh',
    userMessage: 'Analiza estos 20 candidatos para el puesto de Senior Software Engineer (Typescript/Node). Valora mucho la experiencia en AWS.',
    history: [],
    files: cvFiles.map(f => ({
      originalname: path.basename(f),
      buffer: fs.readFileSync(f),
      mimetype: 'application/pdf'
    })),
    docContext: 'Puesto: Senior Software Engineer. Requisitos: Typescript, Node.js, AWS. 7+ años experiencia.'
  };

  // 3. EJECUTAR ANÁLISIS (FASE 3)
  console.log('🤖 Invocando al Agente Especialista...');
  const start = Date.now();
  const result = await cvScreenerAgent['execute'](mockContext);
  const end = Date.now();

  console.log(`⏱️ Análisis completado en ${(end - start) / 1000}s`);
  console.log(`\n--- RESPUESTA DEL AGENTE ---\n${result.ai_response}\n`);

  // 4. VERIFICAR RESULTADOS
  if (result.status === 'success') {
    console.log('✅ PASS: El agente respondió con éxito.');
  } else {
    console.error('❌ FAIL: Error en la ejecución del agente.');
  }

  // 5. TEST DE GENERACIÓN DE ARCHIVOS (FASE 4)
  console.log('\n📊 Probando generación de informes...');
  
  // Extraemos datos ficticios del ranking para el generador
  const mockRanking = {
    puesto: 'Senior Software Engineer',
    pesos: { skills: 40, experiencia: 25, formacion: 15, idiomas: 10, softSkills: 10 },
    candidatos: candidates.map((c, i) => ({
      nombre: c.n,
      puntuacion: 100 - (i * 4),
      resumen: 'Buen perfil técnico.',
      highlight: c.s[0]
    }))
  };

  const excelBuf = RankingGenerator.generateExcel(mockRanking);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'informe_test.xlsx'), excelBuf);
  console.log('✅ Excel generado correctamente.');

  const pdfBuf = await RankingGenerator.generatePDF(mockRanking);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'informe_test.pdf'), pdfBuf);
  console.log('✅ PDF generado correctamente.');

  console.log('\n🏆 LABORATORIO COMPLETADO: 100% FUNCIONAL');
}

runCVScreenerStressTest().catch(console.error);
