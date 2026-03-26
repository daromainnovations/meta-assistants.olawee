# 📚 OLAWEE Backend — Guías de Desarrollo

Este directorio contiene toda la documentación técnica necesaria para extender la plataforma OLAWEE.

---

## 📁 Contenido

| Archivo | Descripción |
|---|---|
| `01-crear-meta-asistente.md` | Cómo crear y registrar un nuevo Meta Asistente especializado |
| `02-crear-nueva-tool.md` | Cómo añadir una nueva Tool de LangChain al sistema de herramientas |
| `03-entornos-staging-produccion.md` | Cómo funciona la separación de entornos y los webhooks QA |

---

## 🏗️ Arquitectura General

```
Webhook (/QAmeta-assistant-chat)
         │
         ▼
  meta-handler.service.ts   ← Capa base (fija, igual para todos)
         │
         ├─ pre-procesado:  archivos, contexto BD, historial
         │
         ▼
  specialists/[meta_id]/    ← ⬅️ AQUÍ va el motor del especialista
         │
         ├─ post-procesado: guardar en BD, devolver respuesta
         │
         ▼
       Cliente
```

Los tres pilares del sistema son:
1.  **Meta Asistentes** — Agentes especializados con lógica propia.
2.  **Tools** — Herramientas que los LLMs pueden invocar (generar archivos, etc.).
3.  **Entornos** — Separación entre Staging (QA) y Producción.
