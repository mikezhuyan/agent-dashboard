/**
 * Agent Dashboard v2 - Main Application
 */

// Global state
const state = {
    config: null,
    agents: [],
    stats: null,
    selectedAgent: null,
    refreshInterval: null,
    currentTab: 'general',
    viewMode: 'grid', // grid, grid-horizontal, list
    agentOrder: [],
    dragEnabled: true
};

// Utility functions
const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
};

const formatCurrency = (amount, currency = 'CNY', decimals = 4) => {
    const symbol = currency === 'CNY' ? '¥' : '$';
    return `${symbol}${amount.toFixed(decimals)}`;
};

const formatDuration = (ms) => {
    if (!ms) return '0s';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
};

const formatTimeWindow = (start, end) => {
    if (!start) return 'Unknown';
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : new Date();
    
    const format = (date) => {
        return date.toLocaleString('zh-CN', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };
    
    return `${format(startDate)} - ${end ? format(endDate) : '进行中'}`;
};

const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

const showNotification = (message, type = 'info') => {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <span>${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'}</span>
        <span>${message}</span>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
};

// API functions
const api = {
    async getConfig() {
        const response = await fetch('/api/config');
        return response.json();
    },
    
    async updateConfig(data, retries = 3) {
        let lastError;
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch('/api/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return await response.json();
            } catch (error) {
                lastError = error;
                console.warn(`[API] Config update failed (attempt ${i + 1}/${retries}):`, error.message);
                if (i < retries - 1) {
                    await new Promise(r => setTimeout(r, 300 * (i + 1))); // 递增延迟
                }
            }
        }
        throw lastError;
    },
    
    async getAgents() {
        const response = await fetch('/api/agents');
        return response.json();
    },
    
    async getAgentSessions(agentName) {
        const response = await fetch(`/api/agents/${agentName}/sessions`);
        return response.json();
    },
    
    async getStats() {
        const response = await fetch('/api/stats');
        return response.json();
    },
    
    async uploadAvatar(agentName, file) {
        const formData = new FormData();
        formData.append('avatar', file);
        
        const response = await fetch(`/api/agents/${agentName}/avatar`, {
            method: 'POST',
            body: formData
        });
        return response.json();
    },
    
    async updateAgentConfig(agentName, data) {
        const response = await fetch(`/api/agents/${agentName}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return response.json();
    },
    
    async getCostSummary() {
        const response = await fetch('/api/stats/cost-summary');
        return response.json();
    },
    
    async createAgent(data) {
        const response = await fetch('/api/agents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return response.json();
    },
    
    async deleteAgent(agentName) {
        const response = await fetch(`/api/agents/${agentName}`, {
            method: 'DELETE'
        });
        return response.json();
    },
    
    async getModelProviders() {
        const response = await fetch('/api/model-providers');
        return response.json();
    }
};

// UI functions
const createParticles = () => {
    const container = document.getElementById('particles');
    for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 10 + 's';
        particle.style.animationDuration = (10 + Math.random() * 10) + 's';
        container.appendChild(particle);
    }
};

const updateCurrentDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const weekday = weekdays[now.getDay()];
    document.getElementById('currentDate').textContent = `${year}年${month}月${day}日 ${weekday}`;
};

const renderStats = (stats) => {
    const showCost = state.config?.show_cost_estimates;
    const currency = state.config?.currency || 'CNY';
    
    let html = `
        <div class="stat-card">
            <div class="stat-value">${Object.keys(stats.byAgent).length}</div>
            <div class="stat-label">Agent 总数</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" style="color: var(--accent-green)">${stats.runningAgents}</div>
            <div class="stat-label">运行中</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${formatNumber(stats.totalSessions)}</div>
            <div class="stat-label">会话总数</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" style="color: var(--accent-purple)">${formatNumber(stats.totalTokens)}</div>
            <div class="stat-label">总 Token 使用量</div>
        </div>
    `;
    
    if (showCost && stats.totalCost) {
        html += `
            <div class="stat-card cost-card">
                <div class="stat-value">${formatCurrency(stats.totalCost.total_cost, currency, 2)}</div>
                <div class="stat-label">预估总费用</div>
                <div class="stat-sublabel">${currency}</div>
            </div>
        `;
    }
    
    document.getElementById('statsOverview').innerHTML = html;
};

let renderAgentCards = () => {
    const grid = document.getElementById('agentGrid');
    grid.innerHTML = '';
    
    if (!state.agents || state.agents.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
                <div class="empty-state-icon">🤖</div>
                <p>没有找到任何 Agent</p>
            </div>
        `;
        return;
    }
    
    // Sort agents by agentOrder if available
    let agentsToRender = [...state.agents];
    if (state.agentOrder && state.agentOrder.length > 0) {
        const orderMap = new Map(state.agentOrder.map((name, index) => [name, index]));
        agentsToRender.sort((a, b) => {
            const orderA = orderMap.get(a.name);
            const orderB = orderMap.get(b.name);
            if (orderA !== undefined && orderB !== undefined) {
                return orderA - orderB;
            }
            // Agents not in order list go to the end
            if (orderA !== undefined) return -1;
            if (orderB !== undefined) return 1;
            return 0;
        });
    }
    
    agentsToRender.forEach(agent => {
        const display = agent.display;
        const agentStats = state.stats?.byAgent?.[agent.name] || {};
        const session = agentStats.lastSession;
        const isRunning = agentStats.isRunning;
        
        const card = document.createElement('div');
        card.className = `agent-card ${isRunning ? 'running' : ''}`;
        card.dataset.agentName = agent.name;
        card.innerHTML = `
            <div class="agent-header">
                <div class="agent-identity">
                    <div class="avatar-container" onclick="openAvatarUpload('${agent.name}')">
                        <div class="avatar ${display.color}">
                            <div class="avatar-bg"></div>
                            <img src="/api/agents/${agent.name}/avatar" alt="${display.emoji} ${display.name}" 
                                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                            <span class="emoji-fallback" style="display:none">${display.emoji}</span>
                        </div>
                        <div class="avatar-upload-overlay">📷</div>
                        <div class="status-indicator"></div>
                    </div>
                    <div class="agent-info">
                        <div class="agent-name">${display.name}</div>
                        <div class="agent-role">${display.role}</div>
                        <span class="status-badge ${isRunning ? 'running' : 'idle'}">
                            ${isRunning ? '●' : '○'} ${isRunning ? '运行中' : '已结束'}
                        </span>
                        <div class="current-model" id="model-${agent.name}">
                            ${agentStats.currentModel ? `
                                <span class="model-icon">🤖</span>
                                <span class="model-name">${agentStats.currentModel}</span>
                            ` : '<span class="model-name">未运行</span>'}
                        </div>
                    </div>
                </div>
            </div>
            <div class="agent-body">
                <div class="token-section">
                    <div class="section-title">Token 使用情况</div>
                    <div class="token-bar-container">
                        <div class="token-header">
                            <span class="token-value">${formatNumber(agentStats.tokens || 0)}</span>
                            <span class="token-limit">tokens</span>
                        </div>
                        <div class="token-stats">
                            <div class="token-stat">
                                <span class="token-stat-value">${formatNumber(agentStats.inputTokens || 0)}</span>
                                <span class="token-stat-label">Input</span>
                            </div>
                            <div class="token-stat">
                                <span class="token-stat-value">${formatNumber(agentStats.outputTokens || 0)}</span>
                                <span class="token-stat-label">Output</span>
                            </div>
                            <div class="token-stat">
                                <span class="token-stat-value">${formatNumber(agentStats.cacheTokens || 0)}</span>
                                <span class="token-stat-label">Cache</span>
                            </div>
                        </div>
                        ${state.config?.show_cost_estimates && agentStats.estimatedCost ? `
                            <div class="cost-display">
                                <span class="cost-label">预估费用</span>
                                <span class="cost-value">${formatCurrency(agentStats.estimatedCost.total_cost, agentStats.estimatedCost.currency, 4)}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                <div class="task-section">
                    <div class="section-title">会话数 (${agentStats.sessions || 0})</div>
                    <div class="task-list" id="tasks-${agent.name}">
                        <div class="loading" style="padding: 20px;">
                            <div class="loading-spinner" style="width: 30px; height: 30px;"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        grid.appendChild(card);
        
        // Load sessions for this agent
        loadAgentTasks(agent.name);
    });
};

const loadAgentTasks = async (agentName) => {
    try {
        const sessions = await api.getAgentSessions(agentName);
        const container = document.getElementById(`tasks-${agentName}`);
        if (!container) return;
        
        const sessionList = Object.entries(sessions);
        if (sessionList.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="padding: 20px;">
                    <p>暂无会话记录</p>
                </div>
            `;
            return;
        }
        
        // Sort by updatedAt, take top 3
        sessionList.sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
        
        container.innerHTML = sessionList.slice(0, 3).map(([key, session]) => {
            const status = session.status || 'unknown';
            const statusClass = status === 'done' ? 'success' : status === 'running' ? 'running' : status === 'failed' ? 'error' : 'success';
            const statusText = status === 'done' ? '完成' : status === 'running' ? '运行中' : status === 'failed' ? '失败' : '完成';
            const icon = status === 'done' ? '✓' : status === 'running' ? '◉' : status === 'failed' ? '✗' : '✓';
            const label = session.label || '未命名任务';
            
            return `
                <div class="task-item ${statusClass}" onclick="showSessionDetails('${key}', '${escapeHtml(JSON.stringify(session))}')">
                    <div class="task-icon">${icon}</div>
                    <div class="task-content">
                        <div class="task-title">${escapeHtml(label)}</div>
                        <div class="task-meta">${formatDuration(session.runtimeMs)} · ${formatNumber(session.totalTokens || 0)} tokens</div>
                    </div>
                    <span class="task-status ${status}">${statusText}</span>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error(`Failed to load tasks for ${agentName}:`, e);
    }
};

// Modal functions
window.showSessionDetails = (sessionKey, sessionData) => {
    try {
        const session = JSON.parse(sessionData);
        const modal = document.getElementById('modalOverlay');
        const modalBody = document.getElementById('modalBody');
        
        const costHtml = session.estimatedCost ? `
            <div class="detail-section">
                <div class="detail-label">预估费用</div>
                <div class="detail-value" style="color: var(--accent-green); font-weight: 700;">
                    ${formatCurrency(session.estimatedCost.total_cost, session.estimatedCost.currency, 6)}
                </div>
            </div>
        ` : '';
        
        modalBody.innerHTML = `
            <div class="detail-section">
                <div class="detail-label">会话 ID</div>
                <div class="detail-value code">${session.sessionId || 'N/A'}</div>
            </div>
            <div class="detail-section">
                <div class="detail-label">状态</div>
                <div class="detail-value">
                    <span class="status-badge ${session.status === 'running' ? 'running' : 'idle'}">
                        ${session.status === 'running' ? '●' : '○'} ${session.status || 'Unknown'}
                    </span>
                </div>
            </div>
            <div class="detail-section">
                <div class="detail-label">模型</div>
                <div class="detail-value">${session.model || 'Unknown'} (${session.modelProvider || 'Unknown'})</div>
            </div>
            <div class="detail-section">
                <div class="detail-label">Token 统计</div>
                <div class="detail-value">
                    <div class="token-stats">
                        <div class="token-stat">
                            <span class="token-stat-value">${formatNumber(session.inputTokens || 0)}</span>
                            <span class="token-stat-label">Input</span>
                        </div>
                        <div class="token-stat">
                            <span class="token-stat-value">${formatNumber(session.outputTokens || 0)}</span>
                            <span class="token-stat-label">Output</span>
                        </div>
                        <div class="token-stat">
                            <span class="token-stat-value">${formatNumber(session.cacheRead || 0)}</span>
                            <span class="token-stat-label">Cache Read</span>
                        </div>
                        <div class="token-stat">
                            <span class="token-stat-value">${formatNumber(session.cacheWrite || 0)}</span>
                            <span class="token-stat-label">Cache Write</span>
                        </div>
                        <div class="token-stat">
                            <span class="token-stat-value">${formatNumber(session.totalTokens || 0)}</span>
                            <span class="token-stat-label">Total</span>
                        </div>
                    </div>
                </div>
            </div>
            ${costHtml}
            <div class="detail-section">
                <div class="detail-label">运行时间</div>
                <div class="detail-value">${formatDuration(session.runtimeMs)}</div>
            </div>
            <div class="detail-section">
                <div class="detail-label">时间窗口</div>
                <div class="detail-value">${formatTimeWindow(session.startedAt, session.endedAt)}</div>
            </div>
            ${session.label ? `
            <div class="detail-section">
                <div class="detail-label">任务标签</div>
                <div class="detail-value">${escapeHtml(session.label)}</div>
            </div>
            ` : ''}
        `;
        
        modal.classList.add('active');
    } catch (e) {
        console.error('Failed to show session details:', e);
    }
};

window.closeModal = () => {
    document.getElementById('modalOverlay').classList.remove('active');
};

// Settings modal
window.openSettings = () => {
    const modal = document.getElementById('settingsModal');
    modal.classList.add('active');
    loadSettingsForm();
};

window.closeSettings = () => {
    document.getElementById('settingsModal').classList.remove('active');
};

const loadSettingsForm = () => {
    const config = state.config;
    if (!config) return;
    
    document.getElementById('settingDashboardName').value = config.dashboard_name;
    document.getElementById('settingSubtitle').value = config.dashboard_subtitle;
    document.getElementById('settingRefreshInterval').value = config.refresh_interval;
    document.getElementById('settingShowCost').checked = config.show_cost_estimates;
    document.getElementById('settingInputPrice').value = config.token_cost?.input_price_per_1m || 2;
    document.getElementById('settingOutputPrice').value = config.token_cost?.output_price_per_1m || 8;
    document.getElementById('settingCachePrice').value = config.token_cost?.cache_price_per_1m || 1;
};

window.saveSettings = async () => {
    const data = {
        dashboard_name: document.getElementById('settingDashboardName').value,
        dashboard_subtitle: document.getElementById('settingSubtitle').value,
        refresh_interval: parseInt(document.getElementById('settingRefreshInterval').value),
        show_cost_estimates: document.getElementById('settingShowCost').checked,
        token_cost: {
            input_price_per_1m: parseFloat(document.getElementById('settingInputPrice').value),
            output_price_per_1m: parseFloat(document.getElementById('settingOutputPrice').value),
            cache_price_per_1m: parseFloat(document.getElementById('settingCachePrice').value)
        }
    };
    
    try {
        const result = await api.updateConfig(data);
        if (result.success) {
            showNotification('设置已保存，页面即将刷新...', 'success');
            closeSettings();
            // 延迟1秒后刷新页面，让用户看到通知
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } else {
            showNotification('保存失败: ' + (result.error || 'Unknown error'), 'error');
        }
    } catch (e) {
        showNotification('保存失败: ' + e.message, 'error');
    }
};

// Avatar upload
window.openAvatarUpload = (agentName) => {
    state.selectedAgent = agentName;
    const modal = document.getElementById('avatarModal');
    modal.classList.add('active');
    
    // Reset preview
    document.getElementById('avatarPreview').style.display = 'none';
    document.getElementById('avatarFileInput').value = '';
};

window.closeAvatarUpload = () => {
    document.getElementById('avatarModal').classList.remove('active');
    state.selectedAgent = null;
};

window.handleAvatarSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Preview
    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById('avatarPreview');
        preview.src = e.target.result;
        preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
};

window.uploadAvatar = async () => {
    const fileInput = document.getElementById('avatarFileInput');
    const file = fileInput.files[0];
    
    if (!file) {
        showNotification('请选择图片文件', 'error');
        return;
    }
    
    if (!state.selectedAgent) {
        showNotification('未选择Agent', 'error');
        return;
    }
    
    try {
        const result = await api.uploadAvatar(state.selectedAgent, file);
        if (result.success) {
            showNotification('头像上传成功', 'success');
            closeAvatarUpload();
            // Refresh agent cards
            await loadData();
            updateUI();
        } else {
            showNotification('上传失败: ' + (result.error || 'Unknown error'), 'error');
        }
    } catch (e) {
        showNotification('上传失败: ' + e.message, 'error');
    }
};

// Drag and drop for avatar
window.handleDragOver = (e) => {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
};

window.handleDragLeave = (e) => {
    e.currentTarget.classList.remove('dragover');
};

window.handleDrop = (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const fileInput = document.getElementById('avatarFileInput');
        fileInput.files = files;
        handleAvatarSelect({ target: fileInput });
    }
};

// Data loading
let loadData = async () => {
    try {
        // Load config if not loaded
        if (!state.config) {
            state.config = await api.getConfig();
            // Update page title
            document.title = state.config.dashboard_name;
            document.getElementById('dashboardTitle').textContent = state.config.dashboard_name;
            document.getElementById('dashboardSubtitle').textContent = state.config.dashboard_subtitle;
        }
        
        // Load agents and stats
        const [agents, stats] = await Promise.all([
            api.getAgents(),
            api.getStats()
        ]);
        
        state.agents = agents;
        state.stats = stats;
        
        return true;
    } catch (e) {
        console.error('Failed to load data:', e);
        showNotification('数据加载失败', 'error');
        return false;
    }
};

const updateUI = () => {
    if (state.stats) {
        renderStats(state.stats);
    }
    renderAgentCards();
};

let isDragging = false;

const startAutoRefresh = () => {
    if (state.refreshInterval) {
        clearInterval(state.refreshInterval);
    }
    
    const interval = (state.config?.refresh_interval || 30) * 1000;
    state.refreshInterval = setInterval(async () => {
        // Skip refresh if user is dragging
        if (isDragging) {
            console.log('[AutoRefresh] Skipped (dragging)');
            return;
        }
        await loadData();
        updateUI();
    }, interval);
};

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    createParticles();
    updateCurrentDate();
    
    // Initial data load
    const success = await loadData();
    if (success) {
        updateUI();
        startAutoRefresh();
    }
    
    // Event listeners
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal();
    });
    
    document.getElementById('settingsModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeSettings();
    });
    
    document.getElementById('avatarModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeAvatarUpload();
    });
    
    document.getElementById('createAgentModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeCreateAgentModal();
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
            closeSettings();
            closeAvatarUpload();
            closeCreateAgentModal();
        }
        if (e.key === 'r' && e.ctrlKey) {
            e.preventDefault();
            loadData().then(updateUI);
        }
    });
});


