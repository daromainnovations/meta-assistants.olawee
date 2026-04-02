const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const fileInput = document.getElementById('fileInput');
const filePreview = document.getElementById('filePreview');
const fileNameSpan = document.getElementById('fileName');
const removeFileBtn = document.getElementById('removeFileBtn');
const sessionIdInput = document.getElementById('sessionId');

// 🧪 QA ONLY: Generar session ID único en cada carga (no aplica en producción)
if (sessionIdInput) {
    sessionIdInput.value = 'session_' + Math.random().toString(36).substring(2, 10);
}


const apiKeyInput = document.getElementById('apiKeyInput');

// Endpoint Backend
const API_URL = 'http://localhost:3000/gemini-chat';

let currentFile = null;

// Adjust textarea height automatically
messageInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});

// Handle File attachments
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        const fileNames = Array.from(e.target.files).map(f => f.name).join(', ');
        fileNameSpan.textContent = e.target.files.length > 1 ? `${e.target.files.length} archivos adjuntos` : fileNames;
        fileNameSpan.title = fileNames;
        filePreview.classList.remove('hidden');
    }
});

removeFileBtn.addEventListener('click', () => {
    currentFile = null;
    fileInput.value = '';
    filePreview.classList.add('hidden');
});

// Trigger send on Enter (without shift)
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

sendBtn.addEventListener('click', sendMessage);

async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text && fileInput.files.length === 0) return;

    // 1. Mostrar mensaje del usuario
    let attachmentLabel = '';
    if (fileInput.files.length > 0) {
        attachmentLabel = fileInput.files.length > 1 ? `[${fileInput.files.length} archivos adjuntados]` : `[Archivo adjuntado: ${fileInput.files[0].name}]`;
    }
    appendMessage('user', text + (text && attachmentLabel ? '\n' + attachmentLabel : attachmentLabel));

    // Config variables
    const session_id = sessionIdInput.value;
    const model = modelSelect.value;
    const apiKey = apiKeyInput.value;

    // Enviar Petición al Backend node.js (Asistentes)
    try {
        const prefix = window.API_PREFIX || '';
        const endpointUrl = `${prefix}/assistant-chat`;
        const formData = new FormData();
        formData.append('session_id', session_id);
        formData.append('model', model);
        formData.append('chatInput', text);
        formData.append('systemPrompt', document.getElementById('systemPrompt').value || 'Eres un asistente útil y amigable.');

        // Tool IDs (Asistentes en Producción)
        const rawTools = document.getElementById('toolsInput') ? document.getElementById('toolsInput').value : '';
        const toolsArray = rawTools.split(',').map(t => t.trim()).filter(t => t !== '');
        formData.append('tools', JSON.stringify(toolsArray.map(Number)));

        // Extraer historial visual y enviarlo
        const msgElements = Array.from(chatMessages.querySelectorAll('.chat-message'));
        const history = msgElements
            .filter(el => !el.classList.contains('message-typing'))
            .map(el => {
                const isAI = el.classList.contains('message-ai');
                const content = el.querySelector('.text-sm')?.textContent || '';
                return {
                    role: isAI ? 'assistant' : 'user',
                    content: content
                };
            }).slice(1, -2); // Excluir bienvenida y tu mensaje actual

        formData.append('history', JSON.stringify(history));

        if (fileInput.files.length > 0) {
            for (let i = 0; i < fileInput.files.length; i++) {
                formData.append('files', fileInput.files[i]);
            }
        }

        // Reset UI state
        messageInput.value = '';
        messageInput.style.height = 'auto';
        currentFile = null;
        fileInput.value = '';
        filePreview.classList.add('hidden');

        // Mostrar Loader
        const loaderId = appendLoader();
        scrollBottom();

        // 2. Fetch al backend
        try {
            const response = await fetch(endpointUrl, {
                method: 'POST',
                headers: {
                    'x-api-key': apiKey
                },
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

// ---- UI Helpers ---- //

function appendMessage(sender, text, contextUsed = false) {
    const isUser = sender === 'user';
    const isError = sender === 'error';
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
        const bgColors = isError ? 'bg-red-900/50 border-red-700/50 text-red-100' : 'bg-gray-800 shadow shadow-indigo-500/10 border-gray-700/50 text-gray-200';
        const contextBadge = contextUsed ? `<span class="inline-block mt-2 text-xs font-semibold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded border border-emerald-400/20"><i class="fa-solid fa-file-check mr-1"></i> Contexto Prev. Utilizado</span>` : '';

        innerHtml = `
            <div class="flex gap-4 p-4 rounded-xl ${bgColors} border w-full">
                <div class="flex-shrink-0 mt-1">
                    <div class="w-8 h-8 rounded ${isError ? 'bg-red-500' : 'bg-gradient-to-br from-indigo-500 to-purple-600'} flex items-center justify-center">
                        <i class="fa-solid ${isError ? 'fa-exclamation-triangle' : 'fa-robot'} text-white text-sm"></i>
                    </div>
                </div>
                <div class="flex flex-col flex-grow min-w-0">
                    <span class="text-xs ${isError ? 'text-red-400' : 'text-indigo-400'} font-semibold mb-1">${isError ? 'Error del Sistema' : 'Agente OLAWEE'}</span>
                    <div class="text-sm leading-relaxed whitespace-pre-wrap ${isError ? 'font-mono' : ''}">${text}</div>
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
    // A small delay to allow DOM to render
    setTimeout(() => {
        window.scrollTo({
            top: document.body.scrollHeight,
            behavior: 'smooth'
        });
    }, 50);
}
