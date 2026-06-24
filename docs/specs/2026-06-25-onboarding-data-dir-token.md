# Onboarding Wizard + Data Directory Config + WebView Token Login

## 背景

当前应用首次启动直入仪表盘，无配置引导。若未配置 Cookie，轮询静默跳过，用户需自行点进设置页手动填写令牌。`runtime.json` 数据目录硬编码在 `~/.config/mihoyo-widget`，无法变更。令牌获取完全依赖用户自行从浏览器粘贴 Cookie/SToken，体验割裂。

## 目标

1. **首次启动欢迎向导** — 步骤式引导完成必要配置，之后可通过托盘菜单重新打开
2. **数据目录可选** — 首次启动用系统目录选择器 + 设置页路径输入/浏览按钮
3. **内嵌 WebView 登录** — 打开米游社登录页，用户登录后自动捕获 Cookie/SToken，填入设置

## 改动范围

### 涉及 crate

| Crate | 改动 | 影响程度 |
|-------|------|----------|
| `packages/core/src/config/settings.rs` | +`data_dir` 字段、`first_run_done` 标记 | 中 |
| `packages/core/src/cache/` | `open()` 接受 data_dir 参数 | 中 |
| `packages/core/src/lib.rs` | 导出新模块 | 低 |
| `packages/core/Cargo.toml` | +`tauri-plugin-dialog`（依赖传递） | 低 |
| `apps/desktop/src/lib.rs` | +welcome 状态、+webview-login 命令、+data_dir 传递 | 高 |
| `apps/desktop/src/main.rs` | 无改动 | 无 |
| `apps/desktop/tauri.conf.json` | 无改动（已有 window config 足够） | 无 |
| `apps/desktop/capabilities/default.json` | +dialog + fs 权限 | 低 |
| `apps/desktop/Cargo.toml` | +`tauri-plugin-dialog`、`tauri-plugin-fs` | 低 |
| `packages/frontend/index.html` | +welcome 页面 DOM | 中 |
| `packages/frontend/src/main.js` | +welcome 渲染/逻辑、+data-dir UI、+WebView 登录触发 | 高 |
| `packages/frontend/src/style.css` | +welcome 页面样式 | 低 |

### 不会改动的

- 通知规则（notify/rules.rs）
- 米游社 API Client（client.rs）
- 轮询循环结构（run_poller 的业务逻辑）
- 现有前端 tab 渲染逻辑（仅新增 welcome 遮罩层）

---

## 数据结构

### Settings 新增字段

```rust
// packages/core/src/config/settings.rs

pub struct Settings {
    // ...现有字段...
    
    #[serde(default)]
    pub data_dir: String,         // 空字符串 = 使用默认路径
    #[serde(default = "default_first_run_done")]
    pub first_run_done: bool,     // false = 首次启动，需要显示欢迎页
}

fn default_first_run_done() -> bool {
    false  // 默认未完成首次引导
}
```

```rust
// 新增：运行时欢迎页面状态（仅内存，不持久化）
#[derive(Default)]
pub struct WelcomeState {
    pub is_welcoming: bool,   // 正在显示欢迎页
}
```

### 路径逻辑变化

```rust
// 当前：runtime_config_path() 硬编码 dirs::config_dir()/mihoyo-widget/runtime.json
// 改为：
fn runtime_config_path(data_dir: &str) -> PathBuf {
    if data_dir.is_empty() {
        // 默认路径：~/.config/mihoyo-widget/runtime.json
        if let Some(base) = dirs::config_dir() {
            return base.join("mihoyo-widget").join("runtime.json");
        }
    } else {
        PathBuf::from(data_dir).join("runtime.json")
    }
    PathBuf::from("runtime.json")
}
```

```rust
// CacheDb::open() 接受 data_dir
pub fn open(data_dir: &str) -> Result<Self, String> {
    let path = if data_dir.is_empty() {
        dirs::cache_dir().map(|p| p.join("mihoyo-widget").join("cache.db"))
            .unwrap_or_else(|| PathBuf::from("cache.db"))
    } else {
        PathBuf::from(data_dir).join("cache.db")
    };
    // ...现有逻辑...
}
```

---

## 接口签名

### 新增 Tauri 命令（lib.rs）

