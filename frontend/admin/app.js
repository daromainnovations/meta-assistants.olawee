// OLAWEE | Execution Viewer Logic

let globalExecutions = [];
let currentFilter = 'ALL';

function setFilter(filterType) {
    currentFilter = filterType;

    // UI Update logic for buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('bg-gray-700', 'outline', 'outline-2', 'outline-blue-500', 'text-white');
        btn.classList.add('bg-gray-800', 'text-gray-400');
    });

    const activeBtn = Array.from(document.querySelectorAll('.filter-btn')).find(b => {
        if (filterType === 'ALL' && b.innerText.includes('Todas')) return true;
        if (filterType === 'CHATS' && b.innerText.includes('Chats')) return true;
        if (filterType === 'ASSISTANTS' && b.innerText.includes('Assistants')) return true;
        if (filterType === 'PYMES' && b.innerText.includes('PYMES')) return true;
        return false;
    });

    if (activeBtn) {
        activeBtn.classList.remove('bg-gray-800', 'text-gray-400');
        activeBtn.classList.add('bg-gray-700', 'outline', 'outline-2', 'outline-blue-500', 'text-white');
    }

    const labels = {
        'ALL': '(Global - Todas las Tablas)',
        'CHATS': '(Solo Modelos Directos)',
        'ASSISTANTS': '(Solo Agentes de Usuario)',
        'PYMES': '(Solo Agente PYMES OLAWEE)'
    };
    document.getElementById('filterLabel').innerText = labels[filterType];

    renderTable();
}

// Formatear Fecha
function formatDate(isoString) {
    const d = new Date(isoString);
    return `${d.toLocaleDateString()} a las ${d.toLocaleTimeString()}`;
}

// Cargar Datos del Servidor
async function fetchExecutions() {
    const tableBody = document.getElementById('executionsTable');
    try {
        const response = await fetch('http://localhost:3000/api/executions');
        if (!response.ok) throw new Error("Fallo en red o Endpoint no disponible");

        globalExecutions = await response.json();
        renderTable();
    } catch (error) {
        console.error("Error cargando ejecuciones:", error);
        tableBody.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-red-500 font-medium">Error de conexión: ${error.message}</td></tr>`;
    }
}

// Renderizar la Tabla
function renderTable() {
    const tableBody = document.getElementById('executionsTable');

    const filteredExecutions = globalExecutions.filter(exec => {
        if (currentFilter === 'ALL') return true;
        if (currentFilter === 'CHATS') return !['assistant', 'pymes-assistant'].includes(exec.provider);
        if (currentFilter === 'ASSISTANTS') return exec.provider === 'assistant';
        if (currentFilter === 'PYMES') return exec.provider === 'pymes-assistant';
        return true;
    });

    if (filteredExecutions.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-gray-400">No hay ejecuciones que coincidan con este filtro.</td></tr>`;
        return;
    }

    tableBody.innerHTML = ''; // Limpiar

    filteredExecutions.forEach((exec) => {
        // Estilos Dinámicos
        const isSuccess = exec.status === 'SUCCESS';
        const badgeColor = isSuccess ? 'bg-green-900/40 text-green-400 border-green-800' : 'bg-red-900/40 text-red-400 border-red-800';
        const iconInfo = isSuccess ? '✅ Ok' : '❌ Error';

        // Colores por proveedor para imitar estilo visual
        let provBadge = 'bg-gray-700 text-gray-300';
        let provName = exec.provider.toUpperCase();

        if (provName.includes('OPENAI')) provBadge = 'bg-teal-900 text-teal-300';
        if (provName.includes('GEMINI')) provBadge = 'bg-indigo-900 text-indigo-300';
        if (provName.includes('ASSISTANT')) provBadge = 'bg-purple-900 text-purple-300';
        if (provName.includes('PYMES')) provBadge = 'bg-amber-900 text-amber-300';

        const row = `
            <tr class="hover:bg-gray-700/50 transition-colors group cursor-pointer" onclick="openModal('${exec.id}')">
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium border ${badgeColor}">
                       ${iconInfo}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center">
                        <span class="inline-flex items-center justify-center h-6 w-6 rounded-md bg-gray-800 text-gray-400 shadow-sm border border-gray-600 mr-3 text-xs">
                          ⚡
                        </span>
                        <span class="text-sm font-medium px-2 py-0.5 rounded text-xs ${provBadge}">
                          ${provName}
                        </span>
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    <div class="flex items-center gap-2">
                        <svg class="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        ${formatDate(exec.created_at)}
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-xs font-mono text-gray-500">
                    ${exec.id.split('-')[0]}...
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button class="text-blue-400 hover:text-blue-300 opacity-0 group-hover:opacity-100 transition flex items-center gap-1 float-right">
                        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        Inspeccionar
                    </button>
                </td>
            </tr>
        `;
        tableBody.insertAdjacentHTML('beforeend', row);
    });
}

// Lógica del Modal
const modal = document.getElementById('jsonModal');
const inputCode = document.getElementById('inputJson');
const outputCode = document.getElementById('outputJson');
const modalMeta = document.getElementById('modalMeta');
const modalIcon = document.getElementById('modalIcon');

function openModal(execId) {
    console.log("Intentando abrir modal para ID:", execId);
    try {
        const exec = globalExecutions.find(e => e.id === execId || e.id == execId);
        if (!exec) {
            console.error("No se encontró la ejecución en globalExecutions con ID:", execId);
            alert("No se pudo encontrar la ejecución con ID: " + execId);
            return;
        }

        // Configurar metadatos
        modalMeta.innerText = `Exec ID: ${exec.id} | Grabado en BD: Supabase (qan8n2.0)`;
        modalIcon.innerText = exec.status === 'SUCCESS' ? '✅' : '💥';

        // Configurar JSON
        inputCode.textContent = JSON.stringify(exec.input || {}, null, 2);
        outputCode.textContent = JSON.stringify(exec.output || {}, null, 2);

        // Llamar a la librería Prism
        if (window.Prism) {
            Prism.highlightElement(inputCode);
            Prism.highlightElement(outputCode);
        } else {
            console.warn("PrismJS no está cargado. Omitiendo coloreado de sintaxis.");
        }

        // Mostrar
        modal.classList.remove('hidden');
    } catch (err) {
        console.error("Error dentro de openModal:", err);
        alert("Ocurrió un error al intentar abrir el modal: " + err.message);
    }
}

function closeModal() {
    modal.classList.add('hidden');
}

// Cerrar modal al clickar fuera
modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
});

// Iniciamos la carga
fetchExecutions();
