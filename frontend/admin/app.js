// OLAWEE | Execution Control Center — Logic v20

let globalExecutions = [];
let globalStats = {};
let currentFilter = 'all';
let currentEnv = 'all';
let currentSearch = '';
let selectedIds = [];
let trendsChart = null;
let weeklyChart = null;

// ══════════════════════════════════════════════════════
// DATA FETCHING
// ══════════════════════════════════════════════════════

async function refreshData() {
    try {
        const query = new URLSearchParams({
            category: currentFilter,
            env: currentEnv,
            search: currentSearch,
            limit: 100
        });

        const response = await fetch(`/api/executions?${query}`);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        console.log('--- API DATA RECEIVED ---', data);
        
        globalExecutions = data.executions || [];
        globalStats = data.stats || {};

        updateStats();
        renderTable();
        updateChart('trendsChart', data.chartData, 'hour');
        updateChart('weeklyChart', data.weeklyTrends, 'day');

    } catch (e) {
        console.error('Fetch error:', e);
        document.getElementById('executionsTable').innerHTML = `
            <tr><td colspan="7" class="px-6 py-12 text-center text-red-400 font-mono">
                🛑 ERROR CARGANDO DATOS: ${e.message}
            </td></tr>`;
    }
}

// ══════════════════════════════════════════════════════
// STATS & CHARTS
// ══════════════════════════════════════════════════════

function updateStats() {
    const { total = 0, success = 0, errors = 0 } = globalStats;
    const rate = total > 0 ? Math.round((success / total) * 100) : 0;
    
    // Calcular latencia media de los últimos 100
    const latencies = globalExecutions.filter(e => e.duration_ms).map(e => e.duration_ms);
    const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

    document.getElementById('statTotal').innerText = total;
    document.getElementById('statSuccessRate').innerText = `${rate}%`;
    document.getElementById('statErrors').innerText = errors;
    document.getElementById('statLatency').innerText = `${avgLatency}ms`;
    
    // Status indicator
    const envStatus = document.getElementById('envStatus');
    envStatus.innerText = currentEnv === 'all' ? 'NETWORK ACTIVE' : `${currentEnv.toUpperCase()} ACTIVE`;
}

function updateChart(canvasId, chartData = [], timeField = 'hour') {
    console.log(`[Chart] Updating ${canvasId} with ${chartData?.length || 0} points`);
    
    if (typeof Chart === 'undefined') {
        console.warn('Chart.js not loaded yet, skipping chart update');
        return;
    }
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error(`[Chart] Canvas #${canvasId} NOT FOUND in DOM`);
        return;
    }
    const ctx = canvas.getContext('2d');
    
    if (!chartData || chartData.length === 0) {
        console.warn(`[Chart] No data for ${canvasId}`);
        return;
    }

    // Agrupar datos para Chart.js
    const labels = chartData.map(d => {
        const date = new Date(d[timeField] || d.hour || d.day);
        if (timeField === 'hour') return `${date.getHours()}:00`;
        return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    });

    const successPoints = chartData.map(d => d.success);
    const errorPoints = chartData.map(d => d.errors);

    // Destruir instancia anterior si existe
    if (canvasId === 'trendsChart' && trendsChart) trendsChart.destroy();
    if (canvasId === 'weeklyChart' && weeklyChart) weeklyChart.destroy();

    const chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Success',
                    data: successPoints,
                    borderColor: canvasId === 'trendsChart' ? '#3b82f6' : '#60a5fa',
                    backgroundColor: canvasId === 'trendsChart' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(96, 165, 250, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: timeField === 'day' ? 3 : 2
                },
                {
                    label: 'Errors',
                    data: errorPoints,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: timeField === 'day' ? 3 : 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 9 } } },
                y: { grid: { color: '#1e2d45' }, ticks: { color: '#64748b', font: { size: 9 } } }
            }
        }
    });

    if (canvasId === 'trendsChart') trendsChart = chartInstance;
    if (canvasId === 'weeklyChart') weeklyChart = chartInstance;
}

// ══════════════════════════════════════════════════════
// TABLE RENDERING
// ══════════════════════════════════════════════════════

