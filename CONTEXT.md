# Mihoyo Widget — Domain Glossary

## 领域边界

当前仅支持 **Honkai: Star Rail（星穹铁道 / HSR）**。架构按「共享基础设施 + 按游戏分包」组织，未来可添加更多游戏。

---

## 核心概念

### Widget / 挂件
桌面实时数据显示面板。组件以系统托盘常驻 + 弹出窗口形式展示游戏实时状态。核心数据源是米游社的实时便签（Note）API。

### Note / 实时便签
从 `game_record/app/hkrpg/api/note` 拉取的实时游戏状态。包含体力、派遣、模拟宇宙积分、每周首领等。WidgetData 是 Note 的序列化表示，也是轮询主循环（poller）的核心数据。

### 体力（Stamina / 开拓力）
HSR 中执行副本消耗的核心资源。`max_stamina=240`。Widget 监控当前体力值并在超过 80%/95% 时触发通知。

### 备用体力（Reserve Stamina）
体力溢出时自动存储的次级资源，满时触发通知。

### 派遣（Expedition / 委托）
角色派遣任务。`total_expedition_num` 表示总派遣栏位，`accepted_expedition_num` 为进行中数量。全部完成时触发通知。

### 模拟宇宙积分（Rogue Score / 模拟宇宙积分）
每周模拟宇宙积分奖励。`max_rogue_score` 为本周上限。积分为 0 且之前有积分时触发通知。

### 混沌回忆（Forgotten Hall）
HSR 周期性挑战模式，每两周一期。同属"挑战"（Challenge）分类。

### 虚构叙事（Pure Fiction）
HSR 周期性挑战模式，与混沌回忆交替更新。同属"挑战"（Challenge）分类。

### 末日幻影（Apocalyptic Shadow）
HSR 周期性挑战模式。同属"挑战"（Challenge）分类。三种挑战共用相同的 `ChallengeInfo` 结构，仅 API 端点不同。

### 挑战峰值（Challenge Peak / 挑战峰值）
终局挑战排行榜，按当期挑战模式轮换。

### 周期演算（Periodic Act / 差分宇宙周期演算）
差分宇宙（Divergent Universe）的每周活动周期，独立于其他挑战。

### 模拟宇宙常驻存档（Rogue Archive）
模拟宇宙三个永久玩法分支的收藏进度：
- **虫灾（Locust / 寰宇蝗灾）**
- **智识（Nous / 智识令使）**
- **黄金与机械（Magic）**
三者近似静态数据，仅在版本更新时变化。

### 战报（Ledger / 开拓月报）
每月星琼/星轨通票收支明细。`LedgerData` 包含月汇总，`LedgerDetail` 可逐条查看。

### 跃迁记录 / 活动跃迁（Banner / 卡池）
角色与光锥活动跃迁的当期信息和倒计时。来自 `api-takumi-record` 的活动日历 API。

### 签到（Sign-in / 每日签到）
米游社每日签到（luna 系统）。`has_signed` 标记嵌入在 WidgetData 中。

---

## 基础设施概念

### 米游社 API（miHoYo API / 米游社接口）
上游数据源。所有游戏数据通过 `api-takumi-record.mihoyo.com` 的子域名获取。需要认证（Cookie 或 SToken）和请求签名（DS）。

### DS 签名（Dynamic Secret）
米哈游 API 请求签名算法。MD5 哈希含 salt、时间戳、随机数和排序后的查询参数。当前使用 `SALT_X4`（"xV8v4Qu54lUKrEYFZkJhB8cuOh9Asafs"），适用 client_type=5（Web）。

### 设备指纹（Device FP）
米哈游用于设备识别的一次性指纹。通过 `device-fp-api` 注册，返回 `device_fp` 字符串。后续所有 API 请求以 `x-rpc-device_fp` 头发送。

### Cookie / 认证凭据
两种登录方式：
- **完整 Cookie**：直接传递浏览器 Cookie 字符串
- **SToken**：`stuid` + `stoken` + `mid`（可选），运行时组装为 Cookie

### Settings / 配置
运行时配置。加载优先级：`runtime.json` > `Mihoyo-env.json` > 环境变量。保存回 `runtime.json`。

### KV Cache
基于 SQLite（WAL 模式）的键值缓存。各数据项有独立 TTL：
- Player: 1h
- Challenge: 4h
- Ledger / Banner: 6h
- Widget（Note）: 随轮询周期自动刷新

### Poller / 轮询循环
后台异步循环，约 90s 间隔拉取 Note 数据。失败时指数退避（最大 15min）。Player/Ledger/Banner/Challenge 等低频数据在其 TTL 到期后随下一次成功轮询一并刷新。

### 通知规则（Notification Rules）
基于 WidgetData 的新/旧值对比触发的系统通知。规则包括：体力阈值提醒、派遣完成、备用体力满、签到提醒（可设时间）、模拟宇宙未打提醒（可设时间）、每日摘要。通过 `tauri-plugin-notification` 发送。`check_rules` 接受 `&NotificationConfig` 控制每条规则的开关和参数。

### 通知模式（Notification Mode / 纯系统通知模式）
无 WebView UI 的运行模式。系统托盘右键可在窗口模式 ↔ 通知模式间切换。通知模式下窗口隐藏（hide），轮询循环继续运行，通知规则正常触发。模式选择保存到 `runtime.json`，重启自动恢复。

### 通知配置（NotificationConfig）
`packages/core/src/config/settings.rs` 中的配置结构体，序列化在 `Settings::notification` 中。包含 12 个字段：`notification_mode`（模式开关）、各规则的 enabled 开关、体力阈值（mild/urgent）、签到/模拟宇宙提醒时间（HH:MM 或 EEE HH:MM）、每日摘要开关与时间。`#[serde(default)]` 保证旧版本兼容。

---

## 多游戏扩展（规划）

核心 crate（`packages/core`）提供共享基础设施：API 签名、设备指纹注册、配置加载、SQLite 缓存。各游戏 crate（`packages/game-*`）提供各自的 API Client、数据类型和通知规则。预期添加的游戏：
- **Genshin Impact（原神）** → `packages/game-gi`
- **Zenless Zone Zero（绝区零）** → `packages/game-zzz`
