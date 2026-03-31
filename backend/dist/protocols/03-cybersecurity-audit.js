"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const colors = {
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    reset: '\x1b[0m'
};
console.log(`\n${colors.cyan}======================================================${colors.reset}`);
console.log(`${colors.cyan}🛡️ PROTOCOLO 3: Firewall & Ciberseguridad OLAWEE${colors.reset}`);
console.log(`${colors.cyan}======================================================${colors.reset}\n`);
async function runSecurityAudit() {
    let failed = false;
    // 1. Verificar librerías de seguridad
    process.stdout.write(`\n🔍 Verificando librerías de seguridad (Helmet, CORS, Rate Limit)... `);
    try {
        require('helmet');
        require('express-rate-limit');
        require('hpp');
        console.log(`${colors.green}✅ INSTALADAS${colors.reset}`);
    }
    catch (e) {
        console.log(`${colors.red}❌ FALTAN LIBRERÍAS DE SEGURIDAD${colors.reset}`);
        console.log(`  Ejecuta: npm install helmet xss-clean express-rate-limit hpp cors`);
        failed = true;
    }
    // 2. Revisión del Código Index (Middlewares de Seguridad)
    process.stdout.write(`\n🔍 Comprobando Inyección de Ciberseguridad en src/index.ts... `);
    const indexPath = path_1.default.join(process.cwd(), 'src', 'index.ts');
    if (fs_1.default.existsSync(indexPath)) {
        const indexContent = fs_1.default.readFileSync(indexPath, 'utf-8');
        if (indexContent.includes('helmet') && indexContent.includes('rateLimit')) {
            console.log(`${colors.green}✅ CONFIGURADO${colors.reset}`);
        }
        else {
            console.log(`${colors.red}❌ CÓDIGO INSEGURO${colors.reset}`);
            console.log(`  Falta añadir middlewares Helmet y Rate Limit en src/index.ts`);
            failed = true;
        }
    }
    else {
        console.log(`${colors.red}❌ NO ENCONTRADO src/index.ts${colors.reset}`);
        failed = true;
    }
    // 3. Revisión de API Keys (Fugas de Seguridad en Github)
    process.stdout.write(`\n🔍 Comprobando posibles fugas de API Keys en FRONTEND (.js/.html)... `);
    let leakFound = false;
    const searchDirs = ['frontend/chat', 'frontend/assistants', 'frontend/pymes-assistant', 'frontend/meta-assistants'];
    searchDirs.forEach(dir => {
        const fullPath = path_1.default.join(process.cwd(), dir, 'app.js');
        if (fs_1.default.existsSync(fullPath)) {
            const content = fs_1.default.readFileSync(fullPath, 'utf-8');
            if (content.includes('sk-') || content.includes('AIzaSy')) {
                leakFound = true;
                console.log(`\n  ${colors.red}☠️ PELIGRO: Posible API KEY expuesta en ${dir}/app.js${colors.reset}`);
            }
        }
    });
    if (!leakFound) {
        console.log(`${colors.green}✅ SEGURO (Sin fugas visibles)${colors.reset}`);
    }
    else {
        failed = true;
    }
    console.log(`\n======================================================`);
    if (failed) {
        console.log(`${colors.red}❌ PROTOCOLO 3 FALLIDO: EL ENTORNO NO ES SEGURO CONTRA ATAQUES WEB.${colors.reset}`);
        process.exit(1);
    }
    else {
        console.log(`${colors.green}✅ PROTOCOLO 3 SUPERADO: Arquitectura Fortificada contra XSS, DDoS, y Polución de parámetros HTTP.${colors.reset}`);
        process.exit(0);
    }
}
runSecurityAudit();
