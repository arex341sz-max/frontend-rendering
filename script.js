// ─── متغیرها ──────────────────────────────────────────────────────────────────
let backendUrl = '';
let isConnected = false;
let ws = null;
let chartInstance = null;
let historyData = [];
let statusInterval = null;

const elements = {
    statusBadge: document.getElementById('statusBadge'),
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    hashrate: document.getElementById('hashrate'),
    accepted: document.getElementById('accepted'),
    rejected: document.getElementById('rejected'),
    uptime: document.getElementById('uptime'),
    threadsDisplay: document.getElementById('threadsDisplay'),
    modeDisplay: document.getElementById('modeDisplay'),
    walletDisplay: document.getElementById('walletDisplay'),
    serverDisplay: document.getElementById('serverDisplay'),
    portDisplay: document.getElementById('portDisplay'),
    logContainer: document.getElementById('logContainer'),
    statusMsg: document.getElementById('statusMsg'),
    connectionStatus: document.getElementById('connectionStatus'),
    liveStatus: document.getElementById('liveStatus'),
    walletInput: document.getElementById('walletInput'),
    serverInput: document.getElementById('serverInput'),
    portInput: document.getElementById('portInput'),
    backendUrlInput: document.getElementById('backendUrl')
};

// ─── اتصال به بک‌اند ──────────────────────────────────────────────────────────
function connectBackend() {
    const url = elements.backendUrlInput.value.trim();
    if (!url) return showStatus('❌ آدرس بک‌اند را وارد کنید', 'error');
    backendUrl = url.replace(/\/+$/, '');
    testConnection();
}

async function testConnection() {
    showConnectionStatus('🔄 در حال تست اتصال...', 'info');
    try {
        const res = await fetch(`${backendUrl}/api/health`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
            isConnected = true;
            showConnectionStatus('✅ اتصال برقرار شد', 'success');
            elements.liveStatus.textContent = '🟢 متصل';
            connectWebSocket();
            refreshAll();
            if (statusInterval) clearInterval(statusInterval);
            statusInterval = setInterval(fetchStatus, 3000);
        } else {
            showConnectionStatus('❌ پاسخ ناموفق', 'error');
        }
    } catch(e) {
        showConnectionStatus(`❌ ${e.message}`, 'error');
    }
}

// ─── WebSocket (پایدار، بدون لاگ در کنسول) ──────────────────────────────────
function connectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
    }
    try {
        const wsProtocol = backendUrl.startsWith('https') ? 'wss' : 'ws';
        const wsUrl = backendUrl.replace(/^https?:\/\//, '');
        ws = new WebSocket(`${wsProtocol}://${wsUrl}/ws`);
        
        ws.onopen = function() {
            // بدون لاگ در ترمینال
        };
        
        ws.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'log') {
                    addLog(data.time, data.message, data.level);
                } else if (data.type === 'status') {
                    updateMetrics(data.data);
                }
            } catch(e) {
                // خطا را نادیده بگیر (بدون لاگ)
            }
        };
        
        ws.onclose = function() {
            // تلاش مجدد بدون لاگ
            setTimeout(connectWebSocket, 2000);
        };
        
        ws.onerror = function() {
            // خطا را نادیده بگیر (بدون لاگ)
        };
    } catch(e) {
        // بدون لاگ
        setTimeout(connectWebSocket, 3000);
    }
}

// ─── نمایش لاگ‌ها در صفحه ────────────────────────────────────────────────────
function addLog(time, msg, level = 'info') {
    const container = elements.logContainer;
    const empty = container.querySelector('.log-empty');
    if (empty) empty.remove();
    const entry = document.createElement('div');
    entry.className = `log-entry ${level}`;
    entry.innerHTML = `<span class="time">[${time}]</span><span class="message">${msg}</span>`;
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
    while (container.children.length > 500) {
        container.removeChild(container.firstChild);
    }
}

// ─── به‌روزرسانی متریک‌ها ────────────────────────────────────────────────────
function updateMetrics(data) {
    if (data.hashrate !== undefined) {
        elements.hashrate.textContent = data.hashrate.toFixed(0) + ' H/s';
        updateChart(data.hashrate);
    }
    if (data.accepted !== undefined) elements.accepted.textContent = data.accepted;
    if (data.rejected !== undefined) elements.rejected.textContent = data.rejected;
    if (data.uptime !== undefined) elements.uptime.textContent = formatUptime(data.uptime);
    if (data.wallet) elements.walletDisplay.textContent = data.wallet;
    if (data.server) elements.serverDisplay.textContent = data.server;
    if (data.port) elements.portDisplay.textContent = data.port;
    if (data.threads) elements.threadsDisplay.textContent = data.threads;
    if (data.mode) elements.modeDisplay.textContent = data.mode;
    
    const badge = elements.statusBadge;
    const dot = elements.statusDot;
    const text = elements.statusText;
    
    if (data.running && data.connected) {
        badge.className = 'status-badge online';
        dot.className = 'dot';
        text.textContent = '⚡ FULL POWER';
        elements.liveStatus.textContent = '⚡ استخراج فعال';
    } else if (data.running) {
        badge.className = 'status-badge connecting';
        dot.className = 'dot';
        text.textContent = '🔄 در حال اتصال...';
        elements.liveStatus.textContent = '🔄 در حال راه‌اندازی';
    } else {
        badge.className = 'status-badge offline';
        dot.className = 'dot';
        text.textContent = '⏹ غیرفعال';
        elements.liveStatus.textContent = '⏹ غیرفعال';
    }
}

