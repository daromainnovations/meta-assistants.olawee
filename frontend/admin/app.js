// OLAWEE | Execution Control — Panel Logic v10

let globalExecutions = [];
let globalStats = {};
let currentFilter = 'all';
let autoRefreshInterval = null;
let autoRefreshOn = false;

// ══════════════════════════════════════════════════════
// FILTROS
// ══════════════════════════════════════════════════════

function setFilter(filter) {
    currentFilter = filter;

    document.querySelectorAll('.filter-tab').forEach(btn => {
        btn.classList.remove('tab-active');
        btn.classList.add('tab-inactive');
    });
    const activeTab = document.getElementById(`tab-${filter}`);
    if (activeTab) {
        activeTab.classList.remove('tab-inactive');
        activeTab.classList.add('tab-active');
    }

    const labels = {
        'all': 'Mostrando todas las ejecuciones',
        'llm': 'Mostrando solo LLM Chats (openai, gemini, anthropic...)',
        'assistant': 'Mostrando solo Assistants',
        'meta': 'Mostrando solo Meta Assistants',
        'error': 'Mostrando solo ejecuciones con error'
    };
    document.getElementById('filterInfo').innerText = labels[filter] || '';

    renderTable();
}

// ══════════════════════════════════════════════════════
// DATOS
// ══════════════════════════════════════════════════════

async function refreshData() {
    try {
        const response = await fetch('/api/executions');
        if (!response.ok) throw new Error('Endpoint no disponible');

        const data = await response.json();
        globalExecutions = data.executions || [];
        globalStats = data.stats || {};

        updateStats();
        renderTable();
        updateEnvBadge();

    } catch (error) {
        console.error('Error cargando ejecuciones:', error);
        document.getElementById('executionsTable').innerHTML = `
            <tr><td colspan="6" class="px-5 py-12 text-center">
                <div class="flex flex-col items-center gap-2">
                    <span class="text-3xl">⚠️</span>
                    <span class="text-sm text-red-400">Error de conexión: ${error.message}</span>
                </div>
            </td></tr>`;
    }
}

// ══════════════════════════════════════════════════════
// STATS
// ══════════════════════════════════════════════════════

function updateStats() {
    const { total = 0, success = 0, errors = 0, lastAt } = globalStats;
    const successRate = total > 0 ? Math.round((success / total) * 100) : 0;
    const errorRate = total > 0 ? Math.round((errors / total) * 100) : 0;

    document.getElementById('statTotal').innerText = total;
    document.getElementById('statSuccess').innerText = success;
    document.getElementById('statErrors').innerText = errors;
    document.getElementById('statSuccessRate').innerText = `${successRate}% tasa de éxito`;
    document.getElementById('statErrorRate').innerText = `${errorRate}% tasa de error`;
    document.getElementById('statLast').innerText = lastAt
        ? new Date(lastAt).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
        : '—';
}

function updateEnvBadge() {
    const exec = globalExecutions[0];
    if (exec) {
        const env = exec.environment || 'desconocido';
        const badge = document.getElementById('envBadge');
        badge.innerText = env === 'staging' ? '🧪 staging' : '🚀 production';
        badge.style.color = env === 'staging' ? '#fbbf24' : '#4ade80';
    }
}

// ══════════════════════════════════════════════════════
// RENDER TABLE
// ══════════════════════════════════════════════════════

