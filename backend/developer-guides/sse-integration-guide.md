# Guía del Desarrollador: Streaming y Server-Sent Events (SSE) en Meta Assistants

Esta guía documenta la refactorización profunda realizada para transformar la API de los *Meta Assistants* de una comunicación síncrona, a una arquitectura de respuesta progresiva basada en **Server-Sent Events (SSE)**.

## 🚀 1. Visión General de la Arquitectura

Anteriormente, la plataforma enviaba una petición HTTP y esperaba bloqueada durante 15–30 segundos hasta que la IA finalizaba todas sus etapas (búsqueda de base de datos, generación de PDFs, llamadas a la API de LLMs).

Con el modelo de **Streaming (SSE)**:
1. El Agente Especialista ejecuta pasos secuenciales y avisa ("Mire, estoy leyendo los PDFs...", "Ahora estoy pensando el ranking...").
2. Estos avisos son emitidos usando instanciación de Generadores Asíncronos (`yield`).
3. El `MetaHandlerService` envuelve esto en un `ReadableStream` que el cliente consume dinámicamente (`EventSource` o `Fetch API` en React).

El ciclo de comunicación frontend-backend ahora transcurre enviando piezas ligeras en formato:
`data: {"type": "status", "message": "Procesando..."}\n\n`

---

## 🏗️ 2. Creando o Modificando un Especialista (Paso a Paso)

Todos los Meta Asistentes operan heredando de `BaseMetaSpecialist`. 

Para que un nuevo Meta Asistente funcione en tiempo real y soporte el motor de Streaming, debe cumplir **tres reglas obligatorias**:

### Regla 1: Modificar la Firma de `execute`
Cambia el típico `Promise<MetaResult>` de tu agente a la firma de Generador Asíncrono:

```typescript
// ❌ ANTES (Síncrono/Bloqueante)
protected async execute(context: MetaContext): Promise<MetaResult> {

// ✅ AHORA (Streaming Ready)
protected async *execute(context: MetaContext): AsyncGenerator<MetaStreamEvent, any, unknown> {
```

### Regla 2: Emitir Eventos de Progreso (`yield`)
Cada vez que tu IA o tu código inicie una tarea que vaya a demorarse (una consulta a base de datos externa, un análisis complejo de LangChain, descarga de archivos, etc.), *dispara un evento de status*.

```typescript
// Avisas al frontend (React mostrará un UI dinámico)
yield { type: 'status', message: '🔍 Analizando los perfiles adjuntos...' };

// Luego ejecutas tu lógica pesada
const result = await miServicioLento();

// Nuevo aviso
yield { type: 'status', message: '⚙️ Generando un Word con los resultados...' };
```

### Regla 3: Finalizar Retornando el Objeto Estandar (`return`)
Aunque uses el patrón de "YIELD" para enviar reportes intermedios de estado, tu agente finaliza exactamente igual que antes. Al retornar el objeto `MetaResult`, el Handler Maestro se encargará de interceptarlo y emitir el evento final tipo `"done"`.

```typescript
// Fin del Agente
return {
    status: 'success',
    ai_response: "He finalizado el informe. Aquí tienes el desglose:\n\n" + resultadosDeIA,
    specialist: context.metaId,
    timestamp: new Date().toISOString()
};
```

---

## 🛠️ 3. ¿Cómo funciona "bajo el capó"? (MetaHandlerService)

Tu asistente no necesita preocuparse por la conversión HTTP. El responsable es `MetaHandlerService.processMessage`. 

Este orquestador gestiona tu generador de la siguiente manera:
1. Crea un `ReadableStream` nativo compatible con la API Web.
2. Inyecta la memoria, el histórico recurrente y otros recursos.
3. Se pone a iterar tu agente usando `for await (const event of agentGenerator) { ... }`.
4. Si el tipo de tu evento es `"status"`, lo serializa y lo expone a Next.js (el controlador API).
5. Cuando tu generador termina (con el return final), el orquestador sube los `generated_files` en background a Supabase, emitiendo otros eventos de status él mismo (ej: `"Subiendo datos a la nube...`), antes de guardar a la DB y cerrar el túnel Server-Sent.

---

## 🧩 4. Integración del lado del Frontend (React/Vanilla)

Los clientes que utilicen este endpoint NO pueden usar `await axios.post()`. Deben leer el *Reader* HTTP a bajo nivel para interpretar los "trozos" (chuches) a medida que llegan.

```javascript
const response = await fetch('/api/v1/assistants/tu-meta-id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': 'SECRETO' },
    body: JSON.stringify({ chatInput: 'Hola IA!' })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const lineaSSE = decoder.decode(value);
    
    // Parseo simulado del chunk (ya que pueden venir múltiples líneas de golpe)
    // El formato estricto que emite el backend es: data: { "type": "status", ... } \n\n
    console.log("Recibido del Stream SSE:", lineaSSE);
}
```

¡Mucha suerte construyendo los nuevos Agentes Sincrónicos de Olawee! 🚀
