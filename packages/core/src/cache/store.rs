use rusqlite::{Connection, params};
use std::path::PathBuf;

pub struct CacheDb {
    pub conn: Connection,
}

fn db_path(data_dir: &str) -> PathBuf {
    let base = if data_dir.is_empty() {
        dirs::data_dir()
    } else {
        Some(PathBuf::from(data_dir))
    };
    if let Some(base) = base {
        let p = base.join("mihoyo-widget").join("cache.db");
        if let Some(parent) = p.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        return p;
    }
    PathBuf::from("cache.db")
}

impl Default for CacheDb {
    fn default() -> Self {
        Self::open("").unwrap_or_else(|_| Self {
            conn: Connection::open_in_memory().unwrap(),
        })
    }
}

impl CacheDb {
    pub fn open(data_dir: &str) -> Result<Self, String> {
        let path = db_path(data_dir);
        let conn = Connection::open(&path).map_err(|e| e.to_string())?;
        // Performance: WAL mode for concurrent read/write from poller + IPC
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;").ok();
        Ok(Self { conn })
    }

    pub fn migrate(&self) -> Result<(), String> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS kv_cache (
                key TEXT PRIMARY KEY,
                json TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );"
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    // ── Generic kv_cache helpers ──

    pub fn kv_get(&self, key: &str) -> Option<(String, i64)> {
        self.conn.query_row(
            "SELECT json, created_at FROM kv_cache WHERE key = ?1",
            params![key],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
        ).ok()
    }

    pub fn kv_set(&self, key: &str, json: &str) {
        let now = chrono::Utc::now().timestamp();
        self.conn.execute(
            "INSERT OR REPLACE INTO kv_cache (key, json, created_at) VALUES (?1, ?2, ?3)",
            params![key, json, now],
        ).ok();
    }

    pub fn kv_delete(&self, key: &str) {
        self.conn.execute(
            "DELETE FROM kv_cache WHERE key = ?1",
            params![key],
        ).ok();
    }

    pub fn kv_is_expired(&self, key: &str, ttl_secs: i64) -> bool {
        let last: i64 = self.conn.query_row(
            "SELECT created_at FROM kv_cache WHERE key = ?1",
            params![key],
            |row| row.get(0),
        ).unwrap_or(0);
        let now = chrono::Utc::now().timestamp();
        now - last > ttl_secs
    }
}
