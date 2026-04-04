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
    dragEnabled: true,
    openclawBaseUrl: null,  // OpenClaw base URL for work check links
    sidebarOpen: false  // 侧边栏展开状态
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
    },
    
    async getOpenClawUrl() {
        const response = await fetch('/api/openclaw-url');
        return response.json();
    },
    
    // Subagents API
    async getAgentSubagents(agentName) {
        const response = await fetch(`/api/agents/${agentName}/subagents`);
        return response.json();
    },
    
    async updateAgentSubagents(agentName, data) {
        const response = await fetch(`/api/agents/${agentName}/subagents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return response.json();
    },
    
    async addAgentToAllowAgents(targetAgent, agentToAdd) {
        const response = await fetch(`/api/agents/${targetAgent}/subagents/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agentToAdd })
        });
        return response.json();
    },
    
    async removeAgentFromAllowAgents(targetAgent, agentToRemove) {
        const response = await fetch(`/api/agents/${targetAgent}/subagents/remove`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agentToRemove })
        });
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

// Work check function
window.openWorkCheck = (agentName) => {
    if (!state.openclawBaseUrl) {
        showNotification('OpenClaw URL 未配置，请在设置中配置', 'error');
        return;
    }
    const url = `${state.openclawBaseUrl}/chat?session=agent%3A${agentName}%3A${agentName}`;
    window.open(url, '_blank');
};

// 渲染侧边栏内容
const renderSidebar = (agentName) => {
    const agent = state.agents.find(a => a.name === agentName);
    if (!agent) return;
    
    const display = agent.display;
    const agentStats = state.stats?.byAgent?.[agent.name] || {};
    const workCheckUrl = state.openclawBaseUrl 
        ? `${state.openclawBaseUrl}/chat?session=agent%3A${agent.name}%3A${agent.name}`
        : null;
    
    const sidebarContent = document.getElementById('sidebarContent');
    sidebarContent.innerHTML = `
        <div class="sidebar-agent-header">
            <div class="sidebar-avatar ${display.color}">
                <span>${display.emoji}</span>
            </div>
            <div class="sidebar-agent-info">
                <h4>${display.name}</h4>
                <p>${display.role}</p>
                <span class="sidebar-status ${agentStats.isRunning ? 'running' : 'idle'}">
                    ${agentStats.isRunning ? '●' : '○'} ${agentStats.isRunning ? '运行中' : '已结束'}
                </span>
            </div>
        </div>
        
        ${workCheckUrl ? `
            <a href="${workCheckUrl}" target="_blank" class="sidebar-work-check">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                </svg>
                打开对话
            </a>
        ` : ''}
        
        <div class="sidebar-section">
            <h5>📊 Token 统计</h5>
            <div class="sidebar-token-total">
                <span class="token-total-value">${formatNumber(agentStats.tokens || 0)}</span>
                <span class="token-total-label">总 Tokens</span>
            </div>
            <div class="sidebar-token-stats">
                <div class="sidebar-token-item">
                    <span class="token-dot input"></span>
                    <span class="token-label">Input</span>
                    <span class="token-value">${formatNumber(agentStats.inputTokens || 0)}</span>
                </div>
                <div class="sidebar-token-item">
                    <span class="token-dot output"></span>
                    <span class="token-label">Output</span>
                    <span class="token-value">${formatNumber(agentStats.outputTokens || 0)}</span>
                </div>
                <div class="sidebar-token-item">
                    <span class="token-dot cache"></span>
                    <span class="token-label">Cache</span>
                    <span class="token-value">${formatNumber(agentStats.cacheTokens || 0)}</span>
                </div>
            </div>
            ${state.config?.show_cost_estimates && agentStats.estimatedCost ? `
                <div class="sidebar-cost">
                    <span class="cost-label">预估费用</span>
                    <span class="cost-value">${formatCurrency(agentStats.estimatedCost.total_cost, agentStats.estimatedCost.currency, 4)}</span>
                </div>
            ` : ''}
        </div>
        
        <div class="sidebar-section">
            <h5>💬 会话记录 (${agentStats.sessions || 0})</h5>
            <div class="sidebar-task-list" id="sidebar-tasks-${agent.name}">
                <div class="loading" style="padding: 20px;">
                    <div class="loading-spinner" style="width: 30px; height: 30px;"></div>
                </div>
            </div>
        </div>
    `;
    
    // Load sessions for sidebar
    loadSidebarTasks(agent.name);
};

