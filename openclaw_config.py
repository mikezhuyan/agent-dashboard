#!/usr/bin/env python3
"""
OpenClaw Configuration Manager
管理 OpenClaw 的配置文件读写，支持 Agent 创建和配置同步
"""

import json
import os
import shutil
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime

from openclaw_finder import get_finder


class OpenClawConfigManager:
    """OpenClaw 配置管理器"""
    
    def __init__(self):
        self.finder = get_finder()
        self.openclaw_home = self.finder.find_primary()
        
        if not self.openclaw_home:
            raise RuntimeError("OpenClaw installation not found")
        
        self.config_file = self.openclaw_home / "openclaw.json"
        self.agents_dir = self.openclaw_home / "agents"
        self.backup_dir = self.openclaw_home / ".dashboard-backups"
        
        # 确保备份目录存在
        self.backup_dir.mkdir(parents=True, exist_ok=True)
    
    def read_global_config(self) -> Dict[str, Any]:
        """读取 OpenClaw 全局配置"""
        if not self.config_file.exists():
            return {}
        
        try:
            with open(self.config_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"[OpenClawConfig] 读取全局配置失败: {e}")
            return {}
    
    def backup_config(self) -> Optional[Path]:
        """备份 OpenClaw 配置文件"""
        if not self.config_file.exists():
            return None
        
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_file = self.backup_dir / f"openclaw.json.backup.{timestamp}"
            
            shutil.copy2(self.config_file, backup_file)
            
            # 保留最近 10 个备份，删除旧的
            backups = sorted(self.backup_dir.glob("openclaw.json.backup.*"))
            for old_backup in backups[:-10]:
                old_backup.unlink()
            
            print(f"[OpenClawConfig] 配置已备份到: {backup_file}")
            return backup_file
        except Exception as e:
            print(f"[OpenClawConfig] 备份配置失败: {e}")
            return None
    
    def write_global_config(self, config: Dict[str, Any]) -> bool:
        """写入 OpenClaw 全局配置（带备份）"""
        try:
            # 先备份
            self.backup_config()
            
            # 更新 meta 信息
            if "meta" not in config:
                config["meta"] = {}
            config["meta"]["lastTouchedAt"] = datetime.now().isoformat()
            config["meta"]["lastTouchedBy"] = "agent-dashboard"
            
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(config, f, indent=2, ensure_ascii=False)
            
            print(f"[OpenClawConfig] 配置已写入: {self.config_file}")
            return True
        except Exception as e:
            print(f"[OpenClawConfig] 写入全局配置失败: {e}")
            return False
    
    def add_agent_to_config(self, agent_name: str, agent_config: Dict[str, Any]) -> bool:
        """
        添加 Agent 到 OpenClaw 全局配置
        只添加新的 agent 到 agents.list，不修改其他配置
        """
        try:
            config = self.read_global_config()
            
            # 确保 agents 部分存在
            if "agents" not in config:
                config["agents"] = {}
            if "list" not in config["agents"]:
                config["agents"]["list"] = []
            
            agent_list = config["agents"]["list"]
            
            # 检查是否已存在
            existing_idx = None
            for idx, agent in enumerate(agent_list):
                if agent.get("id") == agent_name:
                    existing_idx = idx
                    break
            
            # 构建 agent 配置
            new_agent_config = {
                "id": agent_name,
                "name": agent_name,
                "workspace": str(self.openclaw_home / f"workspace-{agent_name}"),
                "agentDir": str(self.agents_dir / agent_name / "agent"),
                "model": f"{agent_config.get('model_provider', 'deepseek')}/{agent_config.get('model_id', 'deepseek-chat')}",
                "identity": {
                    "name": agent_config.get("display_name", agent_name),
                    "emoji": agent_config.get("emoji", "🤖")
                }
            }
            
            # 添加 system prompt（如果提供）
            system_prompt = agent_config.get("system_prompt", "").strip()
            if system_prompt:
                new_agent_config["system"] = system_prompt
            
            # 添加或更新
            if existing_idx is not None:
                # 保留原有配置，只更新指定字段
                existing = agent_list[existing_idx]
                existing.update(new_agent_config)
                print(f"[OpenClawConfig] 更新现有 agent 配置: {agent_name}")
            else:
                agent_list.append(new_agent_config)
                print(f"[OpenClawConfig] 添加新 agent 配置: {agent_name}")
            
            # 写入配置
            return self.write_global_config(config)
        
        except Exception as e:
            print(f"[OpenClawConfig] 添加 agent 到配置失败: {e}")
            return False
    
    def remove_agent_from_config(self, agent_name: str) -> bool:
        """
        从 OpenClaw 全局配置中移除 Agent
        只从 agents.list 中移除，不修改其他配置
        """
        try:
            config = self.read_global_config()
            
            if "agents" not in config or "list" not in config["agents"]:
                return True
            
            agent_list = config["agents"]["list"]
            original_len = len(agent_list)
            
            # 过滤掉要删除的 agent
            config["agents"]["list"] = [
                a for a in agent_list 
                if a.get("id") != agent_name
            ]
            
            if len(config["agents"]["list"]) < original_len:
                print(f"[OpenClawConfig] 从配置中移除 agent: {agent_name}")
                return self.write_global_config(config)
            
            return True
        
        except Exception as e:
            print(f"[OpenClawConfig] 从配置中移除 agent 失败: {e}")
            return False
    
    def read_agent_config(self, agent_name: str) -> Dict[str, Any]:
        """读取指定 agent 的配置"""
        agent_dir = self.agents_dir / agent_name
        config_file = agent_dir / "agent" / "models.json"
        
        if not config_file.exists():
            return {}
        
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"[OpenClawConfig] 读取 agent {agent_name} 配置失败: {e}")
            return {}
    
    def write_agent_config(self, agent_name: str, config: Dict[str, Any]) -> bool:
        """写入指定 agent 的配置"""
        agent_dir = self.agents_dir / agent_name
        config_file = agent_dir / "agent" / "models.json"
        
        try:
            config_file.parent.mkdir(parents=True, exist_ok=True)
            
            with open(config_file, 'w', encoding='utf-8') as f:
                json.dump(config, f, indent=2, ensure_ascii=False)
            return True
        except Exception as e:
            print(f"[OpenClawConfig] 写入 agent {agent_name} 配置失败: {e}")
            return False
    
    def get_all_agents(self) -> List[Dict[str, Any]]:
        """获取所有 agent 列表"""
        agents = []
        
        if not self.agents_dir.exists():
            return agents
        
        for agent_dir in sorted(self.agents_dir.iterdir()):
            if agent_dir.is_dir():
                agent_name = agent_dir.name
                config = self.read_agent_config(agent_name)
                
                # 检查是否有 sessions
                sessions_file = agent_dir / "sessions" / "sessions.json"
                has_sessions = sessions_file.exists()
                
                # 检查是否有头像
                avatar_file = agent_dir / "avatar.png"
                has_avatar = avatar_file.exists()
                
                agents.append({
                    "name": agent_name,
                    "config": config,
                    "has_sessions": has_sessions,
                    "has_avatar": has_avatar,
                    "path": str(agent_dir)
                })
        
        return agents
    
    def create_agent(self, agent_name: str, agent_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        创建新的 agent，完整配置到 OpenClaw
        
        Args:
            agent_name: agent 名称
            agent_data: agent 配置数据
        
        Returns:
            创建结果
        """
        # 验证 agent 名称
        if not self._validate_agent_name(agent_name):
            return {"success": False, "error": "Invalid agent name. Use only letters, numbers, hyphens and underscores."}
        
        agent_dir = self.agents_dir / agent_name
        workspace_dir = self.openclaw_home / f"workspace-{agent_name}"
        
        # 检查是否已存在
        if agent_dir.exists():
            return {"success": False, "error": f"Agent '{agent_name}' already exists"}
        
        try:
            # 1. 创建目录结构
            (agent_dir / "agent").mkdir(parents=True, exist_ok=True)
            (agent_dir / "sessions").mkdir(parents=True, exist_ok=True)
            workspace_dir.mkdir(parents=True, exist_ok=True)
            
            # 2. 创建 agent 的模型配置
            model_provider = agent_data.get("model_provider", "deepseek")
            model_id = agent_data.get("model_id", "deepseek-chat")
            
            # 从全局配置获取模型提供商配置
            global_config = self.read_global_config()
            providers = global_config.get("models", {}).get("providers", {})
            
            agent_config = {
                "providers": {}
            }
            
            if model_provider in providers:
                # 复制提供商配置
                provider_config = providers[model_provider].copy()
                # 只保留选中的模型
                provider_config["models"] = [
                    m for m in provider_config.get("models", [])
                    if m.get("id") == model_id
                ]
                if not provider_config["models"]:
                    # 如果没找到指定模型，使用第一个
                    all_models = providers[model_provider].get("models", [])
                    if all_models:
                        provider_config["models"] = [all_models[0]]
                
                agent_config["providers"][model_provider] = provider_config
            
            # 3. 写入 agent 的模型配置
            self.write_agent_config(agent_name, agent_config)
            
            # 4. 创建空的 sessions.json
            sessions_file = agent_dir / "sessions" / "sessions.json"
            with open(sessions_file, 'w', encoding='utf-8') as f:
                json.dump({}, f, indent=2)
            
            # 5. 创建 metadata 文件存储 Dashboard 特有的元数据
            metadata = {
                "display_name": agent_data.get("display_name", agent_name),
                "role": agent_data.get("role", "Agent"),
                "emoji": agent_data.get("emoji", "🤖"),
                "description": agent_data.get("description", ""),
                "color": agent_data.get("color", "cyan"),
                "system_prompt": agent_data.get("system_prompt", ""),
                "model_provider": model_provider,
                "model_id": model_id,
                "created_at": datetime.now().isoformat(),
                "version": "1.0"
            }
            
            metadata_file = agent_dir / "agent" / "metadata.json"
            with open(metadata_file, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, indent=2, ensure_ascii=False)
            
            # 6. 添加到 OpenClaw 全局配置（关键步骤）
            if not self.add_agent_to_config(agent_name, agent_data):
                # 如果添加失败，清理已创建的文件
                if agent_dir.exists():
                    shutil.rmtree(agent_dir)
                if workspace_dir.exists():
                    shutil.rmtree(workspace_dir)
                return {"success": False, "error": "Failed to add agent to OpenClaw config"}
            
            return {
                "success": True,
                "agent_name": agent_name,
                "path": str(agent_dir),
                "workspace": str(workspace_dir),
                "metadata": metadata
            }
        
        except Exception as e:
            # 清理已创建的目录
            if agent_dir.exists():
                shutil.rmtree(agent_dir)
            if workspace_dir.exists():
                shutil.rmtree(workspace_dir)
            return {"success": False, "error": str(e)}
    
    def update_agent_metadata(self, agent_name: str, metadata: Dict[str, Any]) -> bool:
        """更新 agent 的元数据"""
        metadata_file = self.agents_dir / agent_name / "agent" / "metadata.json"
        
        try:
            # 读取现有元数据
            existing = {}
            if metadata_file.exists():
                with open(metadata_file, 'r', encoding='utf-8') as f:
                    existing = json.load(f)
            
            # 合并更新
            existing.update(metadata)
            existing["updated_at"] = datetime.now().isoformat()
            
            with open(metadata_file, 'w', encoding='utf-8') as f:
                json.dump(existing, f, indent=2, ensure_ascii=False)
            
            return True
        except Exception as e:
            print(f"[OpenClawConfig] 更新 agent {agent_name} 元数据失败: {e}")
            return False
    
    def read_agent_metadata(self, agent_name: str) -> Optional[Dict[str, Any]]:
        """读取 agent 的元数据"""
        metadata_file = self.agents_dir / agent_name / "agent" / "metadata.json"
        
        if not metadata_file.exists():
            return None
        
        try:
            with open(metadata_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"[OpenClawConfig] 读取 agent {agent_name} 元数据失败: {e}")
            return None
    
    def delete_agent(self, agent_name: str) -> Dict[str, Any]:
        """删除 agent"""
        agent_dir = self.agents_dir / agent_name
        workspace_dir = self.openclaw_home / f"workspace-{agent_name}"
        
        if not agent_dir.exists():
            return {"success": False, "error": f"Agent '{agent_name}' does not exist"}
        
        try:
            # 1. 从 OpenClaw 配置中移除
            if not self.remove_agent_from_config(agent_name):
                return {"success": False, "error": "Failed to remove agent from OpenClaw config"}
            
            # 2. 备份到 trash
            trash_dir = self.openclaw_home / ".trash" / "agents"
            trash_workspace_dir = self.openclaw_home / ".trash" / "workspaces"
            trash_dir.mkdir(parents=True, exist_ok=True)
            trash_workspace_dir.mkdir(parents=True, exist_ok=True)
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            
            if agent_dir.exists():
                backup_path = trash_dir / f"{agent_name}_{timestamp}"
                shutil.move(str(agent_dir), str(backup_path))
            
            if workspace_dir.exists():
                backup_workspace = trash_workspace_dir / f"{agent_name}_{timestamp}"
                shutil.move(str(workspace_dir), str(backup_workspace))
            
            return {
                "success": True,
                "message": f"Agent '{agent_name}' moved to trash",
                "backup_path": str(trash_dir / f"{agent_name}_{timestamp}")
            }
        
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def _validate_agent_name(self, name: str) -> bool:
        """验证 agent 名称是否合法"""
        if not name or not isinstance(name, str):
            return False
        
        # 只允许字母、数字、连字符和下划线
        import re
        return bool(re.match(r'^[a-zA-Z0-9_-]+$', name))
    
    def sync_agents_to_dashboard(self, dashboard_config_manager) -> Dict[str, Any]:
        """
        将 OpenClaw 的 agent 同步到 Dashboard 配置
        
        读取 OpenClaw 中所有 agent 的 metadata，同步到 Dashboard 的 agent_configs
        """
        agents = self.get_all_agents()
        sync_count = 0
        
        for agent in agents:
            agent_name = agent["name"]
            metadata = self.read_agent_metadata(agent_name)
            
            if metadata:
                # 从 metadata 构建 dashboard 配置
                dashboard_config = {
                    "name": metadata.get("display_name", agent_name),
                    "role": metadata.get("role", "Agent"),
                    "emoji": metadata.get("emoji", "🤖"),
                    "color": metadata.get("color", "cyan"),
                    "description": metadata.get("description", ""),
                }
            else:
                # 没有 metadata，使用默认配置
                dashboard_config = self._get_default_dashboard_config(agent_name)
            
            # 更新 dashboard 配置
            updates = {
                "agent_configs": {
                    agent_name: dashboard_config
                }
            }
            
            if dashboard_config_manager.update(updates):
                sync_count += 1
        
        return {
            "success": True,
            "synced_count": sync_count,
            "total_agents": len(agents)
        }
    
    def _get_default_dashboard_config(self, agent_name: str) -> Dict[str, str]:
        """获取默认的 Dashboard 配置"""
        defaults = {
            "main": {"name": "小七", "role": "主助手", "emoji": "🎯", "color": "main", "description": "主要对话助手"},
            "coder": {"name": "Coder", "role": "代码专家", "emoji": "💻", "color": "coder", "description": "专注代码编写"},
            "brainstorm": {"name": "Brainstorm", "role": "创意顾问", "emoji": "💡", "color": "brainstorm", "description": "头脑风暴"},
            "writer": {"name": "Writer", "role": "写作助手", "emoji": "✍️", "color": "writer", "description": "文档撰写"},
            "investor": {"name": "Investor", "role": "投资分析", "emoji": "📈", "color": "investor", "description": "投资分析"},
        }
        
        if agent_name in defaults:
            return defaults[agent_name]
        
        return {
            "name": agent_name.capitalize(),
            "role": "Agent",
            "emoji": "🤖",
            "color": "cyan",
            "description": f"{agent_name} agent"
        }


# 全局实例
_config_manager_instance: Optional[OpenClawConfigManager] = None


def get_openclaw_config_manager() -> OpenClawConfigManager:
    """获取全局 OpenClaw 配置管理器"""
    global _config_manager_instance
    if _config_manager_instance is None:
        _config_manager_instance = OpenClawConfigManager()
    return _config_manager_instance


if __name__ == "__main__":
    # 测试
    manager = get_openclaw_config_manager()
    
    print("=" * 50)
    print("OpenClaw Config Manager Test")
    print("=" * 50)
    
    # 测试读取全局配置中的 agents
    config = manager.read_global_config()
    agents_config = config.get("agents", {})
    print(f"\nOpenClaw 中配置了 {len(agents_config.get('list', []))} 个 agents:")
    for agent in agents_config.get("list", []):
        print(f"  - {agent.get('id')}: {agent.get('identity', {}).get('name', 'N/A')}")