function renderTable() {
    const tbody = document.getElementById('executionsTable');

    let filtered = globalExecutions.filter(exec => {
        if (currentFilter === 'all') return true;
        if (currentFilter === 'error') return exec.status === 'ERROR';
        return exec.category === currentFilter;
    });

    document.getElementById('filterInfo').innerText =
        `${filtered.length} ejecución${filtered.length !== 1 ? 'es' : ''} encontrada${filtered.length !== 1 ? 's' : ''}`;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-5 py-12 text-center text-gray-500">
            <div class="flex flex-col items-center gap-2">
                <span class="text-2xl">🔍</span>
                <span class="text-sm">No hay ejecuciones que coincidan con este filtro.</span>
            </div>
        </td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    filtered.forEach(exec => {
        const isSuccess = exec.status === 'SUCCESS';
        const rowClass = isSuccess ? 'row-success' : 'row-error';

        // Badge de categoría
        const catBadgeClass = exec.category === 'llm' ? 'badge-llm'
            : exec.category === 'assistant' ? 'badge-assistant'
            : 'badge-meta';
        const catLabel = exec.category === 'llm' ? '🤖 LLM'
            : exec.category === 'assistant' ? '🧠 Assistant'
            : '✨ Meta';

        // Badge de entorno
        const envBadge = exec.environment === 'staging'
            ? `<span class="mono text-xs px-1.5 py-0.5 rounded" style="background:#2d2000; color:#fbbf24;">🧪 QA</span>`
            : `<span class="mono text-xs px-1.5 py-0.5 rounded" style="background:#052e16; color:#4ade80;">🚀 Prod</span>`;

        // Duración
        const durText = exec.duration_ms != null
            ? `${exec.duration_ms > 1000 ? (exec.duration_ms / 1000).toFixed(1) + 's' : exec.duration_ms + 'ms'}`
            : '—';
        const durColor = exec.duration_ms > 5000 ? 'text-red-400'
            : exec.duration_ms > 2000 ? 'text-yellow-400'
            : 'text-blue-400';

        const row = `
            <tr class="${rowClass} row-enter hover:bg-white/5 transition-colors cursor-pointer group" onclick="openModal('${exec.id}')">
                <td class="px-5 py-4">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold"
                        style="${isSuccess ? 'background:#052e16; color:#4ade80;' : 'background:#2d0a0a; color:#f87171;'}">
                        ${isSuccess ? '✓ OK' : '✕ Error'}
                    </span>
                </td>
                <td class="px-5 py-4">
                    <div class="flex items-center gap-2">
                        <span class="text-xs px-2 py-0.5 rounded font-medium ${catBadgeClass}">${catLabel}</span>
                        <span class="mono text-xs text-gray-400">${exec.provider}</span>
                    </div>
                </td>
                <td class="px-5 py-4">${envBadge}</td>
                <td class="px-5 py-4">
                    <span class="mono text-xs ${durColor}">${durText}</span>
                </td>
                <td class="px-5 py-4 text-xs text-gray-400">
                    ${new Date(exec.created_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </td>
                <td class="px-5 py-4 text-right">
                    <button class="opacity-0 group-hover:opacity-100 transition text-xs text-blue-400 hover:text-blue-300 font-medium">
                        Inspeccionar →
                    </button>
                </td>
            </tr>`;
        tbody.insertAdjacentHTML('beforeend', row);
    });
}

// ══════════════════════════════════════════════════════
// MODAL
// ══════════════════════════════════════════════════════

function openModal(execId) {
    const exec = globalExecutions.find(e => e.id === execId);
    if (!exec) return;

    const isSuccess = exec.status === 'SUCCESS';

    document.getElementById('modalIcon').innerText = isSuccess ? '✅' : '💥';
    document.getElementById('modalMeta').innerText =
        `ID: ${exec.id} · ${exec.category?.toUpperCase()} / ${exec.provider}`;

    // Entorno badge
    const envBadgeEl = document.getElementById('modalEnvBadge');
    envBadgeEl.innerText = exec.environment === 'staging' ? '🧪 staging' : '🚀 production';
    envBadgeEl.style.background = exec.environment === 'staging' ? '#2d2000' : '#052e16';
    envBadgeEl.style.color = exec.environment === 'staging' ? '#fbbf24' : '#4ade80';

    // Duration
    const durEl = document.getElementById('modalDuration');
    if (exec.duration_ms != null) {
        durEl.innerText = exec.duration_ms > 1000
            ? `⏱ ${(exec.duration_ms / 1000).toFixed(2)}s`
            : `⏱ ${exec.duration_ms}ms`;
        durEl.style.display = '';
    } else {
        durEl.style.display = 'none';
    }

    // Error banner
    const errorBanner = document.getElementById('errorBanner');
    const errorSection = document.getElementById('errorSection');
    if (!isSuccess) {
        errorBanner.classList.remove('hidden');
        errorSection.classList.remove('hidden');
        document.getElementById('errorMessage').innerText =
            exec.error?.message || 'Error desconocido';
        document.getElementById('errorJson').textContent = JSON.stringify(exec.error || {}, null, 2);
    } else {
        errorBanner.classList.add('hidden');
        errorSection.classList.add('hidden');
    }

    // Input / Output
    document.getElementById('inputJson').textContent = JSON.stringify(exec.input || {}, null, 2);
    document.getElementById('outputJson').textContent = JSON.stringify(exec.output || {}, null, 2);

    if (window.Prism) {
        Prism.highlightAll();
    }

    document.getElementById('jsonModal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('jsonModal').classList.add('hidden');
}

document.getElementById('jsonModal').addEventListener('click', e => {
    if (e.target === document.getElementById('jsonModal')) closeModal();
});

// ══════════════════════════════════════════════════════
// AUTO-REFRESH
// ══════════════════════════════════════════════════════

function toggleAutoRefresh() {
    autoRefreshOn = !autoRefreshOn;
    const dot = document.getElementById('autoRefreshDot');
    const label = document.getElementById('autoRefreshLabel');

    if (autoRefreshOn) {
        autoRefreshInterval = setInterval(refreshData, 30000);
        dot.style.background = '#22c55e';
        label.innerText = 'Auto-refresh ON (30s)';
    } else {
        clearInterval(autoRefreshInterval);
        dot.style.background = '#6b7280';
        label.innerText = 'Auto-refresh OFF';
    }
}

// ══════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════
refreshData();