// 加载侧边栏任务列表
const loadSidebarTasks = async (agentName) => {
    try {
        const sessions = await api.getAgentSessions(agentName);
        const container = document.getElementById(`sidebar-tasks-${agentName}`);
        if (!container) return;
        
        const sessionList = Object.entries(sessions);
        if (sessionList.length === 0) {
            container.innerHTML = `
                <div class="sidebar-empty-tasks">
                    <p>暂无会话记录</p>
                </div>
            `;
            return;
        }
        
        // Sort by updatedAt
        sessionList.sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
        
        container.innerHTML = sessionList.map(([key, session]) => {
            const status = session.status || 'unknown';
            const statusClass = status === 'done' ? 'success' : status === 'running' ? 'running' : status === 'failed' ? 'error' : 'success';
            const statusText = status === 'done' ? '完成' : status === 'running' ? '运行中' : status === 'failed' ? '失败' : '完成';
            const label = session.label || '未命名任务';
            
            return `
                <div class="sidebar-task-item ${statusClass}" onclick="showSessionDetails('${key}', '${escapeHtml(JSON.stringify(session))}')">
                    <div class="task-status-dot ${status}"></div>
                    <div class="task-info">
                        <div class="task-title">${escapeHtml(label)}</div>
                        <div class="task-meta">${formatDuration(session.runtimeMs)} · ${formatNumber(session.totalTokens || 0)} tokens</div>
                    </div>
                    <span class="task-status-text">${statusText}</span>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error(`Failed to load tasks for ${agentName}:`, e);
    }
};

// 切换侧边栏
window.toggleSidebar = () => {
    state.sidebarOpen = !state.sidebarOpen;
    document.body.classList.toggle('sidebar-open', state.sidebarOpen);
};

// 选择 Agent 显示在侧边栏
window.selectAgent = (agentName) => {
    state.selectedAgent = agentName;
    renderSidebar(agentName);
    if (!state.sidebarOpen) {
        toggleSidebar();
    }
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
            if (orderA !== undefined) return -1;
            if (orderB !== undefined) return 1;
            return 0;
        });
    }
    
    agentsToRender.forEach(agent => {
        const display = agent.display;
        const agentStats = state.stats?.byAgent?.[agent.name] || {};
        const isRunning = agentStats.isRunning;
        const isSelected = state.selectedAgent === agent.name;
        
        const card = document.createElement('div');
        card.className = `agent-card ${isRunning ? 'running' : ''} ${isSelected ? 'selected' : ''}`;
        card.dataset.agentName = agent.name;
        card.onclick = (e) => {
            // Don't select if clicking on drag handle or work check button
            if (e.target.closest('.drag-handle') || e.target.closest('.work-check-btn')) {
                return;
            }
            selectAgent(agent.name);
        };
        
        card.innerHTML = `
            <!-- Drag Handle -->
            <div class="drag-handle" title="拖动调整排序">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="9" cy="6" r="1.5" fill="currentColor"/>
                    <circle cx="9" cy="12" r="1.5" fill="currentColor"/>
                    <circle cx="9" cy="18" r="1.5" fill="currentColor"/>
                    <circle cx="15" cy="6" r="1.5" fill="currentColor"/>
                    <circle cx="15" cy="12" r="1.5" fill="currentColor"/>
                    <circle cx="15" cy="18" r="1.5" fill="currentColor"/>
                </svg>
            </div>
            
            <div class="agent-header">
                <div class="agent-identity">
                    <div class="avatar-container" onclick="event.stopPropagation(); openAvatarUpload('${agent.name}')">
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
                        ${agentStats.currentModel ? `
                            <div class="current-model-compact">
                                <span>${agentStats.currentModel}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
            
            <!-- Work Check Button -->
            <button class="work-check-btn" 
                    onclick="event.stopPropagation(); openWorkCheck('${agent.name}')"
                    ${state.openclawBaseUrl ? '' : 'disabled title="OpenClaw URL 未配置"'}>
                <svg class="work-check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                </svg>
                <span class="work-check-tooltip">对话</span>
            </button>
            
            <!-- Quick Stats -->
            <div class="agent-quick-stats">
                <div class="quick-stat">
                    <span class="quick-stat-value">${formatNumber(agentStats.tokens || 0)}</span>
                    <span class="quick-stat-label">Tokens</span>
                </div>
                <div class="quick-stat">
                    <span class="quick-stat-value">${agentStats.sessions || 0}</span>
                    <span class="quick-stat-label">会话</span>
                </div>
            </div>
        `;
        
        grid.appendChild(card);
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
    // 使用 ?? 空值合并运算符，只有 null/undefined 时才使用默认值（0 是有效值）
    document.getElementById('settingInputPrice').value = config.token_cost?.input_price_per_1m ?? 2;
    document.getElementById('settingOutputPrice').value = config.token_cost?.output_price_per_1m ?? 8;
    document.getElementById('settingCachePrice').value = config.token_cost?.cache_price_per_1m ?? 1;
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
            
            // Load view mode and agent order from config
            state.viewMode = state.config.view_mode || 'grid';
            state.agentOrder = state.config.agent_order || [];
            console.log('[Load] Loaded agentOrder:', state.agentOrder);
        }
        
        // Load OpenClaw URL
        try {
            const openclawUrlData = await api.getOpenClawUrl();
            state.openclawBaseUrl = openclawUrlData.base_url;
            console.log('[Load] OpenClaw URL:', state.openclawBaseUrl);
        } catch (e) {
            console.warn('[Load] Failed to load OpenClaw URL:', e);
            state.openclawBaseUrl = null;
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
    
    document.getElementById('subagentsModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeSubagentsManager();
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
        // viewMode and agentOrder are already loaded in loadData
        // This function only applies UI changes
        
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
        
        // Drag End - Save final order immediately
        card.addEventListener('dragend', async function(e) {
            const cardName = this.dataset.agentName;
            console.log('[Drag] dragend:', cardName);
            isDragging = false;
            this.classList.remove('dragging');
            
            document.querySelectorAll('.agent-card').forEach(c => {
                c.classList.remove('drag-over');
            });
            
            // Small delay to ensure DOM is settled, then update and save
            console.log('[Drag] Will update and save order...');
            setTimeout(async () => {
                updateAgentOrder();
                await saveAgentOrder();
                draggedCard = null;
                draggedName = null;
            }, 50);
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


// Hook into renderAgentCards to init drag and drop
const _originalRender = renderAgentCards;
renderAgentCards = function() {
    console.log('[Render] renderAgentCards called, agentOrder:', state.agentOrder);
    _originalRender();
    
    // Initialize drag and drop after render
    console.log('[Render] Scheduling initDragAndDrop, viewMode:', state.viewMode);
    setTimeout(() => {
        console.log('[Render] Calling initDragAndDrop');
        initDragAndDrop();
    }, 100);
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
    // Get cards in their current DOM order
    const cards = Array.from(grid.children).filter(el => el.classList.contains('agent-card'));
    console.log('[Drag] Found', cards.length, 'cards in grid');
    
    // Log each card's position for debugging
    cards.forEach((card, i) => {
        console.log(`[Drag] Card ${i}: ${card.dataset.agentName}`);
    });
    
    state.agentOrder = cards.map(card => card.dataset.agentName);
    console.log('[Drag] Order updated:', state.agentOrder);
};

const saveAgentOrder = async () => {
    console.log('[Drag] Saving order...', state.agentOrder);
    try {
        const result = await api.updateConfig({
            agent_order: state.agentOrder
        });
        console.log('[Drag] Order saved, result:', result);
        
        // Verify save was successful
        if (result && result.success) {
            console.log('[Drag] Save confirmed successful');
        } else {
            console.error('[Drag] Save returned unsuccessful:', result);
        }
        return result;
    } catch (e) {
        console.error('[Drag] Failed to save order:', e);
        throw e;
    }
};


// ========================================
// Subagents Manager Functions
// ========================================

// 打开子 Agent 管理器
window.openSubagentsManager = () => {
    const modal = document.getElementById('subagentsModal');
    modal.classList.add('active');
    loadDispatcherOptions();
};

// 关闭子 Agent 管理器
window.closeSubagentsManager = () => {
    document.getElementById('subagentsModal').classList.remove('active');
    // 重置表单
    document.getElementById('subagentDispatcherSelect').value = '';
    document.getElementById('subagentsConfig').style.display = 'none';
};

// 加载调度者选项
const loadDispatcherOptions = () => {
    const select = document.getElementById('subagentDispatcherSelect');
    select.innerHTML = '<option value="">请选择...</option>';
    
    state.agents.forEach(agent => {
        const option = document.createElement('option');
        option.value = agent.name;
        option.textContent = `${agent.display.emoji} ${agent.display.name} (${agent.name})`;
        select.appendChild(option);
    });
};

// 加载子 Agent 配置
window.loadSubagentConfig = async () => {
    const dispatcherSelect = document.getElementById('subagentDispatcherSelect');
    const dispatcherName = dispatcherSelect.value;
    
    if (!dispatcherName) {
        document.getElementById('subagentsConfig').style.display = 'none';
        return;
    }
    
    try {
        // 获取当前配置
        const config = await api.getAgentSubagents(dispatcherName);
        
        // 设置最大并发数
        document.getElementById('subagentMaxConcurrent').value = config.maxConcurrent || 4;
        
        // 生成子 Agent 列表
        renderSubagentsList(config.allowAgents || []);
        
        document.getElementById('subagentsConfig').style.display = 'block';
    } catch (e) {
        console.error('Failed to load subagent config:', e);
        showNotification('加载配置失败', 'error');
    }
};

// 渲染子 Agent 列表
const renderSubagentsList = (allowAgents) => {
    const container = document.getElementById('subagentsList');
    container.innerHTML = '';
    
    state.agents.forEach(agent => {
        const isChecked = allowAgents.includes(agent.name);
        
        const item = document.createElement('label');
        item.className = 'subagent-checkbox-item';
        item.innerHTML = `
            <input type="checkbox" value="${agent.name}" ${isChecked ? 'checked' : ''}>
            <span class="subagent-checkbox-emoji">${agent.display.emoji}</span>
            <span class="subagent-checkbox-name">${agent.display.name}</span>
            <span class="subagent-checkbox-id">(${agent.name})</span>
        `;
        
        container.appendChild(item);
    });
};

// 保存子 Agent 配置
window.saveSubagentConfig = async () => {
    const dispatcherName = document.getElementById('subagentDispatcherSelect').value;
    
    if (!dispatcherName) {
        showNotification('请选择调度者 Agent', 'error');
        return;
    }
    
    try {
        // 收集选中的子 Agent
        const checkboxes = document.querySelectorAll('#subagentsList input[type="checkbox"]:checked');
        const allowAgents = Array.from(checkboxes).map(cb => cb.value);
        
        // 获取最大并发数
        const maxConcurrent = parseInt(document.getElementById('subagentMaxConcurrent').value) || 4;
        
        // 保存配置
        const result = await api.updateAgentSubagents(dispatcherName, {
            allowAgents,
            maxConcurrent
        });
        
        if (result.success) {
            showNotification('子 Agent 配置已保存', 'success');
            closeSubagentsManager();
        } else {
            showNotification('保存失败: ' + (result.error || 'Unknown error'), 'error');
        }
    } catch (e) {
        console.error('Failed to save subagent config:', e);
        showNotification('保存失败', 'error');
    }
};

// 添加子 Agent 到允许列表（用于创建 Agent 后的自动添加）
window.addToAllowAgents = async (targetAgent, agentToAdd) => {
    try {
        const result = await api.addAgentToAllowAgents(targetAgent, agentToAdd);
        return result.success;
    } catch (e) {
        console.error(`Failed to add ${agentToAdd} to ${targetAgent}'s allowAgents:`, e);
        return false;
    }
};
