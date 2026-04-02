const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const fileInput = document.getElementById('fileInput');
const filePreview = document.getElementById('filePreview');
const fileNameSpan = document.getElementById('fileName');
const removeFileBtn = document.getElementById('removeFileBtn');
const sessionIdInput = document.getElementById('sessionId');
const modelSelect = document.getElementById('modelSelect');
const apiKeyInput = document.getElementById('apiKeyInput');
const specialistSelect = document.getElementById('specialistSelect');

let currentFile = null;

// ============================================================
// 🎨 MARKDOWN RENDERER — Convierte Markdown a HTML (sin deps)
// ============================================================
function renderMarkdown(text) {
    if (!text) return '';
    if (typeof text !== 'string') text = String(text);

    let html = text
        // Horizontal rules
        .replace(/^---+$/gm, '<hr class="border-gray-600/50 my-3">')
        // Headers H3, H2, H1
        .replace(/^### (.+)$/gm, '<h3 class="text-sm font-bold text-indigo-300 mt-4 mb-1">$1</h3>')
        .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold text-indigo-200 mt-5 mb-2 border-b border-gray-600/50 pb-1">$1</h2>')
        .replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold text-white mt-5 mb-2">$1</h1>')
        // Bold + Italic combined
        .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
        // Bold
        .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>')
        // Italic
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        // Inline code
        .replace(/`([^`]+)`/g, '<code class="bg-gray-700 text-emerald-300 px-1.5 py-0.5 rounded text-xs font-mono">$1</code>')
        // Audit status icons with color
        .replace(/✅ COINCIDE/g, '<span class="text-emerald-400 font-semibold">✅ COINCIDE</span>')
        .replace(/❌ NO COINCIDE/g, '<span class="text-red-400 font-semibold">❌ NO COINCIDE</span>')
        .replace(/⚠️ NO LOCALIZADA EN EXCEL/g, '<span class="text-amber-400 font-semibold">⚠️ NO LOCALIZADA EN EXCEL</span>')
        .replace(/⚠️ PENDIENTE/g, '<span class="text-amber-400 font-semibold">⚠️ PENDIENTE</span>')
        // Unordered list items
        .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-gray-300 my-0.5">$1</li>')
        // Links [text](url)
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="text-indigo-400 hover:text-indigo-300 underline decoration-indigo-400/30 underline-offset-4 font-medium transition-colors"><i class="fa-solid fa-download mr-1"></i>$1</a>');

    // Wrap consecutive <li> blocks in <ul>
    html = html.replace(/((<li[^>]*>.*?<\/li>\s*)+)/gs, '<ul class="my-1 list-outside pl-4 space-y-0.5">$1</ul>');

    // Double newlines = new paragraph, single = <br>
    html = html
        .replace(/\n{2,}/g, '</p><p class="mt-2">')
        .replace(/\n/g, '<br>');

    return `<div class="prose-custom"><p class="mt-0">${html}</p></div>`;
}

// ============================================================
// 🏷️ SPECIALIST INFO — Label dinámico del agente activo
// ============================================================
const SPECIALIST_LABELS = {
    'invoice_checker': { label: '🔍 InvoiceChecker', color: 'text-pink-300' },
    'doc_comparator': { label: '📄 DocComparator', color: 'text-emerald-300' },
    'grant_justification': { label: '⚖️ Justificación Subv.', color: 'text-amber-300' },
    'template_filler': { label: '📝 TemplateFiller', color: 'text-blue-300' },
};


function getAgentInfo() {
    const val = specialistSelect ? specialistSelect.value : '';
    if (val && SPECIALIST_LABELS[val]) return SPECIALIST_LABELS[val];
    return { label: 'Agente OLAWEE Beta', color: 'text-indigo-400' };
}

// ============================================================
// 📐 Auto-resize textarea
// ============================================================
messageInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});

// ============================================================
// 📎 File attachment
// ============================================================
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        const fileNames = Array.from(e.target.files).map(f => f.name).join(', ');
        fileNameSpan.textContent = e.target.files.length > 1
            ? `${e.target.files.length} archivos adjuntos`
            : fileNames;
        fileNameSpan.title = fileNames;
        filePreview.classList.remove('hidden');
    }
});

removeFileBtn.addEventListener('click', () => {
    currentFile = null;
    fileInput.value = '';
    filePreview.classList.add('hidden');
});

// ============================================================
// ⌨️ Keyboard shortcut: Enter para enviar
// ============================================================
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

sendBtn.addEventListener('click', sendMessage);

// ============================================================
// 🚀 SEND MESSAGE
// ============================================================
async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text && fileInput.files.length === 0) return;

    // Mostrar mensaje del usuario
    let attachmentLabel = '';
    if (fileInput.files.length > 0) {
        attachmentLabel = fileInput.files.length > 1
            ? `[${fileInput.files.length} archivos adjuntados]`
            : `[Archivo adjuntado: ${fileInput.files[0].name}]`;
    }
    appendMessage('user', text + (text && attachmentLabel ? '\n' + attachmentLabel : attachmentLabel));

    // Config
    const session_id = sessionIdInput.value;
    const model = modelSelect.value;
    const apiKey = apiKeyInput.value;
    const specialistId = specialistSelect ? specialistSelect.value : '';

    try {
        const prefix = window.API_PREFIX || '/';
        const endpointUrl = `${prefix}meta-assistant-chat`;

        const formData = new FormData();
        formData.append('session_id', session_id);
        formData.append('model', model);
        formData.append('chatInput', text);

        if (specialistId) {
            // MODO ESPECIALISTA: el agente tiene su propio prompt/modelo
            formData.append('meta_id', specialistId);
        } else {
            // MODO GENÉRICO: enviamos systemPrompt
            const systemPromptEl = document.getElementById('systemPrompt');
            formData.append('systemPrompt', systemPromptEl ? systemPromptEl.value || 'Eres un asistente útil.' : 'Eres un asistente útil.');
        }

        // Historial visual
        const msgElements = Array.from(chatMessages.querySelectorAll('.chat-message'));
        const history = msgElements
            .filter(el => !el.classList.contains('message-typing'))
            .map(el => {
                const isAI = el.classList.contains('message-ai');
                const content = el.querySelector('.text-sm')?.textContent || '';
                return { role: isAI ? 'assistant' : 'user', content };
            }).slice(1, -2);
        formData.append('history', JSON.stringify(history));

        // Adjuntar archivos
        if (fileInput.files.length > 0) {
            for (let i = 0; i < fileInput.files.length; i++) {
                formData.append('files', fileInput.files[i]);
            }
        }

        // Reset UI
        messageInput.value = '';
        messageInput.style.height = 'auto';
        fileInput.value = '';
        filePreview.classList.add('hidden');

        // Loader
        const loaderId = appendLoader();
        scrollBottom();

        // Fetch
        try {
            const response = await fetch(endpointUrl, {
                method: 'POST',
                headers: { 'x-api-key': apiKey },
                body: formData
            });

            const data = await response.json();
            removeLoader(loaderId);

            if (data.status === 'success') {
                appendMessage('ai', data.ai_response, data.context_used);
            } else {
                appendMessage('error', data.message || data.error || 'Unknown error occurred.');
            }

        } catch (error) {
            removeLoader(loaderId);
            appendMessage('error', 'Error conectando al servidor: ' + error.message);
        }

    } catch (error) {
        appendMessage('error', 'Error preparando petición: ' + error.message);
    }
}

// ============================================================
// 🖼️ UI HELPERS
// ============================================================

function appendMessage(sender, text, contextUsed = false) {
    const isUser = sender === 'user';
    const isError = sender === 'error';

    // Asegurar que el texto sea un String para evitar errores de .replace()
    if (typeof text !== 'string') {
        text = typeof text === 'object' ? JSON.stringify(text) : String(text);
    }

    const container = document.createElement('div');

    container.className = isUser
        ? 'flex justify-end ml-12'
        : 'flex justify-start mr-12';

    let innerHtml = '';

    if (isUser) {
        innerHtml = `
            <div class="bg-indigo-600/90 text-white px-5 py-3 rounded-2xl rounded-tr-sm shadow-md max-w-full break-words text-sm leading-relaxed">
                ${text.replace(/\n/g, '<br/>')}
            </div>
        `;
    } else {
        const bgColors = isError
            ? 'bg-red-900/50 border-red-700/50 text-red-100'
            : 'bg-gray-800 shadow shadow-indigo-500/10 border-gray-700/50 text-gray-200';

        const contextBadge = contextUsed
            ? `<span class="inline-block mt-2 text-xs font-semibold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded border border-emerald-400/20"><i class="fa-solid fa-file-check mr-1"></i> Contexto Prev. Utilizado</span>`
            : '';

        // Files analyzed badge (for invoice_checker responses)
        const agentInfo = getAgentInfo();
        const agentLabel = isError ? 'Error del Sistema' : agentInfo.label;
        const agentColor = isError ? 'text-red-400' : agentInfo.color;

        // Render markdown for AI responses, plain for errors
        const renderedContent = isError
            ? `<span class="font-mono text-sm">${text.replace(/\n/g, '<br>')}</span>`
            : renderMarkdown(text);

        innerHtml = `
            <div class="flex gap-4 p-4 rounded-xl ${bgColors} border w-full">
                <div class="flex-shrink-0 mt-1">
                    <div class="w-8 h-8 rounded ${isError ? 'bg-red-500' : 'bg-gradient-to-br from-indigo-500 to-purple-600'} flex items-center justify-center">
                        <i class="fa-solid ${isError ? 'fa-exclamation-triangle' : 'fa-robot'} text-white text-sm"></i>
                    </div>
                </div>
                <div class="flex flex-col flex-grow min-w-0">
                    <span class="text-xs ${agentColor} font-semibold mb-1">${agentLabel}</span>
                    <div class="text-sm leading-relaxed">${renderedContent}</div>
                    ${contextBadge}
                </div>
            </div>
        `;
    }

    container.innerHTML = innerHtml;
    chatMessages.appendChild(container);
    scrollBottom();
}

function appendLoader() {
    const id = 'loader-' + Date.now();
    const container = document.createElement('div');
    container.id = id;
    container.className = 'flex justify-start mr-12 message-loader';
    container.innerHTML = `
        <div class="flex gap-4 p-4 rounded-xl bg-gray-800 border border-gray-700/50 w-32 shadow shadow-indigo-500/10">
            <div class="flex-shrink-0 mt-1 hidden sm:block">
                <div class="w-8 h-8 rounded bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center animate-pulse">
                    <i class="fa-solid fa-robot text-white text-sm"></i>
                </div>
            </div>
            <div class="flex items-center ml-2 sm:ml-0">
                <div class="flex space-x-1.5">
                    <div class="w-2 h-2 bg-indigo-500 rounded-full typing-dot"></div>
                    <div class="w-2 h-2 bg-indigo-500 rounded-full typing-dot"></div>
                    <div class="w-2 h-2 bg-indigo-500 rounded-full typing-dot"></div>
                </div>
            </div>
        </div>
    `;
    chatMessages.appendChild(container);
    return id;
}

function removeLoader(id) {
    const loader = document.getElementById(id);
    if (loader) loader.remove();
}

function scrollBottom() {
    setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }, 50);
}
