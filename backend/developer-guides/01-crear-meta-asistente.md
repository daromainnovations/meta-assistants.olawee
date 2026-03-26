# 🤖 Cómo Crear un Nuevo Meta Asistente

Los Meta Asistentes son agentes especializados que funcionan dentro de un "sandwich" de infraestructura compartida. Solo tienes que implementar el **motor** del especialista; todo lo demás ya está resuelto.

---

## ¿Qué hace la capa base automáticamente?

Cuando llega una petición a `/QAmeta-assistant-chat`, la capa base (`meta-handler.service.ts`) ya:

1. ✅ Carga el historial de la conversación desde la BD (`mensajesmeta`)
2. ✅ [OPCIONAL] Procesa y transcribe cualquier archivo adjunto
3. ✅ Carga el contexto de documentos previos de la sesión (`chatsmeta`)
4. ✅ Guarda el mensaje del usuario en BD
5. ✅ Lanza la generación automática del título (fire & forget)
6. ✅ Llama al motor del especialista → recibe el resultado
7. ✅ Guarda la respuesta del especialista en BD
8. ✅ Devuelve la respuesta al cliente

**Tú solo implementas el paso 6.**

---

## Pasos para crear un nuevo Meta Asistente

### Paso 1 — Crear la carpeta del especialista

```
backend/src/services/meta-assistants/specialists/
└── mi-nuevo-asistente/         ← nueva carpeta
    └── mi-nuevo-asistente.agent.ts   ← motor del especialista
```

### Paso 2 — Implementar el motor

El motor recibe un `MetaContext` con todo lo pre-procesado y devuelve un resultado:

```typescript
// mi-nuevo-asistente.agent.ts

import { getPrisma } from '../../../shared/prisma.service';

export class MiNuevoAsistenteAgent {

    async run(
        userMessage: string,
        files: Express.Multer.File[],
        sessionId: string
    ): Promise<any> {

        // === AQUÍ VA TU LÓGICA ===
        // Puede ser cualquier combinación de:
        //
        //   A. Un solo agente de IA (LangChain + modelo)
        //   B. Una cadena de agentes en secuencia: Agente1 → Agente2 → Agente3
        //   C. Agentes con ramas condicionales: Agente1 → (si X) Agente2 / (si Y) Agente3
        //   D. Solo automatizaciones (parsing, transformaciones, enriquecimiento de datos)
        //   E. Combinación de automatizaciones + agentes de IA
        //
        // El contexto que ya tienes disponible en los parámetros:
        //   - userMessage: el mensaje del usuario (ya disponible)
        //   - files:       archivos adjuntos (buffers originales)
        //   - sessionId:   ID de sesión para consultar BD si necesitas

        const aiResponse = `Respuesta del agente para: ${userMessage}`;

        return {
            status: 'success',
            type: 'mi_nuevo_asistente_response',
            specialist: 'mi_nuevo_asistente',
            ai_response: aiResponse,
            timestamp: new Date().toISOString()
        };
    }
}

export const miNuevoAsistenteAgent = new MiNuevoAsistenteAgent();
```

### Paso 3 — Registrarlo en el Handler

Abre `meta-handler.service.ts` y haz dos cosas:

**3a. Importar el agente arriba del todo:**
```typescript
import { miNuevoAsistenteAgent } from './specialists/mi-nuevo-asistente/mi-nuevo-asistente.agent';
```

**3b. Añadirlo al `SPECIALIST_REGISTRY` (con o sin procesador de archivos):**
```typescript
export const SPECIALIST_REGISTRY: Record<string, SpecialistConfig> = {
    'invoice_checker': {
        label: 'Verificador de Facturas vs Excel',
        acceptsFiles: true      // ← activa el procesador de archivos en capa base
    },
    'mi_nuevo_asistente': {
        label: 'Mi Nuevo Asistente',
        acceptsFiles: false     // ← desactiva el procesador de archivos (solo texto)
    }
};
```

**3c. Añadir el `case` al switch de `routeToSpecialist()`:**
```typescript
case 'mi_nuevo_asistente':
    return await miNuevoAsistenteAgent.run(userMessage, files, sessionId);
```

---

## ¿Cuándo usar `acceptsFiles: false`?

Usa `acceptsFiles: false` cuando el asistente:
- Solo trabaja con texto (chatbots de Q&A, asesores)
- No necesita procesar documentos del usuario
- Quieres que el flujo sea más ligero y rápido

---

## Ejemplo de cadena de agentes dentro del motor

```typescript
async run(userMessage, files, sessionId) {

    // Agente 1: Extrae datos del documento
    const extracted = await agente1.extract(files);

    // Decisión condicional
    if (extracted.type === 'factura') {
        // Rama A
        const validated = await agente2A.validate(extracted);
        return agente3.generateReport(validated);
    } else {
        // Rama B
        return agente2B.summarize(extracted);
    }
}
```

---

## Resumen visual

```
SPECIALIST_REGISTRY       ← 1. Declarar (con o sin archivos)
     │
meta-handler.service.ts   ← 2. Registrar import + case en el switch
     │
specialists/mi-nuevo/     ← 3. Implementar solo el run()
```
