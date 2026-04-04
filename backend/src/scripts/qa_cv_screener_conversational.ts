import { RankingGenerator } from '../services/meta-assistants/specialists/cv-screener/ranking_generator';
import * as fs from 'fs';
import * as path from 'path';

async function runE2E() {
  const sessionId = `test_hallucination_${Date.now()}`;
  console.log(`🚀 Test Hallucination Check (Session: ${sessionId})`);

  // No files in Turn 1
  const form1 = new FormData();
  form1.append('session_id', sessionId);
  form1.append('chatInput', 'hola');
  form1.append('meta_id', 'cv_screening_rrhh');

  try {
    console.log(`\n🚀 [Turno 1] Solo saludo ("hola")...`);
    const res1 = await fetch('http://localhost:8080/QAmeta-assistant-chat', {
      method: 'POST',
      body: form1,
      headers: { 'x-api-key': 'sk_webhook_secret_12345' }
    });
    
    const data1 = await res1.json() as any;
    console.log(`✅ [Turno 1] Respuesta recibida:`);
    console.log(`AI: ${data1.ai_response}`);

    console.log(`\n🚀 [Turno 2] Confirmando ranking...`);
    const form2 = new FormData();
    form2.append('session_id', sessionId);
    form2.append('chatInput', 'adelante, genera el ranking y el excel');
    form2.append('meta_id', 'cv_screening_rrhh');

    const res2 = await fetch('http://localhost:8080/QAmeta-assistant-chat', {
       method: 'POST',
       body: form2, 
       headers: { 'x-api-key': 'sk_webhook_secret_12345' }
    });
    const data2 = await res2.json() as any;
    console.log(`✅ [Turno 2] Resultado:`);
    console.log(`AI: ${data2.ai_response}`);

    if (data2.generated_files) {
        console.log("📁 EXCEL DETECTADO EN TURNO 2");
        console.log("URL:", data2.generated_files[0].url);
        console.log("\n✨ TEST EXITOSO: Flujo consultivo completado.");
    }

  } catch (error: any) {
    console.error(`❌ Error:`, error.message);
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
}

runE2E();
