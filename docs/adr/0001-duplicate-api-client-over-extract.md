# ADR-0001: 游戏特定 API Client 先复制而非抽取公用

**日期**：2026-06-24

**状态**：Accepted

## 上下文

core crate（`packages/core`）内有一个 `MihoyoApiClient`（当前 `#[allow(dead_code)]`），提供 moHoYo API 的通用 GET/POST 和 DS 签名。game-hsr crate 需要一个 HSR 特定的 API Client，但其实现基本是复制 `MihoyoApiClient` 的代码，加上游戏特有的业务方法（`get_note`、`get_banners`、`get_forgotten_hall` 等）。

同样地，`packages/core/src/api/client.rs` 中的 `register_device_fp` 也被复制到了 `packages/game-hsr/src/api/client.rs` 中。

## 决策

保持复制，暂不抽取公用 API Client。当添加第 3 个游戏 crate 时，再考虑将 `packages/core` 中的公用 client 重构为可复用的抽象。

## 理由

- **尚不清楚正确的 seam** — 不同游戏的 API Client 可能有不同的认证流程、签名 salt、端点模式。第 2 个游戏（game-hsr）的实现尚未充分揭示哪些部分是真正共享的。
- **抽象的时机是看到 3 个实例之后** — 2 个实例只能猜测，3 个实例才能看到变化模式。
- **DRY 过早会导向错误抽象** — 从 2 个实例抽取的公用 client 很可能在第 3 个游戏时被推翻。
- **复制成本低** — API Client 主体机械重复，业务方法才是差异化价值。复制不会显著增加维护负担。

## 时机触发器

当以下条件满足时，应重构抽取公用 API Client：
1. 添加了第 3 个游戏 crate（如 game-gi 或 game-zzz）
2. 或同一段认证/签名代码需要修复 bug，但修改跨 2 个以上 crate
