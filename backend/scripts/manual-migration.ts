import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Iniciando migración manual de meta_billing...');

  try {
    // Añadir columnas a UsageEvent
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "meta_billing"."UsageEvent" 
      ADD COLUMN IF NOT EXISTS "tokens_input" INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "tokens_output" INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "cost_usd" DECIMAL(10, 6),
      ADD COLUMN IF NOT EXISTS "model_used" TEXT;
    `);
    console.log('✅ Columnas añadidas a meta_billing.UsageEvent');

    console.log('🎉 Migración completada con éxito.');
  } catch (error) {
    console.error('❌ Error durante la migración:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
