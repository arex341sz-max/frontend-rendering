// ─── متغیرهای عمومی ──────────────────────────────────────────────────────────
let backendUrl = '';
let isConnected = false;
let statusInterval = null;
let chartInstance = null;
let historyData = [];
let ws = null;

// ─── DOM Elements ─────────────────────────────────────────────────────────────
const elements = {
    statusBadge: document.getElementById('statusBadge'),
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    hashrate: document.getElementById('hashrate'),
    accepted: document.getElementById('accepted'),
    rejected: document.getElementById('rejected'),
    uptime: document.getElementById('uptime'),
    threadsDisplay: document.getElementById('threadsDisplay'),
    walletDisplay: document.getElementById('walletDisplay'),
    serverDisplay: document.getElementById('serverDisplay'),
    portDisplay: document.getElementById('portDisplay'),
    backendDisplay: document.getElementById('backendDisplay'),
    logContainer: document.getElementById('logContainer'),
    statusMsg: document.getElementById('statusMsg'),
    connectionStatus: document.getElementById('connectionStatus'),
    liveStatus: document.getElementById('liveStatus'),
    walletInput: document.getElementById('walletInput'),
    serverInput: document.getElementById('serverInput'),
    portInput: document.getElementById('portInput'),
    backendUrlInput: document.getElementById('backendUrl'),
};

// ─── اتصال به بک‌اند ──────────────────────────────────────────────────────────
function connectBackend() {
    const url = elements.backendUrlInput.value.trim();
    if (!url) {
        showStatus('❌ لطفاً آدرس بک‌اند را وارد کنید', 'error');
        return;
    }
    
    // حذف / انتهای آدرس
    backendUrl = url.replace(/\/+$/, '');
    elements.backendDisplay.textContent = backendUrl;
    
    // تست اتصال
    testConnection();
}

async function testConnection() {
    showConnectionStatus('🔄 در حال تست اتصال...', 'info');
    
    try {
        const res = await fetch(`${backendUrl}/api/health`, {
            signal: AbortSignal.timeout(5000)
        });
        
        if (res.ok) {
            const data = await res.json();
            isConnected = true;
            showConnectionStatus('✅ اتصال به بک‌اند برقرار شد', 'success');
            elements.liveStatus.textContent = '🟢 متصل به بک‌اند';
            
            // اتصال WebSocket
            connectWebSocket();
            
            // شروع به‌روزرسانی
            refreshAll();
            if (statusInterval) clearInterval(statusInterval);
            statusInterval = setInterval(fetchStatus, 5000);
            
        } else {
            showConnectionStatus('❌ پاسخ ناموفق از بک‌اند', 'error');
            isConnected = false;
        }
    } catch(e) {
        showConnectionStatus(`❌ اتصال ناموفق: ${e.message}`, 'error');
        isConnected = false;
    }
}

function showConnectionStatus(msg, type = 'info') {
    const el = elements.connectionStatus;
    if (!el) return;
    el.textContent = msg;
    el.style.color = type === 'error' ? '#ef5350' : 
                     type === 'success' ? '#4caf50' : 
                     type === 'warning' ? '#ffc107' : '#8a9bb8';
}

// ─── WebSocket ────────────────────────────────────────────────────────────────
function connectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
    }
    
    try {
        const wsProtocol = backendUrl.startsWith('https') ? 'wss' : 'ws';
        const wsUrl = backendUrl.replace(/^https?:\/\//, '');
        ws = new WebSocket(`${wsProtocol}://${wsUrl}/ws`);
        
        ws.onopen = function() {
            console.log('✅ WebSocket connected');
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
                console.error('WebSocket message error:', e);
            }
        };
        
        ws.onclose = function() {
            console.log('❌ WebSocket disconnected');
            // تلاش مجدد بعد از ۵ ثانیه
            setTimeout(connectWebSocket, 5000);
        };
        
        ws.onerror = function(error) {
            console.error('⚠️ WebSocket error:', error);
        };
    } catch(e) {
        console.error('WebSocket connection error:', e);
    }
}

