# 🛑 PROTOCOLO DE SEGURIDAD DE BASE DE DATOS - OLAWEE

Este archivo es de **lectura obligatoria** para cualquier asistente de IA (Antigravity u otros) antes de realizar operaciones de base de datos.

## 🚫 ACCIONES PROHIBIDAS
1. **JAMÁS** ejecutar `npx prisma db push --force-reset`.
2. **JAMÁS** ejecutar comandos que impliquen el borrado de tablas en el esquema `public`.
3. **JAMÁS** usar el flag `--accept-data-loss` en entornos que contengan datos de producción o espejos de WordPress/Supabase.

## ✅ ACCIONES PERMITIDAS
1. Usar `npx prisma db pull` para sincronizar el esquema local con la base de datos.
2. Usar scripts SQL con `CREATE TABLE IF NOT EXISTS` para añadir funcionalidades nuevas.
3. Crear modelos nuevos en esquemas aislados (como `meta_billing` o `meta`).

## ⚠️ TRATAMIENTO DEL ESQUEMA PUBLIC
El esquema `public` contiene datos críticos sincronizados. Cualquier cambio en este esquema debe ser propuesto primero como un script SQL para revisión manual y **NUNCA** gestionado automáticamente por herramientas de sincronización destructiva.

---
*Firma: Antigravity AI (Compromiso de cumplimiento estricto)*
