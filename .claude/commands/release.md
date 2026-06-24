---
name: release
description: 发布新版本 — 更新 CHANGELOG、bump 版本号、commit + tag
---

# Release

执行发布流程。需要先确认 Review 已通过、代码已合入 main。

## Steps

1. 确认当前在 main 分支，没有未提交改动
2. 确认前一次 commit 到现在的改动类型（breaking / feature / fix）
3. **更新 CHANGELOG**
   ```bash
   cd /media/jayhaul/dev/Code/mihoyo-widget/packages/frontend && npx conventional-changelog -p conventionalcommits -i CHANGELOG.md -s
   ```
   或全量重生成（包括历史）：
   ```bash
   cd /media/jayhaul/dev/Code/mihoyo-widget/packages/frontend && npx conventional-changelog -p conventionalcommits -i CHANGELOG.md -s -r 0
   ```
4. **版本号 bump**
   根据改动类型推断 major/minor/patch，更新 packages/frontend/package.json 中的 version 字段
5. **提交**
   ```bash
   git add CHANGELOG.md package.json
   git commit -m "chore: release v<version>"
   git tag v<version>
   ```
6. 推送到远程
7. 触发 GitHub Actions release workflow（如果有）
