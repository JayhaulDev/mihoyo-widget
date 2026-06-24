# 纯系统通知模式 — 设计文档

**日期**: 2026-06-24
**状态**: Draft

## 1. 概述

为 Mihoyo Widget 添加"纯系统通知模式"——无 WebView UI，后台轮询 + 条件触发系统通知。
系统托盘右键可在窗口模式 ↔ 通知模式间切换，选择写入 `runtime.json`，重启恢复。

## 2. 数据结构

### 2.1 `NotificationConfig`

`packages/core/src/config/settings.rs` 新增：

```rust
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct NotificationConfig {
    // ── 模式开关 ──
    pub notification_mode: bool,

    // ── 体力提醒 ──
    pub stamina_enabled: bool,
    pub stamina_threshold_mild: f64,       // 默认 0.80
    pub stamina_threshold_urgent: f64,     // 默认 0.95

    // ── 派遣完成 ──
    pub expedition_enabled: bool,

    // ── 备用体力满 ──
    pub reserve_stamina_enabled: bool,

    // ── 签到提醒（到达指定时间后才触发） ──
    pub sign_reminder_enabled: bool,
    pub sign_reminder_time: String,        // 默认 "20:00"

    // ── 模拟宇宙未打提醒（到达指定时间后才触发，每周重复） ──
    pub rogue_reminder_enabled: bool,
    pub rogue_reminder_time: String,       // 默认 "Sun 20:00"

    // ── 每日定时摘要 ──
    pub digest_enabled: bool,
    pub digest_time: String,               // 默认 "09:00"
}
```

`notification_mode` 是模式开关，独立于 `NotificationConfig` 的其他开关。
其他开关有 UI 时也生效——窗口模式下用户也可以关闭某条通知。

### 2.2 默认值

```rust
impl Default for NotificationConfig {
    fn default() -> Self {
        Self {
            notification_mode: false,
            stamina_enabled: true,
            stamina_threshold_mild: 0.80,
            stamina_threshold_urgent: 0.95,
            expedition_enabled: true,
            reserve_stamina_enabled: true,
            sign_reminder_enabled: true,
            sign_reminder_time: "20:00".into(),
            rogue_reminder_enabled: true,
            rogue_reminder_time: "Sun 20:00".into(),
            digest_enabled: false,
            digest_time: "09:00".into(),
        }
    }
}
```

## 3. 通知规则引擎改动

### 3.1 签名变更

```rust
// notify/rules.rs
pub fn check_rules(
    data: &WidgetData,
    old: Option<&WidgetData>,
    app: &tauri::AppHandle,
    config: &NotificationConfig,   // 新增
)
```

### 3.2 时间判断工具函数

```rust
/// 判断当前时间是否已到达指定时刻。
///
/// 格式：
///   "HH:MM"          — 每天，例 "20:00"
///   "EEE HH:MM"     — 每周固定日，例 "Sun 20:00"（三字母英文缩写）
///
/// 每天格式：当日 HH:MM 已过则为 true
/// 每周格式：当日为指定星期且 HH:MM 已过则为 true
/// 跨边界（如 02:00）：按当日是否 >= 该时刻
fn is_time_reached(time_str: &str) -> bool { ... }
```

格式示例：`"20:00"`（每天）、`"Sun 20:00"`（每周日）。

### 3.3 摘要通知

在 `check_rules` 之外，新增一个每天执行一次的函数：

```rust
pub fn check_digest(data: &WidgetData, app: &tauri::AppHandle, config: &NotificationConfig) {
    // 每天 config.digest_time 发一条摘要：
    // "体力 {cur}/{max} | 派遣 {done}/{total} | 签到 {'已签'|'未签'}"
}
```

在 `run_poller` 中每天首次满足时间时触发（用 `last_digest_date` 防止一天多发）。

### 3.4 各规则逻辑

| 规则 | enabled 判断 | time 判断 |
|------|-------------|-----------|
| 体力阈值 | `stamina_enabled` | 无（即时触发） |
| 派遣完成 | `expedition_enabled` | 无 |
| 备用体力满 | `reserve_stamina_enabled` | 无 |
| 签到提醒 | `sign_reminder_enabled` | `is_time_reached(sign_reminder_time)` |
| 模拟宇宙未打 | `rogue_reminder_enabled` | `is_time_reached(rogue_reminder_time)` |

体力阈值 `stamina_threshold_mild` 和 `stamina_threshold_urgent` 替代当前硬编码的 0.80/0.95。

## 4. 系统托盘菜单

### 4.1 菜单结构

```
显示/隐藏窗口              (CmdOrCtrl+Shift+H)
刷新数据
──────────
切换到通知模式     ✓       (根据当前模式显示对应文案 + 勾选)
通知设置...
──────────
退出                      (CmdOrCtrl+Q)
```

- **显示/隐藏窗口**：两种模式下都可用。通知模式下临时显示窗口供设置
- **切换到通知模式 / 切换到窗口模式**：文案根据当前模式切换。勾号标记当前模式
- **通知设置...**：打开 WebView 窗口到设置 tab

### 4.2 状态同步

```rust
fn rebuild_tray_menu(app: &AppHandle, notif_mode: bool) {
    // 重建菜单，根据 notif_mode 显示对应文案和勾选
}
```

切换后立即重建菜单。

## 5. 启动与切换流程

### 5.1 启动

```rust
// run() 内
if settings.notification.notification_mode {
    if let Some(w) = app.get_webview_window("main") {
        w.hide().ok();
    }
}
```

Builder 正常创建窗口，setup 末尾条件性隐藏。

### 5.2 切换

```rust
"toggle-notification-mode" => {
    let mut settings = state.config_data.lock().unwrap();
    settings.notification.notification_mode = !settings.notification.notification_mode;
    settings.save_to_runtime().ok();
    let new_mode = settings.notification.notification_mode;
    drop(settings);

    let window = app.get_webview_window("main");
    if new_mode {
        if let Some(w) = window { w.hide().ok(); }
    } else {
        if let Some(w) = window {
            w.show().ok();
            w.set_focus().ok();
        }
        // 发一次最新数据给前端刷新
        emit_all_cached(app);
    }
    rebuild_tray_menu(app, new_mode);
}
```

## 6. 前端设置页面

在现有 Settings tab 底部新增"通知设置"区块：

```
[通知设置]

☐ 体力提醒   阈值: [80% ▼] / [95% ▼]
☐ 派遣完成
☐ 备用体力满
☐ 签到提醒   提醒时间: [20:00]
☐ 模拟宇宙未打  提醒时间: [Sun 20:00]
☐ 每日摘要   推送时间: [09:00]
```

- Toggle（☐/☑）控制每个 enabled 字段
- 时间输入用 text input，格式 `HH:MM` 或 `EEE HH:MM`
- 保存到 Settings → backend save_config

## 7. 不变的部分

- 轮询循环 (`run_poller`) — 逻辑不变
- 前端数据展示 — 零修改（仅设置页加区块）
- 后端 API 调用 — 零修改
- 缓存层 — 零修改

## 8. 未纳入范围

- 首次配置体验（首次启动无 UI 时如何配置 Cookie）—— 首次仍需普通模式配置后再进通知模式
- 多游戏支持 —— 当前仅 HSR
