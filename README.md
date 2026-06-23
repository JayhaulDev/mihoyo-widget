# mihoyo-widget

Desktop widget for Honkai: Star Rail game data — stamina, challenges, banners, battle events, and more.

Built with **Tauri v2** (Rust backend) + **Vite** (vanilla JS frontend).  
Multi-platform, with workspace layout ready for future game support (Genshin, ZZZ).

## Features

- **仪表盘** — Real-time stamina ring, 2×3 status grid (sign-in, expeditions, weekly bosses, training)
- **挑战** — Forgotten Hall, Pure Fiction, Apocalyptic Shadow, Challenge Peak + weekly progress bars
- **活动·档案** — Monthly stellar jade ledger, active card pools, limited-time events with countdown and progress bars, Simulated Universe archives (Nous/Magic/Locust)
- **System tray** — Always-on notification area icon, right-click menu (show/hide, refresh, quit)
- **Theme toggle** — Dark/Light mode, persisted to localStorage
- **Desktop notifications** — Stamina nearly full, expeditions completed, etc.

## Project Structure

```
├── apps/
│   └── desktop/            Tauri v2 desktop app (binary, tray, window)
├── packages/
│   ├── core/               Shared Rust: HTTP client, DS signing, config, KV cache
│   ├── game-hsr/           HSR-specific: API client, data types, typed cache, notify rules
│   └── frontend/           Frontend (Vite, JS + CSS, HTML)
├── Cargo.toml              Workspace root
├── package.json            Workspace forwarding scripts
└── LICENSE (MIT)
```

## Getting Started

```bash
npm install
npm run build            # build frontend
cargo tauri dev          # run in development mode
```

**First run**: The app auto-registers a device fingerprint via miHoYo's API.
No manual setup required for device identification.

## Configuration

There are two ways to configure the app:

1. **Via the GUI** — Right-click anywhere or click the gear icon ⚙, fill in the form, and save.
2. **Via config file** — Place a `Mihoyo-env.json` in your **Downloads** directory or `~/.config/mihoyo-widget/env.json` (macOS/Linux) or `%APPDATA%/mihoyo-widget/env.json` (Windows):

```json
{
  "cookie": "your_full_mihoyo_cookie",
  "stoken": "your_stoken",
  "uid": "your_game_uid",
  "stuid": "your_account_stuid",
  "mid": "your_mid"
}
```

Runtime edits are saved to the OS-appropriate config directory:
- **Linux**: `~/.config/mihoyo-widget/runtime.json`
- **macOS**: `~/Library/Application Support/mihoyo-widget/runtime.json`
- **Windows**: `%APPDATA%/mihoyo-widget/runtime.json`

You can also set all values via environment variables: `MIHOYO_COOKIE`, `MIHOYO_STOKEN`, `MIHOYO_UID`, etc.

## Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| Linux (x86_64) | ✅ | Tested, full support |
| Windows (x86_64) | ✅ | CI-verified |
| macOS (Apple Silicon) | ✅ | CI-verified, native ARM build |
| macOS (Intel) | ⚠️ | Build on request via `cargo tauri build` |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri v2 (Rust), tray-icon, image-png |
| Backend | tokio async, reqwest, rusqlite (SQLite WAL) |
| Frontend | Vanilla JS, CSS custom properties (theming) |
| Auth | DS2 signing (X4 salt), device-fp registration |

## License

MIT