// Create Agent Modal Functions
window.openCreateAgentModal = async () => {
    const modal = document.getElementById('createAgentModal');
    modal.classList.add('active');
    
    // Load model providers
    await loadModelProviders();
};

window.closeCreateAgentModal = () => {
    document.getElementById('createAgentModal').classList.remove('active');
    // Reset form
    document.getElementById('newAgentId').value = '';
    document.getElementById('newAgentName').value = '';
    document.getElementById('newAgentRole').value = '';
    document.getElementById('newAgentEmoji').value = '🤖';
    document.getElementById('newAgentColor').value = 'cyan';
    document.getElementById('newAgentDescription').value = '';
    document.getElementById('newAgentSystemPrompt').value = '';
    // Reset provider and model selects
    document.getElementById('newAgentProvider').innerHTML = '<option value="">加载中...</option>';
    document.getElementById('newAgentModel').innerHTML = '<option value="">请先选择提供商</option>';
    modelProviders = [];
};

let modelProviders = [];

const loadModelProviders = async () => {
    const providerSelect = document.getElementById('newAgentProvider');
    const modelSelect = document.getElementById('newAgentModel');
    
    try {
        providerSelect.innerHTML = '<option value="">加载中...</option>';
        providerSelect.disabled = true;
        
        const providers = await api.getModelProviders();
        modelProviders = providers;
        
        providerSelect.disabled = false;
        
        if (!providers || providers.length === 0) {
            providerSelect.innerHTML = '<option value="">未配置模型提供商</option>';
            modelSelect.innerHTML = '<option value="">无可用模型</option>';
            console.warn('[Dashboard] 未在 OpenClaw 配置中找到模型提供商');
            return;
        }
        
        providerSelect.innerHTML = '<option value="">请选择提供商</option>';
        
        providers.forEach(provider => {
            const option = document.createElement('option');
            option.value = provider.id;
            option.textContent = `${provider.name} (${provider.models.length} 个模型)`;
            providerSelect.appendChild(option);
        });
        
        // Reset model select
        modelSelect.innerHTML = '<option value="">请先选择提供商</option>';
        
        console.log(`[Dashboard] 已加载 ${providers.length} 个模型提供商`);
    } catch (e) {
        console.error('Failed to load model providers:', e);
        providerSelect.disabled = false;
        providerSelect.innerHTML = '<option value="">加载失败，请重试</option>';
        modelSelect.innerHTML = '<option value="">加载失败</option>';
        showNotification('加载模型提供商失败: ' + e.message, 'error');
    }
};