function formatUptime(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return (h ? h + 'h ' : '') + (m ? m + 'm ' : '') + sec + 's';
}

// ─── نمودار ────────────────────────────────────────────────────────────────────
function initChart() {
    const ctx = document.getElementById('hashrateChart').getContext('2d');
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: '⚡ هش‌ریت (H/s)',
                data: [],
                borderColor: '#ff6b35',
                backgroundColor: 'rgba(255,107,53,0.08)',
                fill: true,
                tension: 0.4,
                pointRadius: 2,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#8a9bb8', font: { size: 11 } }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#5a6a8a', maxTicksLimit: 15 },
                    grid: { color: 'rgba(255,255,255,0.03)' }
                },
                y: {
                    ticks: { color: '#5a6a8a' },
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    beginAtZero: true
                }
            }
        }
    });
}

function updateChart(val) {
    if (!chartInstance) return;
    const now = new Date().toLocaleTimeString('fa-IR');
    historyData.push({ time: now, value: val });
    if (historyData.length > 100) historyData.shift();
    chartInstance.data.labels = historyData.map(d => d.time);
    chartInstance.data.datasets[0].data = historyData.map(d => d.value);
    chartInstance.update('none');
}

// ─── کنترل ماینر ──────────────────────────────────────────────────────────────
async function startMiner() {
    if (!isConnected) {
        return showStatus('❌ ابتدا به بک‌اند متصل شوید', 'error');
    }
    const wallet = elements.walletInput.value.trim();
    const server = elements.serverInput.value.trim();
    const port = parseInt(elements.portInput.value);
    
    if (!wallet || wallet.length < 10) {
        return showStatus('❌ کیف پول نامعتبر', 'error');
    }
    if (!server) {
        return showStatus('❌ استخر را وارد کنید', 'error');
    }
    if (isNaN(port) || port < 1 || port > 65535) {
        return showStatus('❌ پورت نامعتبر', 'error');
    }
    
    showStatus('⚡ در حال راه‌اندازی Full Power...', 'info');
    try {
        const res = await fetch(`${backendUrl}/api/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet, server, port })
        });
        const data = await res.json();
        if (res.ok) {
            showStatus('⚡ ' + data.message, 'success');
        } else {
            showStatus('❌ ' + data.detail, 'error');
        }
    } catch(e) {
        showStatus('❌ خطا: ' + e.message, 'error');
    }
    setTimeout(fetchStatus, 1000);
}

async function stopMiner() {
    if (!isConnected) {
        return showStatus('❌ ابتدا به بک‌اند متصل شوید', 'error');
    }
    showStatus('⏹️ در حال توقف...', 'info');
    try {
        const res = await fetch(`${backendUrl}/api/stop`, { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
            showStatus('✅ ' + data.message, 'success');
        } else {
            showStatus('❌ ' + data.detail, 'error');
        }
    } catch(e) {
        showStatus('❌ خطا: ' + e.message, 'error');
    }
    setTimeout(fetchStatus, 1000);
}

// ─── دریافت وضعیت ─────────────────────────────────────────────────────────────
async function fetchStatus() {
    if (!isConnected) return;
    try {
        const res = await fetch(`${backendUrl}/api/status`);
        if (res.ok) {
            const data = await res.json();
            updateMetrics(data);
        }
    } catch(e) {
        // بدون لاگ
    }
}

async function fetchLogs() {
    if (!isConnected) return;
    try {
        const res = await fetch(`${backendUrl}/api/logs?limit=50`);
        if (res.ok) {
            const data = await res.json();
            if (data.logs) {
                data.logs.forEach(log => {
                    addLog(log.time, log.message, log.level);
                });
            }
        }
    } catch(e) {
        // بدون لاگ
    }
}

// ─── نمایش پیام‌ها ───────────────────────────────────────────────────────────
function showStatus(msg, type = 'info') {
    const el = elements.statusMsg;
    if (!el) return;
    el.textContent = msg;
    el.style.color = type === 'error' ? '#ef5350' : type === 'success' ? '#4caf50' : '#8a9bb8';
}

function showConnectionStatus(msg, type = 'info') {
    const el = elements.connectionStatus;
    if (!el) return;
    el.textContent = msg;
    el.style.color = type === 'error' ? '#ef5350' : type === 'success' ? '#4caf50' : '#8a9bb8';
}

// ─── بروزرسانی همه ────────────────────────────────────────────────────────────
async function refreshAll() {
    await fetchStatus();
    await fetchLogs();
}

// ─── مقداردهی اولیه ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
    initChart();
    const saved = localStorage.getItem('backendUrl');
    if (saved) {
        elements.backendUrlInput.value = saved;
        setTimeout(connectBackend, 500);
    }
    document.getElementById('backendUrl')?.addEventListener('change', function() {
        localStorage.setItem('backendUrl', this.value);
    });
});

// ─── توابع قابل دسترس از HTML ───────────────────────────────────────────────
window.connectBackend = connectBackend;
window.startMiner = startMiner;
window.stopMiner = stopMiner;
window.refreshAll = refreshAll;
