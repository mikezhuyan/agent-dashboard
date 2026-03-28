#!/usr/bin/env python3
"""
Enhanced Agent Dashboard Server v2.1
支持从 OpenClaw 读取配置、创建新 Agent
"""

import json
import os
from pathlib import Path
from datetime import datetime
from flask import Flask, jsonify, request, send_from_directory, abort

# 导入自定义模块
from openclaw_finder import get_finder, find_openclaw_home
from config import get_config_manager, get_config
from openclaw_config import get_openclaw_config_manager

app = Flask(__name__)

# 项目目录
PROJECT_DIR = Path(__file__).parent
STATIC_DIR = PROJECT_DIR / "static"
DATA_DIR = PROJECT_DIR / "data"
AVATAR_DIR = DATA_DIR / "avatars"

# 确保目录存在
AVATAR_DIR.mkdir(parents=True, exist_ok=True)

# 初始化管理器
config_manager = get_config_manager()
openclaw_config_manager = get_openclaw_config_manager()
finder = get_finder()
openclaw_home = finder.find_primary()

# 允许的头像文件扩展名
ALLOWED_AVATAR_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
MAX_AVATAR_SIZE = 5 * 1024 * 1024  # 5MB


def allowed_avatar_file(filename: str) -> bool:
    """检查文件是否是允许的头像格式"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_AVATAR_EXTENSIONS


def _validate_agent_name(agent_name: str) -> bool:
    """验证agent名称是否合法"""
    if not agent_name or not isinstance(agent_name, str):
        return False
    forbidden = ['/', '\\', '..', '~', '$']
    return not any(f in agent_name for f in forbidden)


def sync_openclaw_agents():
    """启动时从 OpenClaw 同步 agent 配置"""
    print("[Sync] 正在从 OpenClaw 同步 Agent 配置...")
    result = openclaw_config_manager.sync_agents_to_dashboard(config_manager)
    print(f"[Sync] 同步完成: {result['synced_count']}/{result['total_agents']} 个 Agent")
    return result


# ============ 静态文件服务 ============

@app.route('/')
def index():
    """Serve the dashboard index.html"""
    return send_from_directory(STATIC_DIR, 'index.html')


@app.route('/<path:filename>')
def serve_static(filename):
    """Serve static files"""
    return send_from_directory(STATIC_DIR, filename)


# ============ API端点 - 配置相关 ============

@app.route('/api/config')
def get_config_endpoint():
    """获取Dashboard配置"""
    config = config_manager.get()
    return jsonify({
        "dashboard_name": config.get("dashboard_name", "Agent Dashboard"),
        "dashboard_subtitle": config.get("dashboard_subtitle", ""),
        "theme": config.get("theme", "dark"),
        "refresh_interval": config.get("refresh_interval", 30),
        "show_cost_estimates": config.get("show_cost_estimates", True),
        "cost_decimal_places": config.get("cost_decimal_places", 4),
        "currency": config.get("token_cost", {}).get("currency", "CNY"),
        "agent_configs": config.get("agent_configs", {}),
        "view_mode": config.get("view_mode", "grid"),
        "agent_order": config.get("agent_order", [])
    })


@app.route('/api/config', methods=['POST'])
def update_config_endpoint():
    """更新Dashboard配置"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"success": False, "error": "No data provided"}), 400
        
        success = config_manager.update(data)
        return jsonify({"success": success})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/config/sync', methods=['POST'])
def sync_config_endpoint():
    """手动同步 OpenClaw 配置"""
    try:
        result = sync_openclaw_agents()
        return jsonify(result)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ============ API端点 - Agent管理 ============

@app.route('/api/system-info')
def get_system_info():
    """获取系统信息"""
    return jsonify({
        "openclaw_home": str(openclaw_home) if openclaw_home else None,
        "agents_dir": str(finder.get_agents_dir()) if finder.get_agents_dir() else None,
        "server_time": datetime.now().isoformat(),
        "version": "2.1.0"
    })


