---
name: mihoyo-dev-flow
description: Mihoyo Widget 全流程开发工作流。当用户说要加功能、改东西、修bug、发版本时触发。包含 Grill → Spec → Implement → Review → Ship → Retrospect 六个阶段。自动融合 codebase-memory、CONTEXT.md、ADR 和 git-guardrails。单人Rust Tauri 桌面端项目。
disable-model-invocation: false
---

# Mihoyo Dev Flow

一套 6 阶段开发工作流，覆盖从想法到发布的完整过程。对话式触发 — 你说出需求，我带你走完。

开始前，先确认：
1. 读 CONTEXT.md 和已有 ADR 了解当前架构上下文
2. 调 `codebase-memory get_architecture` 看当前项目全景
3. 开始 Grill 阶段

---

## Phase 1: Grill（需求打磨）

**目标：** 把模糊想法敲实，明确范围和成功标准。

**做法：**
1. 听你描述需求
2. 追问边界（做什么 / 不做什么）
3. 用 CONTEXT.md 统一术语
4. 用 `codebase-memory` 定位影响模块
5. 输出到 `docs/specs/YYYY-MM-DD-<topic>.md`

**完成条件：**
- [ ] 功能边界清晰
- [ ] 涉及模块已定位
- [ ] 领域术语一致
- [ ] 可以进入设计阶段

## Phase 2: Spec（接口设计）

**目标：** 敲定数据结构和接口签名，但不动实现代码。

**做法：**
1. 读相关 ADR 不踩坑
2. 定义 Rust struct / type / API 签名，给你确认
3. 跨 crate 改动时用 `codebase-memory trace_path` 追踪调用链
4. 评估通知规则影响（notify/rules.rs）

**完成条件：**
- [ ] 接口签名和数据结构已确认
- [ ] 改动范围明确
- [ ] 可进入实现

## Phase 3: Implement（实现）

**目标：** 实现代码，TDD 方式：类型定义 → 测试 → 实现。

**做法：**
1. 先写类型/接口定义
2. 再写单元测试
3. 再写实现
4. 每单元 `cargo check` + `cargo clippy`
5. F5 热重载验证
6. git-guardrails 自动保护

**完成条件：**
- [ ] cargo check 无错误
- [ ] cargo clippy 无新增 warning
- [ ] 新代码有测试覆盖
- [ ] F5 运行验证前端加载正常
- [ ] 未改动不需要改的部分（YAGNI）

**依赖：** VSCode launch config（F5）、git-guardrails

## Phase 4: Review（审查）

**目标：** 人工过代码，确保质量。

**做法：**
1. `codebase-memory detect_changes` 看影响范围
2. `cargo clippy` + `cargo test` 全量跑
3. `search_graph` / `trace_path` 验证调用链
4. 逐文件 review，讨论有疑问的地方
5. 你确认通过

**完成条件：**
- [ ] clippy + test 全过
- [ ] detect_changes 无异常
- [ ] 你人工确认

## Phase 5: Ship（发布）

**目标：** 版本发布，更新 changelog + tag。

**做法：**
1. 运行 conventional-changelog 更新 CHANGELOG.md
2. 版本号 bump（major/minor/patch 按改动类型）
3. commit + tag
4. 触发 CI release workflow

**完成条件：**
- [ ] CHANGELOG.md 已更新
- [ ] 版本号合理（major=breaking / minor=feature / patch=fix）
- [ ] 已 commit + tag

**快捷方式：** 也可独立用 `/release` 命令

## Phase 6: Retrospect（复盘沉淀）

**目标：** 把学到的记下来，下次少走弯路。

**做法：**
1. CONTEXT.md 是否有新术语？ → 更新
2. 是否有值得记的 ADR？ → 写 docs/adr/
3. 是否有重复踩的坑？ → 记 .claude/rules/

**完成条件：**
- [ ] CONTEXT.md 已反映本轮新术语
- [ ] 需要记的 ADR 已写
- [ ] 重复性教训已记入 rules/
