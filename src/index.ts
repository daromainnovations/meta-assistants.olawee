import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import webhookRoutes from './routes/webhook.routes';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON bodies & allow Cross-Origin Requests
app.use(cors());
app.use(express.json());

// Servir la carpeta estática del frontend y descargas (Debe ir antes de las rutas protegidas)
import path from 'path';
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/downloads', express.static(path.join(__dirname, '../public/downloads')));

// Mount the webhook routes
app.use(webhookRoutes);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('Webhook routes are active:');
    console.log(`- POST http://localhost:${PORT}/openai-chat`);
    console.log(`- POST http://localhost:${PORT}/gemini-chat`);
    console.log(`- POST http://localhost:${PORT}/anthropic-chat`);
    console.log(`- POST http://localhost:${PORT}/mistrall-chat`);
    console.log(`- POST http://localhost:${PORT}/deepseek-chat`);
    console.log(`- POST http://localhost:${PORT}/assistant-chat`);
});
