# 🚀 OLAWEE 2.0 - Resumen de Transición y Desarrollo (Fase Final Backend)

Este documento sirve como registro oficial (Commit Summary) de las implementaciones avanzadas realizadas durante la construcción de la Fase Final del Backend de OLAWEE en su migración desde n8n a código nativo (TypeScript/Node.js).

## 🗂️ Arquitectura Base y Modularidad
- Se ha estructurado el sistema central en un formato modular con servicios de inyección de dependencias (`service.ts`).
- Se han establecido tres pilares principales de IA:
  1. **Chat Handler:** Modelos LLM directos (OpenAI, Gemini, Anthropic, Mistral, DeepSeek).
  2. **Assistant Handler:** Agentes conversacionales generales con herramientas base globales (Web Search, Wikipedia).
  3. **PYMES Handler (Agente de Área Segregada):** El sistema avanzado con control de herramientas especializadas por Identificadores (IDs Numéricos).

## 🛠️ Herramientas Acotadas por Asistente (Sistema PYMES)
- **Implementación de Lógica de Capacidad Restringida:** El webhook ahora puede procesar un array (desde formData o JSON) de `tools: [1, 2]`.
- Se configuró el `pymes-tools.service.ts` para mapear de manera estricta los IDs hacia las herramientas corporativas:
  - `[ID: 1] OLAWEE_PYMES_FacturasPDF_Generator`
  - `[ID: 2] OLAWEE_PYMES_Analisis_Impuestos`
  - `[ID: 3] OLAWEE_PYMES_Generador_Contratos`
  - `[ID: 4] OLAWEE_PYMES_Consultor_Marketing_Local`
  - `[ID: 5] OLAWEE_PYMES_Optimizador_Cuadrantes`
- La IA solo se ensambla e inyecta dinámicamente (`.bindTools`) con las herramientas estrictamente habilitadas, asegurando que un asistente de Marketing no pueda falsificar ni invocar facturas financieras.

## 🛡️ Seguridad y Defensas del Server (Protocolos 2 y 3)
- **Protocolo 2 (Prevención Crash):** Un hook de eventos nativo de Node.js que captura todas las excepciones no controladas (`uncaughtException`) y promesas caídas (`unhandledRejection`). No detiene el servidor, simplemente intercepta y guarda el _stacktrace_ en `logs/olawee-error.log`.
- **Protocolo 3 (Cyberseguridad Defensiva):** 
  - Se ha integrado `helmet` para eliminar cabeceras vulnerables nativas de Express.
  - Se ha puesto un escudo `hpp` para prevenir la contaminación de parámetros HTTP en URL.
  - Se ha implementado un escudo anti-DDoS `express-rate-limit` restringido a 100 peticiones cada 15 minutos en todos y cada uno de los Endpoints expuestos de Chat.

## 👁️ Sistema de Inspección y Logs de Ejecución en BD (Protocolo 4B)
- **Migración a PostgreSQL (Supabase):** 
  - Adiós al viejo _Guardado en Disco_ (`.jsonl`).
  - Creación de las tablas `exec_chats`, `exec_assistants`, y `exec_pymes` gestionadas por Prisma en un Schema dedicado (`pruebas_executions`).
- **Limpieza Automática Integrada (Garbage Collector):**
  - Cada vez que se procesan comandos POST, un microservicio interno se encarga autónomamente de borrar los registros de más de 7 días.
- **Frontend Panel de Administrador `admin`:**
  - Panel nativo a medida (HTML/TailwindJS).
  - Integración de `Prism.js` para una lectura hiperclara al nivel visual que provee un IDE como VSCode.
  - Cuatro Modos de Filtros Globales que dividen la lectura de logs de ejecuciones por Origen (Chats Globales / Asistentes / Pymes).
  - Actualización reactiva y "cache busting" (`app.js?v=6`) introducido para evitar conflictos pasivos en Windows 11 o Navegadores pesados.

## 🧹 Refactorización de Tipos de N8N a Código Nativo Puro
- Se detectaron las variables remanentes e indeseables heredadas estructuralmente de los viejos nodos Edit Fields de N8N en webhook: (`ai_model`, `user_prompt`, `id_user_chat`).
- Se realizó una mutación completa de Typecasting tanto en las variables internas de TypeScript, como en el `schema.prisma`. 
- **Estándar Oficial actual de entrada/salida para el Payload JSON de los Endpoints de OLAWEE:**
  ```json
  {
      "chatInput": "Quiero generar una factura a nombre de Daroma",
      "model": "gpt-4o",
      "session_id": "usr_99Xk_312",
      "tools": [1]
  }
  ```
