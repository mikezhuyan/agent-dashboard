#!/usr/bin/env python3
"""
OpenClaw Skills Manager
管理 OpenClaw 技能的发现、安装、启用/禁用

技能来源：
1. 内置技能：/home/mike/.npm-global/lib/node_modules/openclaw/skills/
2. 用户自定义技能：~/.openclaw/skills/
"""

import json
import os
import re
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass


@dataclass
class SkillInfo:
    """技能信息"""
    id: str
    name: str
    description: str
    emoji: str = "🔧"
    source: str = "builtin"  # builtin, custom
    path: Optional[Path] = None
    skill_path: Optional[Path] = None  # SKILL.md 路径
    enabled: bool = False
    metadata: Dict[str, Any] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "emoji": self.emoji,
            "source": self.source,
            "enabled": self.enabled,
            "metadata": self.metadata or {}
        }


class OpenClawSkillsManager:
    """OpenClaw 技能管理器"""
    
    # 内置技能目录
    BUILTIN_SKILLS_DIR = Path("/home/mike/.npm-global/lib/node_modules/openclaw/skills")
    
    def __init__(self, openclaw_home: Optional[Path] = None):
        if openclaw_home:
            self.openclaw_home = Path(openclaw_home)
        else:
            # 尝试找到 openclaw home
            from openclaw_finder import find_openclaw_home
            oc_home = find_openclaw_home()
            if not oc_home:
                raise RuntimeError("OpenClaw home not found")
            self.openclaw_home = oc_home
        
        self.custom_skills_dir = self.openclaw_home / "skills"
    
    def _parse_skill_md(self, skill_path: Path) -> Optional[SkillInfo]:
        """
        解析 SKILL.md 文件，提取技能信息
        
        SKILL.md 格式：
        ---
        name: skill-name
        description: skill description
        metadata:
          openclaw:
            emoji: "🐙"
        ---
        """
        try:
            content = skill_path.read_text(encoding='utf-8')
            
            # 提取 frontmatter
            frontmatter_match = re.search(r'^---\s*\n(.*?)\n---', content, re.DOTALL)
            if not frontmatter_match:
                return None
            
            frontmatter = frontmatter_match.group(1)
            
            # 解析 YAML-like 格式
            skill_id = skill_path.parent.name
            name = skill_id
            description = ""
            emoji = "🔧"
            metadata = {}
            
            # 提取 name
            name_match = re.search(r'^name:\s*(.+?)$', frontmatter, re.MULTILINE)
            if name_match:
                name = name_match.group(1).strip().strip('"\'')
            
            # 提取 description - 支持多行，但以第一个非空行结束
            desc_match = re.search(r'^description:\s*["\']?(.+?)["\']?(?=\n\w|$)', frontmatter, re.MULTILINE | re.DOTALL)
            if desc_match:
                description = desc_match.group(1).strip()
                # 清理换行和多余空格
                description = ' '.join(description.split())
            
            # 提取 metadata 中的 emoji
            # 尝试多种可能的格式
            emoji_patterns = [
                r'"emoji":\s*"([^"]+)"',  # JSON 格式
                r'emoji:\s*["\']([^"\']+)["\']',  # YAML 带引号
                r'emoji:\s*([^\s\n]+)',  # YAML 不带引号
            ]
            for pattern in emoji_patterns:
                emoji_match = re.search(pattern, frontmatter)
                if emoji_match:
                    emoji = emoji_match.group(1).strip()
                    break
            
            return SkillInfo(
                id=skill_id,
                name=name,
                description=description,
                emoji=emoji,
                path=skill_path.parent,
                skill_path=skill_path,
                metadata=metadata
            )
            
        except Exception as e:
            print(f"[SkillsManager] 解析 {skill_path} 失败: {e}")
            return None
    
    def _get_skill_info_from_dir(self, skill_dir: Path, source: str) -> Optional[SkillInfo]:
        """从技能目录获取技能信息"""
        skill_id = skill_dir.name
        
        # 首先尝试解析 SKILL.md
        skill_md = skill_dir / "SKILL.md"
        if skill_md.exists():
            info = self._parse_skill_md(skill_md)
            if info:
                info.source = source
                return info
        
        # 如果没有 SKILL.md，创建基本信息
        return SkillInfo(
            id=skill_id,
            name=skill_id,
            description=f"{skill_id} skill",
            source=source,
            path=skill_dir
        )
    
    def get_all_available_skills(self) -> List[SkillInfo]:
        """
        获取所有可用技能（内置 + 用户自定义）
        
        Returns:
            SkillInfo 列表
        """
        skills = {}
        
        # 1. 读取内置技能
        if self.BUILTIN_SKILLS_DIR.exists():
            for skill_dir in self.BUILTIN_SKILLS_DIR.iterdir():
                if skill_dir.is_dir():
                    info = self._get_skill_info_from_dir(skill_dir, "builtin")
                    if info:
                        skills[info.id] = info
        
        # 2. 读取用户自定义技能
        if self.custom_skills_dir.exists():
            for skill_dir in self.custom_skills_dir.iterdir():
                if skill_dir.is_dir() or skill_dir.is_symlink():
                    info = self._get_skill_info_from_dir(skill_dir, "custom")
                    if info:
                        # 用户技能覆盖内置技能
                        skills[info.id] = info
        
        return list(skills.values())
    
    def get_skill_detail(self, skill_id: str) -> Optional[Dict[str, Any]]:
        """
        获取技能详细信息（包括完整描述和使用方法）
        
        Args:
            skill_id: 技能 ID
            
        Returns:
            技能详细信息字典
        """
        # 查找技能
        skill_path = None
        source = "builtin"
        
        # 先检查用户自定义技能
        custom_path = self.custom_skills_dir / skill_id
        if custom_path.exists() or custom_path.is_symlink():
            skill_path = custom_path
            source = "custom"
        else:
            # 检查内置技能
            builtin_path = self.BUILTIN_SKILLS_DIR / skill_id
            if builtin_path.exists():
                skill_path = builtin_path
                source = "builtin"
        
        if not skill_path:
            return None
        
        # 读取 SKILL.md
        skill_md = skill_path / "SKILL.md"
        if not skill_md.exists():
            return {
                "id": skill_id,
                "name": skill_id,
                "description": f"{skill_id} skill",
                "source": source,
                "content": "",
                "has_doc": False
            }
        
        try:
            content = skill_md.read_text(encoding='utf-8')
            
            # 解析 frontmatter
            frontmatter_match = re.search(r'^---\s*\n(.*?)\n---\s*\n(.*)', content, re.DOTALL)
            if frontmatter_match:
                frontmatter = frontmatter_match.group(1)
                doc_content = frontmatter_match.group(2)
            else:
                frontmatter = ""
                doc_content = content
            
            # 解析基本信息
            name = skill_id
            description = ""
            emoji = "🔧"
            
            name_match = re.search(r'^name:\s*(.+)$', frontmatter, re.MULTILINE)
            if name_match:
                name = name_match.group(1).strip().strip('"\'')
            
            desc_match = re.search(r'^description:\s*(.+)$', frontmatter, re.MULTILINE | re.DOTALL)
            if desc_match:
                description = desc_match.group(1).strip().strip('"\'')
                description = description.split('\n')[0]
            
            # 提取 emoji
            emoji_match = re.search(r'emoji:\s*["\']?([^"\'\n]+)["\']?', frontmatter)
            if emoji_match:
                emoji = emoji_match.group(1).strip()
            
            return {
                "id": skill_id,
                "name": name,
                "description": description,
                "emoji": emoji,
                "source": source,
                "content": doc_content.strip(),
                "has_doc": True,
                "path": str(skill_path)
            }
            
        except Exception as e:
            print(f"[SkillsManager] 读取技能详情失败: {e}")
            return None
    
    def get_agent_skills(self, agent_name: str, global_config: Optional[Dict] = None) -> List[Dict[str, Any]]:
        """
        获取指定 Agent 已启用的技能
        
        Args:
            agent_name: Agent 名称
            global_config: OpenClaw 全局配置（可选，避免重复读取）
            
        Returns:
            技能列表，每个技能包含 id, name, description, enabled
        """
        if global_config is None:
            # 读取全局配置
            from openclaw_config import get_openclaw_config_manager
            manager = get_openclaw_config_manager()
            global_config = manager.read_global_config()
        
        # 获取全局技能配置
        global_skills = global_config.get("skills", {}).get("entries", {})
        
        # 查找 agent 配置
        agent_list = global_config.get("agents", {}).get("list", [])
        agent_config = None
        for agent in agent_list:
            if agent.get("id") == agent_name:
                agent_config = agent
                break
        
        # 获取 agent 特有的技能列表
        agent_skills = agent_config.get("skills", []) if agent_config else []
        
        # 获取所有可用技能
        all_skills = self.get_all_available_skills()
        
        # 构建结果
        result = []
        for skill in all_skills:
            # 检查是否在 agent 的 skills 列表中
            is_enabled = skill.id in agent_skills
            
            # 检查全局是否启用（如果 agent 没有单独配置）
            if not is_enabled and skill.id in global_skills:
                is_enabled = global_skills[skill.id].get("enabled", False)
            
            result.append({
                **skill.to_dict(),
                "enabled": is_enabled
            })
        
        return result
    
    def enable_skill_for_agent(self, agent_name: str, skill_id: str, 
                               global_config: Optional[Dict] = None) -> Tuple[bool, str]:
        """
        为指定 Agent 启用技能
        
        Args:
            agent_name: Agent 名称
            skill_id: 技能 ID
            global_config: OpenClaw 全局配置（可选）
            
        Returns:
            (成功, 消息)
        """
        try:
            from openclaw_config import get_openclaw_config_manager
            manager = get_openclaw_config_manager()
            
            if global_config is None:
                config = manager.read_global_config()
            else:
                config = global_config
            
            # 查找 agent
            agent_list = config.get("agents", {}).get("list", [])
            target_agent = None
            for agent in agent_list:
                if agent.get("id") == agent_name:
                    target_agent = agent
                    break
            
            if not target_agent:
                return False, f"Agent '{agent_name}' 不存在"
            
            # 确保 skills 字段存在
            if "skills" not in target_agent:
                target_agent["skills"] = []
            
            # 检查是否已启用
            if skill_id in target_agent["skills"]:
                return True, f"技能 '{skill_id}' 已在 Agent '{agent_name}' 中启用"
            
            # 添加到 skills 列表
            target_agent["skills"].append(skill_id)
            
            # 写入配置
            if manager.write_global_config(config):
                return True, f"成功为 Agent '{agent_name}' 启用技能 '{skill_id}'"
            else:
                return False, "写入配置失败"
                
        except Exception as e:
            return False, f"启用技能失败: {str(e)}"
    
    def disable_skill_for_agent(self, agent_name: str, skill_id: str,
                                global_config: Optional[Dict] = None) -> Tuple[bool, str]:
        """
        为指定 Agent 禁用技能
        
        Args:
            agent_name: Agent 名称
            skill_id: 技能 ID
            global_config: OpenClaw 全局配置（可选）
            
        Returns:
            (成功, 消息)
        """
        try:
            from openclaw_config import get_openclaw_config_manager
            manager = get_openclaw_config_manager()
            
            if global_config is None:
                config = manager.read_global_config()
            else:
                config = global_config
            
            # 查找 agent
            agent_list = config.get("agents", {}).get("list", [])
            target_agent = None
            for agent in agent_list:
                if agent.get("id") == agent_name:
                    target_agent = agent
                    break
            
            if not target_agent:
                return False, f"Agent '{agent_name}' 不存在"
            
            # 检查 skills 字段
            if "skills" not in target_agent:
                return True, f"技能 '{skill_id}' 未在 Agent '{agent_name}' 中启用"
            
            # 从 skills 列表中移除
            if skill_id not in target_agent["skills"]:
                return True, f"技能 '{skill_id}' 未在 Agent '{agent_name}' 中启用"
            
            target_agent["skills"].remove(skill_id)
            
            # 写入配置
            if manager.write_global_config(config):
                return True, f"成功为 Agent '{agent_name}' 禁用技能 '{skill_id}'"
            else:
                return False, "写入配置失败"
                
        except Exception as e:
            return False, f"禁用技能失败: {str(e)}"
    
    def install_skill(self, skill_id: str, source: str = "npm") -> Tuple[bool, str]:
        """
        安装新技能
        
        Args:
            skill_id: 技能 ID
            source: 安装源，默认为 npm
            
        Returns:
            (成功, 消息)
        """
        # TODO: 实现 skill 安装逻辑
        # 目前 OpenClaw 通过 `openclaw skills install <skill>` 命令安装
        # 这里可以封装该命令
        return False, "技能安装功能需要通过 OpenClaw CLI 实现"


# 全局实例
_skills_manager_instance: Optional[OpenClawSkillsManager] = None


def get_skills_manager(openclaw_home: Optional[Path] = None) -> OpenClawSkillsManager:
    """获取全局技能管理器实例"""
    global _skills_manager_instance
    if _skills_manager_instance is None:
        _skills_manager_instance = OpenClawSkillsManager(openclaw_home)
    return _skills_manager_instance


if __name__ == "__main__":
    # 测试
    manager = get_skills_manager()
    
    print("=" * 60)
    print("OpenClaw Skills Manager Test")
    print("=" * 60)
    
    print("\n所有可用技能:")
    skills = manager.get_all_available_skills()
    for skill in skills[:10]:  # 只显示前10个
        print(f"  {skill.emoji} {skill.name} ({skill.source})")
    
    print(f"\n共 {len(skills)} 个技能")