window.onProviderChange = () => {
    const providerId = document.getElementById('newAgentProvider').value;
    const modelSelect = document.getElementById('newAgentModel');
    
    if (!providerId) {
        modelSelect.innerHTML = '<option value="">请先选择提供商</option>';
        return;
    }
    
    const provider = modelProviders.find(p => p.id === providerId);
    if (provider) {
        modelSelect.innerHTML = '<option value="">请选择模型</option>';
        provider.models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = `${model.name} (${model.contextWindow.toLocaleString()} tokens)`;
            modelSelect.appendChild(option);
        });
    }
};

window.createAgent = async () => {
    const agentId = document.getElementById('newAgentId').value.trim();
    const displayName = document.getElementById('newAgentName').value.trim();
    
    if (!agentId) {
        showNotification('请输入 Agent ID', 'error');
        return;
    }
    
    if (!displayName) {
        showNotification('请输入显示名称', 'error');
        return;
    }
    
    // Validate agent ID format
    if (!/^[a-z0-9_-]+$/.test(agentId)) {
        showNotification('Agent ID 只能包含小写字母、数字、连字符和下划线', 'error');
        return;
    }
    
    const data = {
        name: agentId,
        display_name: displayName,
        role: document.getElementById('newAgentRole').value.trim() || 'Agent',
        emoji: document.getElementById('newAgentEmoji').value || '🤖',
        color: document.getElementById('newAgentColor').value,
        description: document.getElementById('newAgentDescription').value.trim(),
        system_prompt: document.getElementById('newAgentSystemPrompt').value.trim(),
        model_provider: document.getElementById('newAgentProvider').value || 'deepseek',
        model_id: document.getElementById('newAgentModel').value || 'deepseek-chat'
    };
    
    try {
        const result = await api.createAgent(data);
        if (result.success) {
            showNotification(`Agent '${displayName}' 创建成功！`, 'success');
            closeCreateAgentModal();
            // Refresh page to show new agent
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } else {
            showNotification('创建失败: ' + (result.error || 'Unknown error'), 'error');
        }
    } catch (e) {
        showNotification('创建失败: ' + e.message, 'error');
    }
};


