# ADR-0002: 单 KV 表缓存设计

**日期**：2026-06-24

**状态**：Accepted

## 上下文

`CacheDb` 使用 SQLite 单表 `kv_cache(key TEXT PK, json TEXT, created_at INTEGER)` 存储所有数据 —— 包括 WidgetData、PlayerInfo、ChallengeInfo、BannerData、RogueArchive 等，统一用 key 前缀区分。

替代方案是每类数据分表，如 `CREATE TABLE player_cache (...)`、`CREATE TABLE banner_cache (...)`。

## 决策

维持单 KV 表设计，不做分表。

## 理由

- **查询模式单一** —— 所有缓存操作目前只有「按 key 读写 JSON」「检查 TTL 是否过期」两种。没有按数据类型聚合查询、没有联表、没有按字段过滤。
- **模式变更成本低** —— 添加新数据类型只需定义一个新的 key 字符串，无需跑 migration。对一个小型桌面应用来说，省掉模式维护的开销大于分表的好处。
- **性能足够** —— SQLite WAL 模式 + 单表索引在单用户桌面场景下无瓶颈。每轮轮询数十次写入，远低于 SQLite 单表承受上限。
- **分表的优势（独立 TTL、独立清理）可由上层代码实现** —— key 命名约定 `prefix_suffix` 足以模拟分表语义。TTL 常量在 `game-hsr/src/api/cache.rs` 中定义，未来添加独立清理策略只需要按 key 前缀 DELETE。

## 时机触发器

当以下任一条件出现时，考虑迁移到分表：
1. 缓存数据量超过 10 万条（当前 ~10 条）
2. 需要按数据类型做批量过期/清理
3. 需要按缓存数据中的字段做查询（非 JSON 全文解析）
