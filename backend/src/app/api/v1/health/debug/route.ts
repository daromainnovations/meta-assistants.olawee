import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../../../../models/prisma';

export async function GET(req: NextRequest) {
    // Obtenemos de forma segura información sobre el entorno de ejecución
    const dbUrl = process.env.DATABASE_URL || '';
    
    // Enmascaramos la URL de la base de datos por seguridad (solo mostramos el host y el schema)
    let maskedDb = "No Database URL defined";
    if (dbUrl.includes('@')) {
        const afterAt = dbUrl.split('@')[1];
        maskedDb = `Connected to host: ${afterAt}`;
    }

    try {
        // Ejecutamos una consulta sencilla para ver si Prisma responde bien
        const count = await prisma.chatsmeta.count();
        
        return NextResponse.json({
            status: "success",
            environment: process.env.NODE_ENV || "unknown",
            app_env: process.env.APP_ENV || "unknown",
            database: maskedDb,
            chatsmeta_count: count,
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        return NextResponse.json({
            status: "error",
            environment: process.env.NODE_ENV || "unknown",
            database: maskedDb,
            error: error.message,
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
