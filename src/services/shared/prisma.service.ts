import { PrismaClient } from '@prisma/client';

let prisma: any = null;
export function getPrisma() {
    if (!prisma) {
        prisma = new PrismaClient();
    }
    return prisma;
}
