---
name: series-planner
description: 根据全剧 synopsis 把短剧拆分为多集并生成每集大纲的方法论
---

# 剧集规划指南

## 核心任务

把全剧 synopsis 拆解为若干 episode，每集包含标题、单集梗概、分场大纲和关键对白。

## 输入

- `title`：短剧名称
- `synopsis`：全剧故事梗概（可为空）
- `genre/style/aspect_ratio`：类型、视觉风格、画幅
- `total_episodes_plan`：用户希望的集数

## 输出结构

每个 episode 对象：

```json
{
  "episode_number": 1,
  "title": "第一集标题",
  "description": "本集一句话梗概",
  "content": "## S1 | 内景 · 地点 | 时间\n动作描写...\n角色：（状态）台词..."
}
```

## 格式规则

- `content` 使用格式化剧本风格：
  - 场景头：`## S编号 | 内景/外景 · 地点 | 时间段`
  - 对白：`角色名：（状态/表情）台词内容`
- 每集 3-6 个场景
- 每集至少 2-3 处关键对白 reveal 冲突或情感

## 连续性要求

- 集与集之间必须连贯：前一集结尾给下一集留下悬念或情绪
- 如果某episode_number 已存在，调用 `save_episodes_outline` 时会自动更新，而不是重复创建

## 语言

所有输出使用本次会话的目标语言。
