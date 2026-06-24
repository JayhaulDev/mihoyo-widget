---
title: TrayIconBuilder ID
date: 2026-06-24
related: ADR-0003
---

`TrayIconBuilder::new()` 不生成 id `"main"`，而是 `"{pid}-{counter}"`。
需要用 `TrayIconBuilder::with_id("main")` 显式指定 id，才能用 `app.tray_by_id("main")` 查到。

相关代码: `apps/desktop/src/lib.rs` 中 `rebuild_tray_menu` 和 TrayIconBuilder 构建。
