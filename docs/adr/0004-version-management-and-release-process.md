# ADR-0004: 版本管理和发布流程

**日期**：2026-06-27

**状态**：Accepted

## 上下文

项目发布时需要确定版本号。版本信息散落在多个文件中，需要统一规范谁是真源、每次 bump 改哪些文件。

## 决策

### 版本号规范

遵循 `major.minor.patch`（SemVer）：

- **major** — 破坏性改动（不向后兼容的配置/API/界面）
- **minor** — 新功能（向后兼容）
- **patch** — 缺陷修复

### 版本号位置

| 文件 | 角色 | 更新策略 |
|------|------|---------|
| 文件 | 角色 | 更新策略 |
|------|------|---------|
| `apps/desktop/tauri.conf.json` | **产品版本·唯一真源** | 发版时改 |
| `apps/desktop/Cargo.toml` | 产品版本·对齐 tauri.conf.json | 发版时同步改 |
| `Cargo.toml` (workspace) | 内部版本，但必须与产品版相同 | 发版时同步改 |
| `packages/core/Cargo.toml` | 内部 lib 版本·不发布 | 不动 |
| `packages/game-hsr/Cargo.toml` | 内部 lib 版本·不发布 | 不动 |
| `package.json` (根) | workspace 脚本·不发布 | 不动 |
| `packages/frontend/package.json` | 前端构建·不发布 | 不动 |

内部 lib crate（core、game-hsr）的版本不维护、永远不 bump。

### Tag

格式：`v{major}.{minor}.{patch}`，例如 `v0.2.0`。

Tag 打在发布 commit 上。Commit 包含：
1. `tauri.conf.json` 版本 bump
2. `apps/desktop/Cargo.toml` 版本 bump
3. `CHANGELOG.md` 更新

### 发布流程

```bash
# 1. Bump 版本号
# 改 tauri.conf.json、apps/desktop/Cargo.toml、Cargo.toml

# 2. 更新 CHANGELOG
npx conventional-changelog -p conventionalcommits -i CHANGELOG.md -s

# 3. 编译验证
cargo check
npm run build

# 4. 提交 + tag
git commit -m "chore: release v{version}"
git tag -a v{version} -m "v{version}"
git push origin main
git push origin v{version}

# 5. Release workflow 构建并发布
# .github/workflows/release.yml 自动触发
```

## 理由

- **维护数量最小化** — 只改 3 个文件（2 个 toml + 1 个 json），其他不管
- **产品版本唯一** — 避免「哪个版本号是人看的」歧义
- **内部 lib 不关心版本** — solo 项目没有 lib 发布需求，Cargo.toml 的 version 只用于依赖解析匹配

## 经验教训

- workspace root version 必须和 desktop crate 同步，否则 `cargo check` 工作区不一致报 warning
- `package.json` 的 version 无人看，不需要维护
- Release workflow 的 release body 从 `CHANGELOG.md` 提取，保持格式一致即可

## 触发器

当需要把 core 或 game-hsr 作为独立包发布时，重新考虑 lib 版本管理策略。