@app.route('/api/agents')
def list_agents():
    """List all available agents with their configurations"""
    agents = finder.get_agent_list()
    
    result = []
    for agent_info in agents:
        agent_name = agent_info["name"]
        display_config = config_manager.get_agent_config(agent_name)
        
        # 读取 OpenClaw 的 metadata
        metadata = openclaw_config_manager.read_agent_metadata(agent_name)
        
        # 合并配置：metadata 优先
        if metadata:
            display_config = {
                "name": metadata.get("display_name", display_config.get("name", agent_name)),
                "role": metadata.get("role", display_config.get("role", "Agent")),
                "emoji": metadata.get("emoji", display_config.get("emoji", "🤖")),
                "color": metadata.get("color", display_config.get("color", "cyan")),
                "description": metadata.get("description", display_config.get("description", "")),
            }
        
        # 检查是否有自定义头像
        custom_avatar_path = AVATAR_DIR / f"{agent_name}.png"
        has_custom_avatar = custom_avatar_path.exists()
        
        result.append({
            "name": agent_name,
            "has_sessions": agent_info["has_sessions"],
            "has_avatar": agent_info["has_avatar"] or has_custom_avatar,
            "has_config": agent_info["has_config"],
            "display": display_config,
            "metadata": metadata
        })
    
    return jsonify(result)