// ─── Logs ─────────────────────────────────────────────────────────────────────
function addLog(time, message, level = 'info') {
    const container = elements.logContainer;
    
    // حذف پیام خالی اگر وجود داشت
    const empty = container.querySelector('.log-empty');
    if (empty) empty.remove();
    
    const entry = document.createElement('div');
    entry.className = `log-entry ${level}`;
    entry.innerHTML = `<span class="time">[${time}]</span><span class="message">${escapeHtml(message)}</span>`;
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
    
    // محدود کردن تعداد لاگ‌ها
    while (container.children.length > 500) {
        container.removeChild(container.firstChild);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ─── Metrics ──────────────────────────────────────────────────────────────────
function updateMetrics(data) {
    if (data.hashrate !== undefined) {
        elements.hashrate.textContent = data.hashrate.toFixed(0) + ' H/s';
        updateChart(data.hashrate);
    }
    if (data.accepted !== undefined) {
        elements.accepted.textContent = data.accepted;
    }
    if (data.rejected !== undefined) {
        elements.rejected.textContent = data.rejected;
    }
    if (data.uptime !== undefined) {
        elements.uptime.textContent = formatUptime(data.uptime);
    }
    if (data.wallet) {
        elements.walletDisplay.textContent = data.wallet;
    }
    if (data.server) {
        elements.serverDisplay.textContent = data.server;
    }
    if (data.port) {
        elements.portDisplay.textContent = data.port;
    }
    if (data.threads) {
        elements.threadsDisplay.textContent = data.threads;
    }
    
    // وضعیت
    if (data.running && data.connected) {
        elements.statusBadge.className = 'status-badge online';
        elements.statusDot.className = 'dot';
        elements.statusText.textContent = '⛏️ فعال';
        elements.liveStatus.textContent = '⛏️ در حال استخراج';
    } else if (data.running) {
        elements.statusBadge.className = 'status-badge connecting';
        elements.statusDot.className = 'dot';
        elements.statusText.textContent = '🔄 اتصال...';
        elements.liveStatus.textContent = '🔄 در حال اتصال...';
    } else {
        elements.statusBadge.className = 'status-badge offline';
        elements.statusDot.className = 'dot';
        elements.statusText.textContent = '⏹ غیرفعال';
        elements.liveStatus.textContent = '⏹ غیرفعال';
    }
}

function formatUptime(seconds) {
    if (!seconds) return '0s';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return (h > 0 ? h + 'h ' : '') + (m > 0 ? m + 'm ' : '') + s + 's';
}

// ─── Chart ────────────────────────────────────────────────────────────────────
function initChart() {
    const ctx = document.getElementById('hashrateChart').getContext('2d');
    
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'هش‌ریت (H/s)',
                data: [],
                borderColor: '#4fc3f7',
                backgroundColor: 'rgba(79, 195, 247, 0.08)',
                fill: true,
                tension: 0.4,
                pointRadius: 2,
                pointBackgroundColor: '#4fc3f7',
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
                    ticks: { color: '#5a6a8a', font: { size: 9 }, maxTicksLimit: 15 },
                    grid: { color: 'rgba(255,255,255,0.03)' }
                },
                y: {
                    ticks: { color: '#5a6a8a', font: { size: 9 } },
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    beginAtZero: true
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    });
}

function updateChart(value) {
    if (!chartInstance) return;
    
    const now = new Date();
    const timeStr = now.toLocaleTimeString('fa-IR');
    
    historyData.push({ time: timeStr, value: value });
    if (historyData.length > 100) {
        historyData.shift();
    }
    
    chartInstance.data.labels = historyData.map(d => d.time);
    chartInstance.data.datasets[0].data = historyData.map(d => d.value);
    chartInstance.update('none');
}

// ─── API Calls ────────────────────────────────────────────────────────────────
async function startMiner() {
    if (!isConnected) {
        showStatus('❌ ابتدا به بک‌اند متصل شوید', 'error');
        return;
    }
    
    const wallet = elements.walletInput.value.trim();
    const server = elements.serverInput.value.trim();
    const port = parseInt(elements.portInput.value);
    
    if (!wallet || wallet.length < 10) {
        showStatus('❌ آدرس کیف پول نامعتبر است', 'error');
        return;
    }
    if (!server) {
        showStatus('❌ آدرس استخر را وارد کنید', 'error');
        return;
    }
    if (isNaN(port) || port < 1 || port > 65535) {
        showStatus('❌ پورت نامعتبر است', 'error');
        return;
    }
    
    showStatus('🔄 در حال راه‌اندازی...', 'info');
    
    try {
        const res = await fetch(`${backendUrl}/api/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet, server, port })
        });
        const data = await res.json();
        
        if (res.ok) {
            showStatus('✅ ' + data.message, 'success');
        } else {
            showStatus('❌ ' + data.detail, 'error');
        }
    } catch(e) {
        showStatus('❌ خطا در ارتباط با بک‌اند: ' + e.message, 'error');
    }
    
    setTimeout(fetchStatus, 1000);
}

async function stopMiner() {
    if (!isConnected) {
        showStatus('❌ ابتدا به بک‌اند متصل شوید', 'error');
        return;
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
        showStatus('❌ خطا در ارتباط با بک‌اند: ' + e.message, 'error');
    }
    
    setTimeout(fetchStatus, 1000);
}

async function fetchStatus() {
    if (!isConnected) return;
    
    try {
        const res = await fetch(`${backendUrl}/api/status`);
        if (res.ok) {
            const data = await res.json();
            updateMetrics(data);
        }
    } catch(e) {
        console.error('Status fetch error:', e);
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
        console.error('Logs fetch error:', e);
    }
}

function showStatus(msg, type = 'info') {
    const el = elements.statusMsg;
    if (!el) return;
    el.textContent = msg;
    el.style.color = type === 'error' ? '#ef5350' : 
                     type === 'success' ? '#4caf50' : 
                     type === 'warning' ? '#ffc107' : '#8a9bb8';
}

// ─── Refresh ──────────────────────────────────────────────────────────────────
async function refreshAll() {
    await fetchStatus();
    await fetchLogs();
}

// ─── Initialization ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
    // راه‌اندازی نمودار
    initChart();
    
    // بارگذاری اولیه
    const savedUrl = localStorage.getItem('backendUrl');
    if (savedUrl) {
        elements.backendUrlInput.value = savedUrl;
    }
    
    // اتصال خودکار اگر آدرس ذخیره شده باشد
    if (savedUrl) {
        setTimeout(connectBackend, 500);
    }
    
    // ذخیره آدرس بک‌اند در localStorage
    document.getElementById('backendUrl')?.addEventListener('change', function() {
        localStorage.setItem('backendUrl', this.value);
    });
});

// ─── تابع برای دسترسی از HTML ──────────────────────────────────────────────
window.connectBackend = connectBackend;
window.startMiner = startMiner;
window.stopMiner = stopMiner;
window.refreshAll = refreshAll;