```rust
// 获取首次运行状态 + 触发欢迎页
#[tauri::command]
fn check_first_run(state: State<AppState>) -> Result<WelcomeStatus, String>;

// 标记首次引导完成
#[tauri::command]
fn complete_first_run(state: State<AppState>, app: AppHandle) -> Result<String, String>;

// 选择数据目录（触发系统文件夹选择器）
#[tauri::command]
async fn pick_data_dir(state: State<'_, AppState>, app: AppHandle) -> Result<String, String>;

// 获取欢迎页状态（检测是否应显示）
#[tauri::command]
fn get_welcome_state(state: State<AppState>) -> Result<WelcomeState, String>;

// 打开登录 WebView（新窗口）
#[tauri::command]
async fn open_login_webview(app: AppHandle) -> Result<String, String>;
```

### 新增 Tauri 事件

```
"login-cookies-captured" — 登录 WebView 捕获到 Cookie/SToken 后发往主窗口
   payload: { cookie: string, stoken: string, stuid: string, mid: string }
```

### AppState 变化

```rust
pub struct AppState {
    pub config_data: Mutex<Settings>,
    pub cache_data: Mutex<CacheDb>,
    pub welcome_data: Mutex<WelcomeState>,  // 新增
}
```

---

## 前端欢迎页面设计

### 步骤结构（index.html overlay）

欢迎页作为全屏遮罩层覆盖在主界面之上，5 步。

```
┌─────────────────────────────────┐
│  [✓] 步骤指示器 (1/5)           │
│                                 │
│  ┌───────────────────────────┐  │
│  │   欢迎内容区域             │  │
│  │                           │  │
│  │   图标 / 说明 / 操作      │  │
│  │                           │  │
│  └───────────────────────────┘  │
│                                 │
│      [上一步]    [下一步]       │
│ 或:  [跳過引導, 進入主界面]    │
└─────────────────────────────────┘
```

### Step 1: 欢迎页（Welcome）

- 应用图标 + "欢迎使用 Mihoyo Widget"
- 简介：桌面实时监控星穹铁道游戏数据
- [下一步]

### Step 2: 数据目录（Data Directory）

- 说明：选择数据存储位置（缓存、配置等）
- 显示当前路径（默认：`~/.config/mihoyo-widget`）
- [选择目录] 按钮 → 触发系统文件夹选择器
- 可选：输入框手动编辑路径
- [上一步] / [下一步]

### Step 3: 登录设置（Login）

- 两种方式：
  - **[使用米游社登录]（推荐）** → 打开内嵌 WebView
  - **手动输入 Cookie** → 展开 cookie/stoken 输入框（同现有设置）
- 说明：登录后自动获取认证信息
- WebView 登录后：显示成功状态 + 登录用户名
- [上一步] / [下一步]

### Step 4: 功能简介（Feature Tour）

- 卡片式介绍：
  - 📊 实时数据 — 体力、派遣、模拟宇宙
  - 🎯 挑战追踪 — 混沌、虚构、末日
  - 🔔 通知提醒 — 可配置阈值和规则
  - 🖥️ 系统托盘 — 快速切换模式
- [上一步] / [下一步]

### Step 5: 完成（Done）

- 已就绪
- 建议下次启动的操作
- 勾选"下次启动不再显示"（默认勾选）
- [开始使用] → 进入主界面

### 非首次启动

托盘菜单增加 [显示欢迎引导] 菜单项（id: `show-welcome`），重新打开 Step 1，不自动标记完成。

---

## WebView 登录流程

```
┌─────────────────────────────────────┐
│  Tauri 窗口 (360×560, 无装饰)       │
│  标题: "米游社登录"                  │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  WebView:                   │    │
│  │  https://user.mihoyo.com/   │    │
│  │                             │    │
│  │  (用户在此输入账号密码)      │    │
│  │                             │    │
│  │  登录完成后:                 │    │
│  │  · URL 变为 https://user.   │    │
│  │    mihoyo.com/ 且含认证     │    │
│  └─────────────────────────────┘    │
│                                     │
│  [捕获Cookie] （用户点此完成）      │
│  [取消]                             │
└─────────────────────────────────────┘
```

### 详细步骤

