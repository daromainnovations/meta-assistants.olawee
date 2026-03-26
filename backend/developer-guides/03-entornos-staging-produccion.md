# 🌍 Entornos: Staging vs Producción

La plataforma OLAWEE soporta dos entornos diferenciados que se controlan exclusivamente desde el archivo `.env`.

---

## Cómo funciona

La variable `APP_ENV` en el `.env` determina en qué modo arranca el servidor:

```env
# Staging / QA (desarrollo y pruebas)
APP_ENV=staging

# Producción (entorno real con clientes)
APP_ENV=production
```

---

## Diferencias entre entornos

| Comportamiento | Staging | Producción |
|---|---|---|
| Prefijo en webhooks | `QA` (ej: `/QAopenai-chat`) | Sin prefijo (ej: `/openai-chat`) |
| Middleware `qaDocInjector` | ✅ Activo | 🚫 Desactivado |
| Log de arranque | `[staging]` | `[production]` |
| Uso típico | Desarrollo, pruebas, QA | Clientes reales |

---

## Webhooks disponibles

### Staging (`APP_ENV=staging`)
```
POST http://localhost:8080/QAopenai-chat
POST http://localhost:8080/QAgemini-chat
POST http://localhost:8080/QAanthropic-chat
POST http://localhost:8080/QAmistrall-chat
POST http://localhost:8080/QAdeepseek-chat
POST http://localhost:8080/QAassistant-chat
POST http://localhost:8080/QAmeta-assistant-chat
```

### Producción (`APP_ENV=production`)
```
POST http://localhost:8080/openai-chat
POST http://localhost:8080/gemini-chat
POST http://localhost:8080/anthropic-chat
POST http://localhost:8080/mistrall-chat
POST http://localhost:8080/deepseek-chat
POST http://localhost:8080/assistant-chat
POST http://localhost:8080/meta-assistant-chat
```

---

## El middleware `qaDocInjector`

Este middleware solo está activo en **Staging** y permite inyectar automáticamente el contexto de documentos guardados en BD al inicio de cada petición, sin que el cliente tenga que enviarlo. Es útil para pruebas repetidas sin tener que subir el documento cada vez.

En Producción está desactivado para evitar filtraciones de contexto entre sesiones.

---

## Flujo de ramas Git recomendado

```
main (producción)
  └── staging
        └── avances26032026 (tu rama de desarrollo)
```

1. Desarrollas en tu rama (`avances26032026`).
2. Cuando tu feature está lista, haces **PR a `staging`** para probar en QA.
3. Cuando `staging` está validado, haces **PR a `main`** para desplegar en producción.
4. **Recuerda:** el `.env` de producción tiene `APP_ENV=production`, el de staging `APP_ENV=staging`.

---

## ¿Cómo añadir un nuevo entorno?

Si en el futuro necesitas un tercer entorno (ej: `pre-production`), solo tienes que:
1. Añadir el caso en `webhook.routes.ts` donde se define `qaPrefix`.
2. Crear el `.env` correspondiente con `APP_ENV=pre-production`.