// ========================================
// View Mode Switching
// ========================================

window.switchView = (mode) => {
    state.viewMode = mode;
    
    // Update UI
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.closest('.view-btn').classList.add('active');
    
    // Update grid class
    const grid = document.getElementById('agentGrid');
    grid.className = 'agent-grid';
    
    if (mode === 'grid-horizontal') {
        grid.classList.add('grid-horizontal');
    } else if (mode === 'list') {
        grid.classList.add('list-view');
    }
    
    // Show/hide sort hint
    const hint = document.getElementById('sortHint');
    if (hint) {
        hint.style.display = mode === 'list' ? 'none' : 'block';
    }
    
    // Save preference
    saveViewPreference();
};

const saveViewPreference = async () => {
    try {
        await api.updateConfig({
            view_mode: state.viewMode,
            agent_order: state.agentOrder
        });
    } catch (e) {
        console.error('Failed to save view preference:', e);
    }
};

const loadViewPreference = () => {
    if (state.config) {
        state.viewMode = state.config.view_mode || 'grid';
        state.agentOrder = state.config.agent_order || [];
        
        // Apply view mode
        const grid = document.getElementById('agentGrid');
        if (grid) {
            grid.className = 'agent-grid';
            if (state.viewMode === 'grid-horizontal') {
                grid.classList.add('grid-horizontal');
            } else if (state.viewMode === 'list') {
                grid.classList.add('list-view');
            }
        }
        
        // Update view buttons
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeBtn = document.querySelector(`.view-btn[onclick*="'${state.viewMode}'"]`);
        if (activeBtn) activeBtn.classList.add('active');
        
        // Update sort hint
        const hint = document.getElementById('sortHint');
        if (hint) {
            hint.style.display = state.viewMode === 'list' ? 'none' : 'block';
        }
    }
};

