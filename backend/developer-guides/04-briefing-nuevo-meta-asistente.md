# 🤖 Briefing para Antigravity: Desarrollo de un Nuevo Motor de Meta Asistente

**Copia este prompt completo y pégalo a un nuevo agente de Antigravity para que desarrolle el motor de tu nuevo meta-asistente de forma independiente.**

---

```
Eres un experto en TypeScript y LangChain. Voy a pedirte que desarrolles el MOTOR de un
nuevo Meta Asistente para un sistema llamado OLAWEE Backend.

## CONTEXTO DEL PROYECTO

Este sistema tiene una arquitectura "sandwich":
- Una capa base fija (pre-procesado + post-procesado) ya implementada y que NO DEBES TOCAR.
- Un motor del especialista (el que voy a pedirte que desarrolles) que va en el centro.
- La capa base ya se encarga de: guardar mensajes en BD, lanzar títulos automáticos,
  validar el meta_id, y gestionar errores. TÚ SOLO IMPLEMENTAS EL RUN().

## BASE DE DATOS (PostgreSQL via Prisma)

Schema: "qan8n2.0"
Tablas del sistema Meta (ya existen en producción, NO las crear — solo úsalas si necesitas):
  - chatsmeta     → sesiones de chat (session_id, meta_id, titulo, systemprompt_doc, updated_at)
  - mensajesmeta  → mensajes (session_id, message: Json, created_at)

Acceso a BD en TypeScript:
  const db = getPrisma(); // importado desde '../../../shared/prisma.service'
  await db.chatsmeta.findFirst({ where: { session_id: sessionId } });
  await db.chatsmeta.create({ data: { session_id, meta_id, titulo, systemprompt_doc } });
  await db.chatsmeta.update({ where: { id: existing.id }, data: { ... } });
  await db.mensajesmeta.create({ data: { session_id, message: { role, content } } });

## CONTRATO QUE DEBE CUMPLIR EL MOTOR (OBLIGATORIO)

El agente debe exportar una clase con un método run() con esta firma exacta:

  async run(
    userMessage: string,           → el mensaje de texto del usuario
    files: Express.Multer.File[],  → archivos en memoria (buffer, originalname, mimetype)
    sessionId: string              → identificador de la sesión
  ): Promise<any>

Y el objeto que devuelva SIEMPRE debe incluir como mínimo el campo:
  { ai_response: string, status: 'success' | 'error', specialist: string, timestamp: string }

Ejemplo mínimo de respuesta válida:
  return {
    status: 'success',
    specialist: 'nombre_del_agente',
    ai_response: 'Respuesta generada...',
    timestamp: new Date().toISOString()
  };

## LO QUE EL MOTOR PUEDE HACER (total libertad)

Dentro del run() puedes implementar cualquier lógica:
  - Un solo agente de IA (LangChain + cualquier modelo: Gemini, OpenAI, Anthropic...)
  - Una cadena de agentes en secuencia: Agente1 → Agente2 → Agente3
  - Ramas condicionales: según el tipo de archivo o el contenido del mensaje
  - Solo automatizaciones (parsing, transformación, enriquecimiento de datos)
  - Combinación de automatizaciones + agentes de IA

## DEPENDENCIAS DISPONIBLES EN EL PROYECTO

Las siguientes librerías ya están instaladas y puedes usarlas:
  - @langchain/core, @langchain/google-genai, @langchain/openai, @langchain/anthropic
  - @langchain/community (con DynamicStructuredTool, etc.)
  - zod (para schemas de tools)
  - xlsx (para leer/escribir Excel)
  - pdf-parse, mammoth (para PDF y Word)

## VARIABLES DE ENTORNO DISPONIBLES

  process.env.GEMINI_API_KEY
  process.env.OPENAI_API_KEY
  process.env.ANTHROPIC_API_KEY

## ESTRUCTURA DE ARCHIVOS QUE DEBES CREAR

Crea solo estos archivos (la carpeta de tu agente):

  mi-nuevo-agente/
  └── mi-nuevo-agente.agent.ts   ← El motor completo aquí

## CÓMO CONECTARLO AL SISTEMA CUANDO ESTÉ LISTO

Cuando el motor esté desarrollado y probado, el desarrollador lo integrará en el
sistema principal (meta-handler.service.ts) siguiendo esta guía:
  - Copiar la carpeta a: backend/src/services/meta-assistants/specialists/
  - Importar el agente en meta-handler.service.ts
  - Añadir la entrada en SPECIALIST_REGISTRY con { label, acceptsFiles }
  - Añadir el case en el switch de routeToSpecialist()

## LO QUE QUIERO QUE HAGAS AHORA

[AQUÍ DESCRIBES TU NUEVO META-ASISTENTE]:

  - Nombre/ID del especialista: ej. "financial_advisor"
  - Descripción de lo que hace: ej. "Recibe extractos bancarios en PDF, los analiza y genera
    un informe de gastos con recomendaciones"
  - Tipo de archivos que recibe: ej. PDFs, Excel, solo texto, sin archivos...
  - Modelo a usar: ej. gemini-2.0-flash / gpt-4o / claude-3-5-sonnet / etc.
  - Lógica interna: ej. "Primero extrae los datos, luego los clasifica, luego genera
    el informe con un agente de IA"
  - Formato de respuesta esperado: ej. informe en markdown / JSON / texto plano...
```

---

## Cómo usar esta plantilla

1. **Copia todo el bloque de arriba** (el prompt dentro de los triple backticks).
2. **Rellena la sección `[AQUÍ DESCRIBES TU NUEVO META-ASISTENTE]`** con los detalles de lo que necesitas.
3. **Pégalo a un nuevo agente de Antigravity** y dile que desarrolle el motor.
4. Cuando el agente termine, **copia la carpeta generada** a `backend/src/services/meta-assistants/specialists/`.
5. **Vuelve aquí** y pídeme que lo registre en el `meta-handler.service.ts` con los 3 pasos de la guía `01-crear-meta-asistente.md`.