function renderTable() {
    const tbody = document.getElementById('executionsTable');
    tbody.innerHTML = '';

    if (globalExecutions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-12 text-center text-gray-500 italic">No se encontraron ejecuciones</td></tr>';
        return;
    }

    globalExecutions.forEach(exec => {
        const isSuccess = exec.status === 'SUCCESS';
        const isSelected = selectedIds.includes(exec.id);
        const rowClass = isSuccess ? 'row-success' : 'row-error';
        const selectedClass = isSelected ? 'row-selected' : '';

        // Latency color
        const lat = exec.duration_ms || 0;
        const latColor = lat > 5000 ? 'text-red-400 font-bold' : (lat > 2000 ? 'text-amber-400' : 'text-emerald-400');

        const row = `
            <tr id="row-${exec.id}" class="${rowClass} ${selectedClass} hover:bg-white/5 transition-colors cursor-pointer group" onclick="handleRowClick(event, '${exec.id}')">
                <td class="px-6 py-4">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleSelect('${exec.id}')" onclick="event.stopPropagation()" class="rounded border-gray-700 bg-gray-900 text-blue-600">
                </td>
                <td class="px-6 py-4">
                    <span class="text-[10px] font-bold px-2 py-1 rounded-full ${isSuccess ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-500'}">
                        ${exec.status}
                    </span>
                </td>
                <td class="px-6 py-4">
                    <div class="flex flex-col">
                        <span class="text-xs font-bold text-gray-300 capitalize">${exec.category} / ${exec.provider}</span>
                        <span class="text-[10px] text-gray-500 mono truncate max-w-[150px]">${JSON.stringify(exec.input?.chatInput || exec.input?.model || '')}</span>
                    </div>
                </td>
                <td class="px-6 py-4">
                     <span class="text-[10px] mono font-bold ${exec.environment === 'production' ? 'text-purple-400' : 'text-amber-400'}">
                        ${exec.environment === 'production' ? '🚀 PROD' : '🧪 STAGING'}
                    </span>
                </td>
                <td class="px-6 py-4">
                    <span class="text-[10px] mono ${latColor}">${lat}ms</span>
                </td>
                <td class="px-6 py-4">
                    <span class="text-[10px] text-gray-500">${new Date(exec.created_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                </td>
                <td class="px-6 py-4 text-right">
                    <button class="opacity-0 group-hover:opacity-100 transition text-blue-400 text-[10px] font-bold" onclick="openModal('${exec.id}')">INSPECCIONAR</button>
                </td>
            </tr>
        `;
        tbody.insertAdjacentHTML('beforeend', row);
    });
}

// ══════════════════════════════════════════════════════
// FILTERS & ACTIONS
// ══════════════════════════════════════════════════════

function setFilter(cat) {
    currentFilter = cat;
    document.querySelectorAll('.filter-tab').forEach(b => b.classList.replace('tab-active', 'tab-inactive'));
    document.getElementById(`tab-${cat}`).classList.replace('tab-inactive', 'tab-active');
    refreshData();
}

function setEnv(env) {
    currentEnv = env;
    ['all', 'staging', 'production'].forEach(e => {
        const btn = document.getElementById(`env-${e}`);
        btn.classList.remove('bg-blue-600', 'text-white');
        btn.classList.add('text-gray-500');
    });
    const active = document.getElementById(`env-${env}`);
    active.classList.add('bg-blue-600', 'text-white');
    active.classList.remove('text-gray-500');
    refreshData();
}

let searchTimer;
function handleSearch(e) {
    currentSearch = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(refreshData, 500);
}

// ══════════════════════════════════════════════════════
// COMPARISON MODE
// ══════════════════════════════════════════════════════

function toggleSelect(id) {
    if (selectedIds.includes(id)) {
        selectedIds = selectedIds.filter(i => i !== id);
    } else {
        if (selectedIds.length < 2) selectedIds.push(id);
        else {
            alert('Solo puedes comparar dos ejecuciones a la vez.');
            return;
        }
    }
    updateComparisonBar();
    renderTable();
}

function handleRowClick(event, id) {
    if (event.ctrlKey) {
        toggleSelect(id);
    } else {
        openModal(id);
    }
}