// ========================================
// Drag and Drop Sorting (Real-time swap)
// ========================================

let draggedCard = null;
let draggedName = null;

const initDragAndDrop = () => {
    const grid = document.getElementById('agentGrid');
    if (!grid) {
        console.log('[Drag] Grid not found');
        return;
    }
    
    // Don't enable drag in list mode
    if (state.viewMode === 'list') {
        console.log('[Drag] List mode - drag disabled');
        grid.classList.remove('drag-enabled');
        return;
    }
    
    console.log('[Drag] Initializing, viewMode:', state.viewMode);
    grid.classList.add('drag-enabled');
    
    const cards = grid.querySelectorAll('.agent-card');
    console.log('[Drag] Found', cards.length, 'cards');
    
    cards.forEach((card, index) => {
        // Skip if already initialized
        if (card.dataset.dragInitialized === 'true') {
            console.log('[Drag] Card', index, 'already initialized');
            return;
        }
        
        // Enable draggable
        card.draggable = true;
        card.dataset.dragInitialized = 'true';
        
        console.log('[Drag] Setup card', index, ':', card.dataset.agentName, 'draggable:', card.draggable);
        
        // Drag Start
        card.addEventListener('dragstart', function(e) {
            const cardName = this.dataset.agentName;
            console.log('[Drag] dragstart:', cardName);
            isDragging = true;
            draggedCard = this;
            draggedName = cardName;
            
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', cardName);
            
            this.classList.add('dragging');
        });
        
        // Drag End - Save final order (debounced)
        card.addEventListener('dragend', function(e) {
            const cardName = this.dataset.agentName;
            console.log('[Drag] dragend:', cardName);
            isDragging = false;
            this.classList.remove('dragging');
            
            document.querySelectorAll('.agent-card').forEach(c => {
                c.classList.remove('drag-over');
            });
            
            // Update order immediately, but save with debounce
            console.log('[Drag] Calling updateAgentOrder and saveAgentOrder');
            updateAgentOrder();
            
            // Clear previous timeout and set new one
            if (saveOrderTimeout) {
                clearTimeout(saveOrderTimeout);
            }
            saveOrderTimeout = setTimeout(() => {
                saveAgentOrder();
                saveOrderTimeout = null;
            }, 100); // Small delay to batch rapid changes
            
            draggedCard = null;
            draggedName = null;
        });
        
        // Drag Over - Real-time swap (simplified)
        card.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            if (!draggedCard || this === draggedCard) return;
            
            const targetCard = this;
            
            // Simple swap: mouse above center -> insert before, below -> insert after
            const rect = targetCard.getBoundingClientRect();
            const mouseY = e.clientY;
            const cardCenterY = rect.top + rect.height / 2;
            
            // Get current indices to prevent unnecessary swaps
            const cards = Array.from(grid.querySelectorAll('.agent-card'));
            const draggedIndex = cards.indexOf(draggedCard);
            const targetIndex = cards.indexOf(targetCard);
            
            if (mouseY < cardCenterY) {
                // Mouse in upper half: insert before target
                if (draggedIndex !== targetIndex - 1) {
                    console.log('[Drag] Swap before:', draggedName, '->', targetCard.dataset.agentName);
                    grid.insertBefore(draggedCard, targetCard);
                }
            } else {
                // Mouse in lower half: insert after target
                if (draggedIndex !== targetIndex + 1) {
                    console.log('[Drag] Swap after:', draggedName, '->', targetCard.dataset.agentName);
                    grid.insertBefore(draggedCard, targetCard.nextSibling);
                }
            }
            
            targetCard.classList.add('drag-over');
        });
        
        // Drag Leave - Remove highlight
        card.addEventListener('dragleave', function(e) {
            // Only remove if we're actually leaving the card (not entering a child)
            if (!this.contains(e.relatedTarget)) {
                this.classList.remove('drag-over');
            }
        });
        
        // Drop - Finalize (order already updated in dragover)
        card.addEventListener('drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
            this.classList.remove('drag-over');
        });
    });
};