@app.route('/api/agents', methods=['POST'])
def create_agent_endpoint():
    """创建新的 Agent"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"success": False, "error": "No data provided"}), 400
        
        agent_name = data.get("name", "").strip().lower()
        if not agent_name:
            return jsonify({"success": False, "error": "Agent name is required"}), 400
        
        # 创建 agent
        result = openclaw_config_manager.create_agent(agent_name, data)
        
        if result["success"]:
            # 同步到 Dashboard 配置
            dashboard_config = {
                "name": data.get("display_name", agent_name),
                "role": data.get("role", "Agent"),
                "emoji": data.get("emoji", "🤖"),
                "color": data.get("color", "cyan"),
                "description": data.get("description", "")
            }
            
            config_manager.update({
                "agent_configs": {
                    agent_name: dashboard_config
                }
            })
            
            return jsonify({
                "success": True,
                "agent_name": agent_name,
                "message": f"Agent '{agent_name}' created successfully"
            })
        else:
            return jsonify(result), 400
    
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/agents/<agent_name>', methods=['DELETE'])
def delete_agent_endpoint(agent_name):
    """删除 Agent"""
    if not _validate_agent_name(agent_name):
        abort(400, "Invalid agent name")
    
    try:
        result = openclaw_config_manager.delete_agent(agent_name)
        return jsonify(result)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/agents/<agent_name>/sessions')
def get_agent_sessions(agent_name):
    """Get all sessions for a specific agent"""
    if not _validate_agent_name(agent_name):
        abort(400, "Invalid agent name")
    
    sessions_path = finder.get_agent_sessions_path(agent_name)
    
    if not sessions_path:
        return jsonify({})
    
    try:
        with open(sessions_path, 'r', encoding='utf-8') as f:
            sessions = json.load(f)
        
        # 添加成本计算
        config = config_manager.get()
        if config.get("show_cost_estimates", True):
            for session_key, session_data in sessions.items():
                cost = config_manager.calculate_cost(
                    session_data.get('inputTokens', 0),
                    session_data.get('outputTokens', 0),
                    session_data.get('cacheRead', 0),
                    session_data.get('cacheWrite', 0)
                )
                session_data['estimatedCost'] = cost
        
        return jsonify(sessions)
    except (json.JSONDecodeError, IOError) as e:
        print(f"Error loading sessions for {agent_name}: {e}")
        return jsonify({})


@app.route('/api/agents/<agent_name>/avatar', methods=['GET', 'POST'])
def agent_avatar(agent_name):
    """获取或更新agent头像"""
    if not _validate_agent_name(agent_name):
        abort(400, "Invalid agent name")
    
    if request.method == 'GET':
        # 优先返回自定义头像
        custom_avatar = AVATAR_DIR / f"{agent_name}.png"
        if custom_avatar.exists():
            return send_from_directory(AVATAR_DIR, f"{agent_name}.png")
        
        # 其次查找OpenClaw目录中的头像
        avatar_path = finder.get_agent_avatar_path(agent_name)
        if avatar_path:
            return send_from_directory(avatar_path.parent, avatar_path.name)
        
        # 返回默认头像
        abort(404, "Avatar not found")
    
    elif request.method == 'POST':
        # 上传新头像
        if 'avatar' not in request.files:
            return jsonify({"success": False, "error": "No file provided"}), 400
        
        file = request.files['avatar']
        if file.filename == '':
            return jsonify({"success": False, "error": "No file selected"}), 400
        
        if not allowed_avatar_file(file.filename):
            return jsonify({
                "success": False, 
                "error": f"Invalid file type. Allowed: {', '.join(ALLOWED_AVATAR_EXTENSIONS)}"
            }), 400
        
        # 保存文件
        try:
            # 统一保存为png格式
            filename = f"{agent_name}.png"
            filepath = AVATAR_DIR / filename
            
            # 读取文件内容检查大小
            file_content = file.read()
            if len(file_content) > MAX_AVATAR_SIZE:
                return jsonify({
                    "success": False,
                    "error": f"File too large. Max size: {MAX_AVATAR_SIZE / 1024 / 1024}MB"
                }), 400
            
            # 保存文件
            with open(filepath, 'wb') as f:
                f.write(file_content)
            
            # 更新配置
            config_manager.update_agent_avatar(agent_name, str(filepath))
            
            return jsonify({
                "success": True,
                "message": "Avatar uploaded successfully",
                "path": f"/api/agents/{agent_name}/avatar"
            })
        
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/agents/<agent_name>/config', methods=['GET', 'POST'])
def agent_config_endpoint(agent_name):
    """获取或更新agent显示配置"""
    if not _validate_agent_name(agent_name):
        abort(400, "Invalid agent name")
    
    if request.method == 'GET':
        config = config_manager.get_agent_config(agent_name)
        metadata = openclaw_config_manager.read_agent_metadata(agent_name)
        return jsonify({
            "dashboard_config": config,
            "openclaw_metadata": metadata
        })
    
    elif request.method == 'POST':
        try:
            data = request.get_json()
            
            # 更新 Dashboard 配置
            dashboard_updates = {
                "agent_configs": {
                    agent_name: {
                        "name": data.get("display_name", agent_name),
                        "role": data.get("role", "Agent"),
                        "emoji": data.get("emoji", "🤖"),
                        "color": data.get("color", "cyan"),
                        "description": data.get("description", "")
                    }
                }
            }
            config_manager.update(dashboard_updates)
            
            # 更新 OpenClaw metadata
            metadata_updates = {
                "display_name": data.get("display_name", agent_name),
                "role": data.get("role", "Agent"),
                "emoji": data.get("emoji", "🤖"),
                "color": data.get("color", "cyan"),
                "description": data.get("description", ""),
                "system_prompt": data.get("system_prompt", "")
            }
            openclaw_config_manager.update_agent_metadata(agent_name, metadata_updates)
            
            return jsonify({"success": True})
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500


# ============ API端点 - 模型/提供商相关 ============

@app.route('/api/model-providers')
def get_model_providers():
    """获取可用的模型提供商列表"""
    try:
        global_config = openclaw_config_manager.read_global_config()
        providers = global_config.get("models", {}).get("providers", {})
        
        print(f"[API] 读取到 {len(providers)} 个模型提供商")
        
        result = []
        for provider_id, provider_config in providers.items():
            models = []
            for model in provider_config.get("models", []):
                models.append({
                    "id": model.get("id"),
                    "name": model.get("name", model.get("id")),
                    "contextWindow": model.get("contextWindow", 0),
                    "maxTokens": model.get("maxTokens", 0)
                })
            
            # 使用配置中的 name 或格式化 id
            provider_name = provider_config.get("name", provider_id.capitalize())
            
            result.append({
                "id": provider_id,
                "name": provider_name,
                "models": models
            })
            print(f"[API]   - {provider_id}: {len(models)} 个模型")
        
        return jsonify(result)
    except Exception as e:
        print(f"[API] 获取模型提供商失败: {e}")
        return jsonify({"error": str(e)}), 500


# ============ API端点 - 统计相关 ============

@app.route('/api/stats')
def get_stats():
    """Get aggregated stats across all agents with cost calculations"""
    total_tokens = 0
    total_input_tokens = 0
    total_output_tokens = 0
    total_cache_tokens = 0
    total_sessions = 0
    running_agents = 0
    
    stats_by_agent = {}
    
    agents = finder.get_agent_list()
    for agent_info in agents:
        agent_name = agent_info["name"]
        sessions_path = finder.get_agent_sessions_path(agent_name)
        
        agent_tokens = 0
        agent_input = 0
        agent_output = 0
        agent_cache = 0
        agent_session_count = 0
        agent_running = False
        
        current_model = None
        current_model_provider = None
        latest_session = None
        
        if sessions_path:
            try:
                with open(sessions_path, 'r', encoding='utf-8') as f:
                    sessions = json.load(f)
                
                # 找到最新的会话
                if sessions:
                    latest_session = max(sessions.values(), 
                                        key=lambda s: s.get('updatedAt', 0))
                    current_model = latest_session.get('model')
                    current_model_provider = latest_session.get('modelProvider')
                    
                    # 只基于最新会话判断运行状态
                    if latest_session.get('status') == 'running':
                        agent_running = True
                        running_agents += 1
                
                # 统计所有会话的 token 使用量
                for session_key, session_data in sessions.items():
                    input_t = session_data.get('inputTokens', 0)
                    output_t = session_data.get('outputTokens', 0)
                    cache_r = session_data.get('cacheRead', 0)
                    cache_w = session_data.get('cacheWrite', 0)
                    
                    agent_input += input_t
                    agent_output += output_t
                    agent_cache += cache_r + cache_w
                    agent_tokens += session_data.get('totalTokens', 0)
                    agent_session_count += 1
            
            except Exception as e:
                print(f"Error processing sessions for {agent_name}: {e}")
        
        total_tokens += agent_tokens
        total_input_tokens += agent_input
        total_output_tokens += agent_output
        total_cache_tokens += agent_cache
        total_sessions += agent_session_count
        
        # 计算该agent的成本
        agent_cost = config_manager.calculate_cost(agent_input, agent_output, 0, agent_cache)
        
        # 格式化当前模型显示
        current_model_display = None
        if current_model and current_model_provider:
            current_model_display = f"{current_model_provider}/{current_model}"
        elif current_model:
            current_model_display = current_model
        
        stats_by_agent[agent_name] = {
            'tokens': agent_tokens,
            'inputTokens': agent_input,
            'outputTokens': agent_output,
            'cacheTokens': agent_cache,
            'sessions': agent_session_count,
            'isRunning': agent_running,
            'estimatedCost': agent_cost,
            'currentModel': current_model_display,
            'currentModelProvider': current_model_provider,
            'currentModelName': current_model
        }
    
    # 计算总成本
    show_cost = config_manager.get().get("show_cost_estimates", True)
    
    total_cost = None
    if show_cost:
        total_cost = config_manager.calculate_cost(
            total_input_tokens, total_output_tokens, 0, total_cache_tokens
        )
    
    # 如果不需要显示费用，从每个 agent 的统计中移除
    if not show_cost:
        for agent_stats in stats_by_agent.values():
            agent_stats['estimatedCost'] = None
    
    return jsonify({
        'totalTokens': total_tokens,
        'totalInputTokens': total_input_tokens,
        'totalOutputTokens': total_output_tokens,
        'totalCacheTokens': total_cache_tokens,
        'totalSessions': total_sessions,
        'runningAgents': running_agents,
        'totalCost': total_cost,
        'byAgent': stats_by_agent
    })


@app.route('/api/stats/cost-summary')
def get_cost_summary():
    """获取成本汇总信息"""
    config = config_manager.get()
    cost_config = config.get("token_cost", {})
    
    # 获取所有统计信息
    stats = get_stats().get_json()
    
    return jsonify({
        "cost_config": {
            "input_price_per_1m": cost_config.get("input_price_per_1m", 2.0),
            "output_price_per_1m": cost_config.get("output_price_per_1m", 8.0),
            "cache_price_per_1m": cost_config.get("cache_price_per_1m", 1.0),
            "currency": cost_config.get("currency", "CNY")
        },
        "total_cost": stats.get("totalCost"),
        "by_agent": {
            k: v.get("estimatedCost") 
            for k, v in stats.get("byAgent", {}).items()
        }
    })


# ============ 启动服务器 ============

def print_startup_info():
    """打印启动信息"""
    config = config_manager.get()
    
    print("=" * 60)
    print(f"  {config.get('dashboard_name', 'Agent Dashboard')} v2.1")
    print("=" * 60)
    print(f"Dashboard: http://localhost:{config.get('port', 5178)}")
    print(f"OpenClaw Home: {openclaw_home or 'Not found'}")
    print(f"Agents Dir: {finder.get_agents_dir() or 'Not found'}")
    print(f"Auto-refresh: {config.get('refresh_interval', 30)}s")
    print(f"Cost Estimates: {'Enabled' if config.get('show_cost_estimates', True) else 'Disabled'}")
    
    agents = finder.get_agent_list()
    print(f"\nFound {len(agents)} Agents:")
    for agent in agents:
        status = "✓" if agent["has_sessions"] else "✗"
        avatar = "🖼️" if agent["has_avatar"] else "❌"
        print(f"  - {agent['name']}: sessions[{status}] avatar[{avatar}]")
    
    print("\nPress Ctrl+C to stop")
    print("=" * 60)


if __name__ == '__main__':
    # 启动时同步 OpenClaw 配置
    sync_openclaw_agents()
    
    config = config_manager.get()
    print_startup_info()
    
    app.run(
        host=config.get('host', '0.0.0.0'),
        port=config.get('port', 5178),
        debug=config.get('debug', False)
    )
