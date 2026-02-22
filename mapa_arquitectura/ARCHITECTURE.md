# Arquitectura OLAWEE QA Agent

Este mapa visualiza el flujo de la aplicación simulando la estructura de nodos de n8n.
Se mantendrá actualizado a medida que añadamos más funcionalidades.

```mermaid
graph TD
    %% Estilos de los Nodos (Simulando n8n)
    classDef trigger fill:#10B981,stroke:#047857,stroke-width:2px,color:white;
    classDef router fill:#3B82F6,stroke:#1D4ED8,stroke-width:2px,color:white;
    classDef logic fill:#8B5CF6,stroke:#6D28D9,stroke-width:2px,color:white;
    classDef ai fill:#F59E0B,stroke:#B45309,stroke-width:2px,color:white;
    classDef db fill:#EF4444,stroke:#B91C1C,stroke-width:2px,color:white;
    classDef tool fill:#6366F1,stroke:#4338CA,stroke-width:2px,color:white;

    %% Subgraphs para Organizar

    subgraph "1. Frontend (Pruebas Locales)"
        UI[💻 Interfaz UI\n(index.html / app.js)]:::trigger
    end

    subgraph "2. Entrada y Enrutamiento (src/routes & src/services/webhook.service.ts)"
        Webhook[🪝 Webhook Receptor\n(Express.js Routes)]:::trigger
        Router{🔀 Router Lógico\n¿Contiene Archivo?}:::router
        DocExtractor[📄 Extractor de Documentos\n(DocumentService)]:::logic
        DocConcat[🔗 Concatenador de Texto\n(DocumentService)]:::logic
    end

    subgraph "3. Núcleo de IA (src/services)"
        Chat[🧠 Agente Chat Handler\n(ChatHandlerService)]:::logic
        ModelSelector{⚙️ Model Selector\n(AiProviderService)}:::router
        SystemPromptMaker[📝 Generador de System Prompt\nInterpolación {{ $json }}]:::logic
    end

    subgraph "4. Proveedores LLM (LangChain)"
        LLM_Gemini[🤖 Gemini LLM]:::ai
        LLM_OpenAI[🤖 OpenAI LLM]:::ai
        LLM_Anthropic[🤖 Anthropic Claude]:::ai
        LLM_Mistral[🤖 Mistral AI]:::ai
        LLM_DeepSeek[🤖 DeepSeek]:::ai
    end

    subgraph "5. Bases de Datos (Supabase / Prisma)"
        DB_Chats[(🗄️ prueba_chatsllms\nContexto Inicial / Prompts)]:::db
        DB_Messages[(🗂️ prueba_mensajesllms\nMemoria del Chat)]:::db
    end

    subgraph "6. Herramientas del Agente (src/services/tool-executor.service.ts)"
        Tools[🛠️ Herramientas Dinámicas\n(get_current_time, etc)]:::tool
    end

    subgraph "7. Automatizaciones Asíncronas (src/automations)"
        TitleGen[⚙️ Generador de Títulos\n(title-generator.automation.ts)]:::logic
    end

    %% Conexiones (El Flujo de la Información)
    
    UI -- "Envía JSON o FormData" --> Webhook
    Webhook -- "Valida API Key y Desglosa variables" --> Router
    
    %% Flujo Fire and Forget
    Webhook -. "Dispara Hilo Paralelo\n(Fire & Forget)" .-> TitleGen
    TitleGen -- "Crea título resumido (Gemini Flash)" --> DB_Chats

    %% Flujo con Documento
    Router -- "Sí (Documento adjunto)" --> DocExtractor
    DocExtractor -- "PDF/TXT/Imagen a Texto" --> DocConcat
    DocConcat -- "Guarda/Concatena Info" --> DB_Chats
    DocConcat -- "Envía Todo el Contexto" --> SystemPromptMaker
    
    %% Flujo Sin Documento
    Router -- "No (Mero Texto)" --> SystemPromptMaker

    %% Flujo del Chat
    SystemPromptMaker -- "Combina Prompt Manual y Contexto" --> Chat
    DB_Chats -. "Recupera Contexto (Si existía antes)" .-> SystemPromptMaker
    
    DB_Messages -. "Recoge Memoria Histórica" .-> Chat
    Chat -- "Guarda Mensaje Humano" --> DB_Messages
    
    Chat -- "Selecciona IA" --> ModelSelector
    ModelSelector -- "Si es Gemini" --> LLM_Gemini
    ModelSelector -- "Si es OpenAI" --> LLM_OpenAI
    ModelSelector -- "Si es Claude" --> LLM_Anthropic
    ModelSelector -- "Si es Mistral" --> LLM_Mistral
    ModelSelector -- "Si es Deepseek" --> LLM_DeepSeek

    %% Conexiones Base Modelo con Herramientas
    LLM_Gemini <--> Tools
    LLM_OpenAI <--> Tools
    LLM_Anthropic <--> Tools
    %% (y los demás si las soportan natively)

    %% Respuesta Final
    LLM_Gemini -.-> Chat
    LLM_OpenAI -.-> Chat
    LLM_Anthropic -.-> Chat
    LLM_Mistral -.-> Chat
    LLM_DeepSeek -.-> Chat

    Chat -- "Guarda Mensaje IA" --> DB_Messages
    Chat -- "Devuelve Resultado Final" --> UI

```
