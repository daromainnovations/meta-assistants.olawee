"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailService = exports.EmailService = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
class EmailService {
    constructor() {
        // Configuramos el transporte SMTP para enviar emails (Protocolo 5)
        this.transporter = nodemailer_1.default.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: Number(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true', // true para puerto 465, false para otros
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS // Se recomienda usar App Passwords en caso de Gmail
            }
        });
    }
    /**
     * Envia un email de alerta critica (Protocolo 5)
     */
    async sendCrashAlert(errorTitle, errorMessage, stackTrace) {
        // Si no hay configuracion en el .env, omitimos enviar para no generar error sobre error
        if (!process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.ALERT_EMAIL_TO) {
            try {
                console.log('[Protocolo 5] No se ha configurado el email de alertas SMTP en el .env. Saltando notificacion.');
            }
            catch (e) { /* ignore EPIPE */ }
            return;
        }
        try {
            const mailOptions = {
                from: `"OLAWEE Alerta Critica" <${process.env.SMTP_USER}>`,
                to: process.env.ALERT_EMAIL_TO,
                subject: `🚨 [OLAWEE 2.0] ERROR CRÍTICO DEL SISTEMA: ${errorTitle}`,
                html: `
                    <div style="font-family: Arial, sans-serif; background-color: #1a202c; color: white; padding: 20px; border-radius: 8px;">
                        <h2 style="color: #f87171;">⚠️ Alerta de Caída en Entorno de OLAWEE</h2>
                        <p><strong>Tipo de Error:</strong> ${errorTitle}</p>
                        <p><strong>Mensaje:</strong> ${errorMessage}</p>
                        <p><strong>Entorno:</strong> Servidor (Node: ${process.version} / SO: ${process.platform})</p>
                        <p><strong>Hora:</strong> ${new Date().toISOString()}</p>
                        <hr style="border-color: #374151;">
                        <h3 style="color: #60a5fa;">Stack Trace:</h3>
                        <pre style="background-color: #111827; padding: 15px; border-radius: 5px; color: #a5b4fc; overflow-x: auto; font-size: 13px;">${stackTrace}</pre>
                        <br>
                        <p style="font-size: 12px; color: #9ca3af;">Protocolo 5 Defensivo - Enviado automáticamente por el servidor.</p>
                    </div>
                `
            };
            const info = await this.transporter.sendMail(mailOptions);
            console.log(`[Protocolo 5] 📬 Email de Alarma Crítica enviado con éxito: ${info.messageId}`);
        }
        catch (error) {
            console.error(`[Protocolo 5] ❌ Fallo rotundo al intentar enviar el email de alerta al administrador: ${error.message}`);
        }
    }
}
exports.EmailService = EmailService;
exports.emailService = new EmailService();
