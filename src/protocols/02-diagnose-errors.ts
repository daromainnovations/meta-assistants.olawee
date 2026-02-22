import fs from 'fs';
import path from 'path';

const colors = {
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    reset: '\x1b[0m'
};

const logPath = path.join(process.cwd(), 'logs', 'olawee-error.log');

console.log(`\n${colors.cyan}======================================================${colors.reset}`);
console.log(`${colors.cyan}🩺 PROTOCOLO 2: Herramienta de Diagnóstico OLAWEE${colors.reset}`);
console.log(`${colors.cyan}======================================================${colors.reset}\n`);

if (!fs.existsSync(logPath)) {
    console.log(`${colors.green}✅ OLAWEE está en perfecto estado. No se han detectado caídas críticas (El archivo de crash-report está vacío o no existe).${colors.reset}\n`);
    process.exit(0);
}

const content = fs.readFileSync(logPath, 'utf8');

if (content.trim().length === 0) {
    console.log(`${colors.green}✅ OLAWEE está en perfecto estado. El historial de errores está en blanco.${colors.reset}\n`);
    process.exit(0);
}

console.log(`${colors.yellow}⚠️ ATENCIÓN: Se han encontrado registros de errores críticos en el archivo 'logs/olawee-error.log'.\n${colors.reset}`);

console.log(`Copia todo el bloque a continuación y pásaselo a tu Agente AI (Antigravity):\n`);

console.log(`${colors.cyan}--- INICIO DEL REPORTE PARA COPIAR ---${colors.reset}`);
console.log(content);
console.log(`${colors.cyan}--- FIN DEL REPORTE ---${colors.reset}\n`);

console.log(`💡 Nota: Puedes borrar el archivo logs/olawee-error.log en cualquier momento para reiniciar el registro.\n`);
process.exit(0);