1. Rust 端创建新 `WebviewWindow`，命名 `login-window`
   - 大小 360×560，无装饰，居中于父窗口
   - 导航到 `https://user.mihoyo.com/`
2. 用户在 WebView 中完成登录流程
3. 登录成功后，URL 转到 `https://user.mihoyo.com/` 或 `https://passport.mihoyo.com/`
4. 用户点击 [捕获Cookie] 按钮
5. Rust 端通过 `webview.eval()` 注入 JS：
   ```js
   (function() {
     // 获取非 httpOnly cookies
     const cookies = document.cookie.split(';').map(c => c.trim());
     const cookieObj = {};
     cookies.forEach(c => {
       const eq = c.indexOf('=');
       if (eq > 0) cookieObj[c.slice(0, eq).trim()] = c.slice(eq + 1);
     });
     // 尝试 localStorage（某些 token 存在这里）
     let localStoken = '', localStuid = '', localMid = '';
     try {
       localStoken = window.localStorage.getItem('stoken') || '';
       localStuid = window.localStorage.getItem('stuid') || '';
       localMid = window.localStorage.getItem('mid') || '';
     } catch(e) {}
     // 通过 __TAURI__ IPC 发回 Rust
     // 实际使用 postMessage + on_message 或 eval 返回值
     return JSON.stringify({
       documentCookie: document.cookie,
       cookieObj,
       localStorage: { stoken: localStoken, stuid: localStuid, mid: localMid }
     });
   })()
   ```
6. Rust 端获取返回值，解析 Cookie + SToken，构建完整凭据
7. 发送 `login-cookies-captured` 事件到主窗口
8. 关闭登录窗口
9. 前端收到事件，自动填充设置表单

### 登录 URL 备选

若 `https://user.mihoyo.com/` 登录流程有变，备选方案：
- `https://passport.mihoyo.com/account/auth?client_id=...`（OAuth 标准端点）
- `https://bbs.mihoyo.com/`（米游社首页，用户需先登录）

优先尝试 `user.mihoyo.com`，失败则 fallback。

---

## Tray 菜单变化

现有重构 `rebuild_tray_menu` 增加一项：

```
显示/隐藏窗口  CmdOrCtrl+Shift+H
刷新数据
────
欢迎引导              ← 新增 (id: "show-welcome")
────
切换到通知模式
────
退出              CmdOrCtrl+Q
```

---

## capability 权限

```json
// apps/desktop/capabilities/default.json
{
  "permissions": [
    "core:default",
    "core:window:allow-start-dragging",
    "core:window:allow-set-position",
    "core:window:allow-outer-position",
    "core:event:default",
    "notification:default",
    "notification:allow-is-permission-granted",
    "notification:allow-request-permission",
    "notification:allow-notify",
    // 新增:
    "dialog:default",
    "dialog:allow-open",
    "fs:default",
    "fs:allow-read",
    "fs:allow-write",
    "fs:allow-exists",
    "core:window:allow-create",      // 创建登录 WebView 窗口
    "core:webview:allow-eval"        // 在登录窗口注入 JS
  ]
}
```

---

## 实现顺序

1. **数据结构先行** — Settings 新增字段、WelcomeState 定义
2. **路径抽象** — `runtime_config_path()` + `CacheDb::open()` 接受 data_dir
3. **Tauri 命令** — `check_first_run`、`complete_first_run`、`pick_data_dir`
4. **欢迎前端** — HTML overlay + JS 步骤逻辑 + CSS
5. **托盘菜单** — 增加 "欢迎引导" 项
6. **WebView 登录** — `open_login_webview` + cookie 捕获
7. **前端集成** — 登录捕获后自动填充设置

---

## 边界情况

- **Settings::load() 返回 None（完全首次）** → `first_run_done = false`，触发欢迎
- **旧版 runtime.json 无 data_dir / first_run_done** → serde(default) 处理，不破坏加载
- **data_dir 无效（不可写）** → 选择器后验证可写，失败提示重新选择
- **WebView 登录中途关闭** → 正常回到欢迎页，不设 Cookie
- **WebView 捕获失败（httpOnly 限制）** → 捕获到什么填什么，余下手动输入
- **通知模式下首次运行** → 欢迎页必须显示窗口（override notification_mode），完成后再恢复
