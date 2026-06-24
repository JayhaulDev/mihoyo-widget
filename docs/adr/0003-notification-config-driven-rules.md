# ADR-0003: 通知规则自定义 — 运行时配置驱动

**日期**: 2026-06-24

**状态**: Accepted

## 上下文

原有 5 条通知规则（体力 80%/95%、派遣完成、备用体力满、未签到、模拟宇宙未打）全部硬编码在 `notify/rules.rs` 中。添加"纯系统通知模式"时，需要让用户自定义哪些规则启用、阈值和提醒时间。

## 决策

1. `NotificationConfig` 挂在 `Settings` 结构体上，序列化到 `runtime.json`
2. `check_rules` 接受 `&NotificationConfig` 参数，每条规则先查对应 enabled 开关再触发
3. 时间字段用字符串格式 `"HH:MM"`（每天）或 `"EEE HH:MM"`（每周），`is_time_reached()` 解析
4. `#[serde(default)]` 在 `NotificationConfig` 结构体+字段双重保证旧版本 `runtime.json` 兼容

## 理由

- **配置驱动优于代码条件编译** — 通知模式需要用 `notification_mode` 标记运行时切换，编译 feature 做不到动态切换
- **`#[serde(default)]` 是关键设计** — 旧版 runtime.json 无 `notification` 字段仍能正确反序列化，无需 migration
- **不新增 Tauri command** — 复用 `save_config`/`load_env_config`，前端只多收几个字段
- **时间字符串格式简单够用** — 无需 cron 表达式库，`is_time_reached` 纯语法解析无 panic

## 经验教训

- `TrayIconBuilder::new()` 生成的 ID 是 `"{pid}-{counter}"` 格式，不是 `"main"`。要用 `with_id("main")` 才能用 `app.tray_by_id("main")` 找到
- 前端保存设置时必须 carry forward `notification_mode`，否则 `#[serde(default)]` 会重置为 `false`。因为 `notification_mode` 不存在于任何 DOM 元素（只能托盘切换）
- `tokio::sync::Mutex` 的 `blocking_lock()` 在同步回调中工作，但 lock 持有时间应尽量短。在 `run_poller` 中两次 `lock().await` 可以合并为一次

## 触发器

当添加第 6 条通知规则时，考虑将规则定义抽成结构体数组而非逐个硬编码判断。