function updateComparisonBar() {
    const bar = document.getElementById('comparisonBar');
    const count = document.getElementById('selectedCount');
    const btn = document.getElementById('compareBtn');
    
    count.innerText = selectedIds.length;
    btn.disabled = selectedIds.length !== 2;
    
    if (selectedIds.length > 0) {
        bar.classList.remove('translate-y-full');
    } else {
        bar.classList.add('translate-y-full');
    }
}

function clearSelection() {
    selectedIds = [];
    updateComparisonBar();
    renderTable();
}

function openComparison() {
    const execs = globalExecutions.filter(e => selectedIds.includes(e.id));
    if (execs.length !== 2) return;

    // Sort to keep order consistent
    execs.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));

    const renderPane = (exec) => `
        <div class="mb-4 flex justify-between items-center">
            <span class="text-[10px] font-bold px-2 py-0.5 rounded ${exec.status === 'SUCCESS' ? 'bg-green-500 text-black' : 'bg-red-500 text-white'}">${exec.status}</span>
            <span class="text-[10px] text-gray-500 mono">${exec.id.substring(0,8)}</span>
        </div>
        <h4 class="text-[10px] text-blue-400 font-bold mb-2">INPUT</h4>
        <pre class="bg-black/40 p-3 rounded mb-4 text-[10px] mono custom-scrollbar overflow-auto max-h-48">${JSON.stringify(exec.input, null, 2)}</pre>
        <h4 class="text-[10px] text-emerald-400 font-bold mb-2">OUTPUT</h4>
        <pre class="bg-black/40 p-3 rounded text-[10px] mono custom-scrollbar overflow-auto max-h-48">${JSON.stringify(exec.output, null, 2)}</pre>
    `;

    document.getElementById('paneA').innerHTML = renderPane(execs[0]);
    document.getElementById('paneB').innerHTML = renderPane(execs[1]);
    document.getElementById('comparisonModal').classList.remove('hidden');
}

function closeComparison() {
    document.getElementById('comparisonModal').classList.add('hidden');
}

// ══════════════════════════════════════════════════════
// MODAL & RETRY
// ══════════════════════════════════════════════════════

let activeModalId = null;

function openModal(id) {
    const exec = globalExecutions.find(e => e.id === id);
    if (!exec) return;
    activeModalId = id;

    const isSuccess = exec.status === 'SUCCESS';
    document.getElementById('modalStatusIcon').innerText = isSuccess ? '✅' : '💥';
    document.getElementById('modalTitle').innerText = `${exec.category.toUpperCase()} / ${exec.provider}`;
    document.getElementById('modalId').innerText = `ID: ${exec.id} • ${exec.environment.toUpperCase()} • ${exec.duration_ms}ms`;

    document.getElementById('modalInput').textContent = JSON.stringify(exec.input, null, 2);
    document.getElementById('modalOutput').textContent = JSON.stringify(exec.output, null, 2);

    const errSec = document.getElementById('modalErrorSection');
    if (!isSuccess && exec.error) {
        errSec.classList.remove('hidden');
        document.getElementById('modalError').textContent = JSON.stringify(exec.error, null, 2);
    } else {
        errSec.classList.add('hidden');
    }

    if (window.Prism) Prism.highlightAll();
    document.getElementById('modalBackdrop').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modalBackdrop').classList.add('hidden');
    activeModalId = null;
}

async function executeRetry() {
    if (!activeModalId) return;
    const btn = document.getElementById('retryBtn');
    const originalText = btn.innerHTML;
    
    try {
        btn.disabled = true;
        btn.innerHTML = '<span class="animate-spin">🔄</span> PROCESANDO...';
        
        const response = await fetch(`/api/executions/retry/${activeModalId}`, { method: 'POST' });
        const result = await response.json();
        
        if (response.ok) {
            alert('🔄 Re-ejecución completada con éxito.');
            refreshData();
            closeModal();
        } else {
            throw new Error(result.error || 'Error desconocido');
        }
    } catch (e) {
        alert('❌ Error al re-ejecutar: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// ══════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════

document.getElementById('modalBackdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modalBackdrop') closeModal();
});

window.onload = () => {
    refreshData();
    // Auto-refresh cada minuto por defecto
    setInterval(refreshData, 60000);
};
