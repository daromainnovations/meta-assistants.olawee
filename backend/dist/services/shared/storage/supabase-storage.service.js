"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseStorageService = exports.SupabaseStorageService = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
class SupabaseStorageService {
    constructor() {
        // Bucket name to store assistant-generated files
        this.bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'olawee-files';
        const supabaseUrl = process.env.SUPABASE_URL || '';
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
        if (!supabaseUrl || !supabaseKey) {
            console.warn('[SupabaseStorage] SUPABASE_URL o SUPABASE_KEY faltante en .env. La carga de archivos fallará.');
        }
        // Initialize Supabase Client
        this.supabase = (0, supabase_js_1.createClient)(supabaseUrl || 'https://fake.supabase.co', supabaseKey || 'fake-key');
    }
    /**
     * Sube un Buffer (archivo generado en memoria) a Supabase Storage y devuelve su URL.
     */
    async uploadBuffer(buffer, fileName, contentType) {
        // Asegurar que el nombre del archivo no pise otros, añadiendo timestamp
        const uniqueFileName = `${Date.now()}_${fileName.replace(/\s+/g, '_')}`;
        console.log(`[SupabaseStorage] Subiendo buffer al bucket '${this.bucketName}': ${uniqueFileName}`);
        const { data, error } = await this.supabase.storage
            .from(this.bucketName)
            .upload(uniqueFileName, buffer, {
            contentType,
            upsert: true
        });
        if (error) {
            console.error('[SupabaseStorage] Error subiendo archivo a Supabase:', error);
            throw new Error(`Error en Storage: ${error.message}`);
        }
        // Obtener URL pública (asumimos bucket público, o al menos requerimos la URL para el chat)
        const { data: publicData } = this.supabase.storage
            .from(this.bucketName)
            .getPublicUrl(uniqueFileName);
        console.log(`[SupabaseStorage] Subida exitosa. URL: ${publicData.publicUrl}`);
        return publicData.publicUrl;
    }
}
exports.SupabaseStorageService = SupabaseStorageService;
exports.supabaseStorageService = new SupabaseStorageService();
