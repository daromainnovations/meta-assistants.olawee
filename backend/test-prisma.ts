import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
async function main() {
    try {
        await prisma.mensajesmeta.create({
            data: { session_id: 'test', message: { foo: 'bar' } }
        });
        console.log('Success!');
    } catch (e) {
        console.error('DB Error:', e);
    }
}
main();