// Override renderAgentCards to support sorting
// Hook into renderAgentCards
const _originalRender = renderAgentCards;
renderAgentCards = function() {
    console.log('[Render] renderAgentCards called');
    _originalRender();
    
    // Apply custom order if exists
    if (state.agentOrder && state.agentOrder.length > 0) {
        const grid = document.getElementById('agentGrid');
        if (grid) {
            const cards = Array.from(grid.querySelectorAll('.agent-card'));
            
            cards.sort((a, b) => {
                const aName = a.dataset.agentName;
                const bName = b.dataset.agentName;
                const aIndex = state.agentOrder.indexOf(aName);
                const bIndex = state.agentOrder.indexOf(bName);
                if (aIndex === -1) return 1;
                if (bIndex === -1) return -1;
                return aIndex - bIndex;
            });
            
            cards.forEach(card => grid.appendChild(card));
        }
    }
    
    // Initialize drag and drop after render
    console.log('[Render] Scheduling initDragAndDrop, viewMode:', state.viewMode);
    setTimeout(() => {
        console.log('[Render] Calling initDragAndDrop');
        initDragAndDrop();
    }, 300);
};

// Modify loadData to load view preference
const originalLoadData = loadData;
loadData = async () => {
    const result = await originalLoadData();
    if (result) {
        loadViewPreference();
    }
    return result;
};

// Update and save agent order
const updateAgentOrder = () => {
    console.log('[Drag] Updating order...');
    const grid = document.getElementById('agentGrid');
    if (!grid) {
        console.log('[Drag] Grid not found!');
        return;
    }
    const cards = grid.querySelectorAll('.agent-card');
    console.log('[Drag] Found', cards.length, 'cards in grid');
    state.agentOrder = Array.from(cards).map(card => card.dataset.agentName);
    console.log('[Drag] Order updated:', state.agentOrder);
};

const saveAgentOrder = async () => {
    console.log('[Drag] Saving order...', state.agentOrder);
    try {
        const result = await api.updateConfig({
            agent_order: state.agentOrder
        });
        console.log('[Drag] Order saved, result:', result);
    } catch (e) {
        console.error('[Drag] Failed to save order:', e);
    }
};
