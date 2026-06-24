---
paths: "apps/desktop/src/** packages/core/src/** packages/game-hsr/src/**"
---
# Mihoyo Widget — 开发流程规则

## 项目结构
- Rust workspace: packages/core（共享基础设施）、packages/game-hsr（星铁逻辑）、apps/desktop（Tauri 桌面壳）
- 前端: packages/frontend（Vanilla JS + Vite）
- 领域术语定义在项目根 CONTEXT.md
- 架构决策记录在 docs/adr/

## 已有工具
- codebase-memory-mcp: 代码知识图谱，用于架构查询和影响分析
- git-guardrails: 拦截 git push / reset --hard / branch -D 等危险操作
- CONTEXT.md + ADR: 领域术语和架构决策的持久化

## 编译调试
- 调试: F5（launch config "🔧 Rust + Vite (hot reload)"）
- cargo check / clippy 在提交前必须过
- 前端用 Vite dev server (localhost:5173)，tauri.conf.json 中 devUrl 指向它
