# 🔧 Cómo Crear una Nueva Tool

Las Tools son herramientas que los LLMs pueden invocar de forma autónoma durante una conversación. El sistema usa LangChain (`DynamicStructuredTool`) para definirlas y Zod para validar los parámetros de entrada.

---

## ¿Dónde vive el sistema de Tools?

```
backend/src/services/shared/tools/
└── file-factory/
    ├── file-factory.service.ts     ← Servicio central que agrupa todas las tools
    └── generators/
        ├── excel.generator.ts      ← Lógica interna de la tool de Excel
        ├── word.generator.ts
        ├── pdf.generator.ts
        └── ppt.generator.ts
```

El `file-factory.service.ts` expone las tools. Cada tool tiene:
1. **`name`**: identificador único que el LLM usa para invocarla.
2. **`description`**: texto que le dice al LLM *cuándo* debe usar esta tool.
3. **`schema`**: parámetros de entrada validados con Zod.
4. **`func`**: la lógica que se ejecuta cuando el LLM la invoca.

---

## Pasos para crear una nueva Tool

### Paso 1 — Crear el generador (lógica interna)

Si la tool hace algo complejo, crea un generador separado en `generators/`:

```typescript
// generators/mi-tool.generator.ts

export class MiToolGenerator {
    async generate(param1: string, param2: number): Promise<Buffer> {
        // Aquí va la lógica: llamar a una API, generar un archivo, transformar datos...
        const result = Buffer.from(`Resultado de ${param1}`);
        return result;
    }
}

export const miToolGenerator = new MiToolGenerator();
```

> Si la tool es simple, puedes poner toda la lógica directamente en el `func` del paso 2.

### Paso 2 — Definir la Tool en `file-factory.service.ts`

Añade un nuevo método en la clase `FileFactoryService`:

```typescript
// En file-factory.service.ts

import { miToolGenerator } from './generators/mi-tool.generator';

// ...dentro de la clase FileFactoryService:

getMiNuevaTool() {
    return new DynamicStructuredTool({
        name: "nombre_de_mi_tool",
        description: "Describe CUÁNDO el LLM debe usar esta tool. Sé muy específico. Ejemplo: 'Útil cuando el usuario pide calcular el IVA de una factura.'",
        schema: z.object({
            param1: z.string().describe("Descripción del primer parámetro"),
            param2: z.number().describe("Descripción del segundo parámetro")
        }),
        func: async ({ param1, param2 }) => {
            console.log(`[FileFactory - MI TOOL] Invocada con: ${param1}, ${param2}`);
            try {
                const buffer = await miToolGenerator.generate(param1, param2);

                // Si genera un archivo, súbelo a Supabase:
                const publicUrl = await supabaseStorageService.uploadBuffer(
                    buffer,
                    `resultado_${param1}.ext`,
                    'application/octet-stream'
                );

                return `Resultado exitoso. Enlace: ${publicUrl}`;

            } catch (error: any) {
                console.error("[FileFactory - MI TOOL] ❌ ERROR:", error);
                return `Error en mi tool: ${error.message}`;
            }
        }
    });
}
```

### Paso 3 — Incluirla en `getAllFactoryTools()`

Al final de `file-factory.service.ts`, añade tu tool al array:

```typescript
getAllFactoryTools() {
    return [
        this.getCreateExcelTool(),
        this.getCreateWordTool(),
        this.getCreatePptTool(),
        this.getCreatePdfTool(),
        this.getMiNuevaTool()   // ← añadir aquí
    ];
}
```

---

## ¿Dónde se inyectan las Tools?

Las tools se inyectan en el `tool-executor.service.ts` que se encarga de pasárselas al LLM. El número de tools disponibles para cada usuario se controla con el array `tools` del payload.

Si el usuario manda `tools: [1, 2, 3]` en el payload, el backend activa las tools con esos IDs.

Para que tu nueva tool sea seleccionable, asegúrate de que tenga un índice en la lista de `getAllFactoryTools()` (el orden del array define el ID numérico).

---

## Tips para escribir buenas `description`

La descripción es lo más importante. El LLM decide si usar la tool basándose exclusivamente en ella:

✅ **Bien**: `"Útil cuando el usuario explícitamente pide 'calcular el IVA', 'cuánto es el IVA de X' o 'dame el precio con IVA incluido'."`

❌ **Mal**: `"Calcula el IVA."`
