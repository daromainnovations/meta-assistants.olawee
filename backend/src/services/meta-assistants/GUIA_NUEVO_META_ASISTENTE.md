# 🛠️ Guía: Crear un Nuevo Meta-Asistente (Especialista)

Esta guía explica cómo añadir un nuevo especialista al sistema modular de Meta-Asistentes de OLAWEE.

## 1. Estructura de Archivos
Crea una nueva carpeta en `backend/src/services/meta-assistants/specialists/nombre-asistente/`.
Dentro, crea al menos un archivo para el agente: `nombre-asistente.agent.ts`.

## 2. Implementación del Agente
Tu agente **DEBE** extender la clase `BaseMetaSpecialist`. Esto te garantiza acceso automático a la memoria de chat aislada y al contexto de documentos.

```typescript
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { BaseMetaSpecialist } from '../../base-specialist';
import { MetaContext, MetaResult } from '../../meta.types';

export class MiEspecialistaAgent extends BaseMetaSpecialist {
    
    // Nombre para logs internos
    protected getName(): string { return 'MiEspecialista'; }

    // Lógica principal
    protected async execute(context: MetaContext): Promise<MetaResult> {
        const { userMessage, history, docContext, files, model: modelName } = context;

        // 1. Configurar modelo
        const model = new ChatOpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            model: 'gpt-4o-mini'
        });

        // 2. Preparar prompts y contenido (incluyendo archivos si los hay)
        const messages = [
            new SystemMessage("Eres un experto en..."),
            ...history, // La historia viene ya filtrada por Session y Meta ID 🔒
            new HumanMessage(userMessage)
        ];

        // 3. Invocar
        const response = await model.invoke(messages);

        // 4. Devolver resultado estandarizado
        return {
            status: 'success',
            ai_response: response.content as string,
            specialist: 'mi_especialista_id',
            timestamp: new Date().toISOString()
        };
    }
}

export const miEspecialistaAgent = new MiEspecialistaAgent();
```

## 3. Registro en el Handler
Para que el sistema reconozca tu nuevo asistente, regístralo en `src/services/meta-assistants/meta-handler.service.ts`:

1.  **Importa** tu instancia del agente.
2.  **Añade** una entrada en `SPECIALIST_REGISTRY`:

```typescript
export const SPECIALIST_REGISTRY: Record<string, SpecialistConfig> = {
    // ...
    'mi_especialista_id': {
        label: 'Nombre Visual del Asistente',
        acceptsFiles: true, // Si procesará archivos
        agent: miEspecialistaAgent as any
    }
};
```

## 4. Bases Heredadas (Lo que NO tienes que hacer)
Gracias a la arquitectura `Plug-and-Play`, NO necesitas preocuparte de:
-   **Memoria de Chat:** Se carga y guarda automáticamente antes y después de tu ejecución.
-   **Aislamiento:** El sistema garantiza que no se mezclen chats de distintos asistentes.
-   **Contexto Documental:** El `systemprompt_doc` (Excel/PDFs) te llega listo en `context.docContext`.
-   **Gestión de Archivos:** Los archivos subidos se mantienen entre turnos en `context.files`.
-   **Auto-Titulado:** El chat recibirá un título automáticamente sin intervención del agente.

---
🚀 **¡Eso es todo!** Tu asistente ahora es parte del ecosistema Meta de OLAWEE.
