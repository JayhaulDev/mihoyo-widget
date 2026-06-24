# Settings Page Redesign — iOS-Style Drill-Down Navigation

## 背景

当前设置页把所有内容平铺在一个长列表中：Cookie 输入框、数据目录、通知开关、Save/Cancel 按钮全部混在一起。窗口仅 360x590，通知子选项展开后需要大量滚动，且手动的「保存/取消」流程不符合 iOS 直觉。

## 目标

1. 分组管理 — 将现有设置拆为 4 组：账号、数据存储、通知、通用
2. iOS Settings 风格 — 主菜单 → 点击 drill-down 进子页编辑
3. 自动保存 — 去掉全局保存按钮，切换/失焦/返回时自动保存
4. 统一导航顶栏 — 左返回、中标题、右关闭
5. 保留现有通知 UI 布局不变，仅迁移位置

## 改动范围

| 文件 | 改动 | 影响程度 |
|------|------|----------|
| `packages/frontend/index.html` | 重写设置区域 HTML，增加子页容器 | 大 |
| `packages/frontend/src/style.css` | 新增设置导航、子页、顶栏样式 | 中 |
| `packages/frontend/src/main.js` | 新增导航栈逻辑、自动保存、移除保存按钮 | 中 |

## 详细设计

### 1. 导航栈机制

新增全局状态与函数：

```js
let settingsStack = ['settings-root'];
let settingsPreviousTab = null;

function pushSubpage(pageId) {
  // slide-out-left current, slide-in-from-right new
  settingsStack.push(pageId);
  renderSettingsNav();
}

function popSubpage() {
  if (settingsStack.length <= 1) return;
  // slide-out-right current, slide-in-from-left prev
  settingsStack.pop();
  renderSettingsNav();
}

function closeSettings() {
  isSettingsOpen = false;
  settingsStack = ['settings-root'];
  currentTab = settingsPreviousTab;
  updateTabBar();
  renderTab();
}
```

### 2. HTML 结构

设置区域改为：

```html
<div id="settings-view" class="tab-content">
  <!-- Navigation bar -->
  <div id="settings-nav">
    <button id="settings-back">← 设置</button>
    <span id="settings-title">设置</span>
    <button id="settings-done">完成</button>
  </div>

  <!-- Root menu -->
  <div id="settings-root" class="settings-page active">
    <div class="settings-group">
      <div class="settings-menu-row" data-page="settings-account">
        <div class="settings-menu-icon">👤</div>
        <div class="settings-menu-label">
          <span class="settings-menu-title">账号</span>
          <span class="settings-menu-summary" id="summary-account">未配置</span>
        </div>
        <div class="settings-menu-chevron">></div>
      </div>
      <div class="settings-menu-row" data-page="settings-storage">
        <div class="settings-menu-icon">📁</div>
        <div class="settings-menu-label">
          <span class="settings-menu-title">数据存储</span>
          <span class="settings-menu-summary" id="summary-storage">默认位置</span>
        </div>
        <div class="settings-menu-chevron">></div>
      </div>
    </div>
    <div class="settings-group">
      <div class="settings-menu-row" data-page="settings-notifications">
        <div class="settings-menu-icon">🔔</div>
        <div class="settings-menu-label">
          <span class="settings-menu-title">通知</span>
          <span class="settings-menu-summary" id="summary-notifications">2 项开启</span>
        </div>
        <div class="settings-menu-chevron">></div>
      </div>
    </div>
    <div class="settings-group">
      <div class="settings-menu-row" data-page="settings-general">
        <div class="settings-menu-icon">⚙️</div>
        <div class="settings-menu-label">
          <span class="settings-menu-title">通用</span>
          <span class="settings-menu-summary" id="summary-general">轮询 90s</span>
        </div>
        <div class="settings-menu-chevron">></div>
      </div>
    </div>
  </div>

  <!-- Subpages -->
  <div id="settings-account" class="settings-page"></div>
  <div id="settings-storage" class="settings-page"></div>
  <div id="settings-notifications" class="settings-page"></div>
  <div id="settings-general" class="settings-page"></div>
</div>
```

### 3. 自动保存策略

| 触发点 | 行为 |
|--------|------|
| 开关切换 (`change` 事件) | 立即收集所有字段并 `invoke('save_config')` |
| 输入框失焦 (`blur` 事件) | 同上，但防抖 300ms |
| 导航返回 (`popSubpage`) | 保存当前子页所有修改 |
| 关闭设置 (`closeSettings`) | 不额外保存（已即时保存） |

实现：

```js
function saveCurrentSettings() {
  const nc = collectSettingsFromDOM();
  invoke('save_config', { newConfig: nc }).catch(console.error);
  config = nc;
}

// 所有输入框绑定 blur/debounce 自动保存
// 所有 toggle 绑定 change 即时保存
```

### 4. 子页内容

#### 账号子页 (`settings-account`)

- Cookie 密码输入框 (+ 显示/隐藏按钮)
- SToken 密码输入框
- UID 纯文本输入
- STUID 纯文本输入
- MID 纯文本输入
- 分隔线
- 「从米游社登录」整行按钮 → 调用 `open_login_webview`
- 底部提示：修改后自动保存

#### 数据存储子页 (`settings-storage`)

- 当前路径显示（等宽字体，灰色）
- 「选择其他目录」按钮 → `invoke('pick_data_dir')`
- 底部说明文字

#### 通知子页 (`settings-notifications`)

- 保持当前通知 UI 布局和代码不变，整体移入
- 移除底部 Save/Cancel 按钮

#### 通用子页 (`settings-general`)

- 轮询间隔：显示当前值，点击弹出 Picker（60s/90s/120s/300s）
- 通知模式：iOS 开关（tray 静默/弹窗）
- 主题：浅色/深色/跟随系统（Picker 或三段式）
- 重新引导：点击重新触发 `showWelcome()`
- 版本号：静态显示

### 5. 滑动动画

| 动作 | 当前页 | 目标页 |
|------|--------|--------|
| push | slide-out-left (opacity→0, x→-30) | slide-in-from-right (x→30→0) |
| pop | slide-out-right (x→0→30) | slide-in-from-left (opacity→0→1, x→-30→0) |

CSS transition: `transform 0.3s ease, opacity 0.25s ease` + `will-change: transform, opacity`

### 6. 菜单行摘要更新

每次 `loadSettingsForm()` 后更新各菜单行摘要文本：

- 账号：Cookie 是否配置 → 「已配置」/「未配置」
- 存储：data_dir 是否自定义 → 路径摘要或「默认位置」
- 通知：统计开启项数量 → 「N 项开启」
- 通用：poll_interval_secs → 「轮询 90s」

## 不涉及

- 不修改 Rust 后端（Settings 结构体、Tauri 命令、通知配置）
- 不修改 welcome overlay 逻辑
- 不修改 tab 切换机制（`switchTab` 入口不变）

## 实现顺序

1. CSS — 新增设置导航顶栏、菜单行、子页、动画样式
2. HTML — 重写设置区域为 root + subpages 结构
3. JS — 导航栈、自动保存、push/pop 事件绑定
4. JS — 子页内容渲染函数（移入现有通知代码）
5. 删除旧设置代码（平铺 HTML、Save/Cancel 按钮、旧样式）
