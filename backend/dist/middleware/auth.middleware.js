"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiKeyMiddleware = apiKeyMiddleware;
function apiKeyMiddleware(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    const validApiKey = process.env.WEBHOOK_API_KEY;
    if (!validApiKey) {
        console.error('❌ FATAL: WEBHOOK_API_KEY is not defined in environment variables.');
        res.status(500).json({ status: 'error', message: 'Server Configuration Error' });
        return;
    }
    if (!apiKey || apiKey !== validApiKey) {
        console.warn(`🛑 Unauthorized access attempt. IP: ${req.ip}`);
        res.status(401).json({ status: 'error', message: 'Unauthorized: Invalid API Key' });
        return;
    }
    next();
}
