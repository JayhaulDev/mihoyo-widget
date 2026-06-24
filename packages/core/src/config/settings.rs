use std::path::PathBuf;
use std::fs;

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct Settings {
    pub cookie: String,
    pub stoken: String,
    pub stuid: String,
    pub mid: String,
    pub device_id: String,
    pub device_fp: String,
    #[serde(default)]
    pub device_fp_updated: String,
    pub seed_id: String,
    pub seed_time: String,
    pub uid: String,
    pub region: String,
    pub poll_interval_secs: u64,
    #[serde(default)]
    pub notification: NotificationConfig,
    /// Base directory for runtime config, cache, and other data files.
    /// Empty string means use default (platform-specific config/cache dirs).
    #[serde(default)]
    pub data_dir: String,
    /// Whether the first-run onboarding wizard has been completed.
    #[serde(default)]
    pub first_run_done: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            cookie: String::new(),
            stoken: String::new(),
            stuid: String::new(),
            mid: String::new(),
            device_id: String::from("98003eca-c296-330c-80c5-a8e49d09390b"),
            device_fp: String::new(),
            device_fp_updated: String::new(),
            seed_id: String::new(),
            seed_time: String::new(),
            uid: String::new(),
            region: String::from("prod_gf_cn"),
            poll_interval_secs: 90,
            notification: NotificationConfig::default(),
            data_dir: String::new(),
            first_run_done: false,
        }
    }
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[serde(default)]
pub struct NotificationConfig {
    pub notification_mode: bool,
    pub stamina_enabled: bool,
    pub stamina_threshold_mild: f64,
    pub stamina_threshold_urgent: f64,
    pub expedition_enabled: bool,
    pub reserve_stamina_enabled: bool,
    pub sign_reminder_enabled: bool,
    pub sign_reminder_time: String,
    pub rogue_reminder_enabled: bool,
    pub rogue_reminder_time: String,
    pub digest_enabled: bool,
    pub digest_time: String,
}

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

/// Path to the deploy-time env file (Mihoyo-env.json)
fn env_path() -> PathBuf {
    if let Ok(p) = std::env::var("MIHOYO_ENV_PATH") {
        return PathBuf::from(p);
    }
    let candidates = vec![
        dirs::download_dir().map(|h| h.join("Mihoyo-env.json")),
        dirs::config_dir().map(|h| h.join("mihoyo-widget").join("env.json")),
    ];
    for c in candidates {
        if let Some(p) = c {
            if p.exists() {
                return p;
            }
        }
    }
    PathBuf::from("Mihoyo-env.json")
}

/// Path to the writable runtime config (settings panel saves here).
/// If data_dir is set, config lives inside that directory; otherwise
/// the platform-default config directory is used.
fn runtime_config_path(data_dir: &str) -> PathBuf {
    let base = if data_dir.is_empty() {
        dirs::config_dir()
    } else {
        Some(PathBuf::from(data_dir))
    };
    if let Some(base) = base {
        let p = base.join("mihoyo-widget").join("runtime.json");
        if let Some(parent) = p.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        return p;
    }
    PathBuf::from("runtime.json")
}

impl Settings {
    pub fn load() -> Option<Self> {
        // Priority: runtime.json (default path) > runtime.json (custom data_dir) >
        //           Mihoyo-env.json > env vars
        let (rt_path, loaded) = {
            let path = runtime_config_path("");
            if path.exists() {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(s) = serde_json::from_str::<Self>(&content) {
                        (Some(path), Some(s))
                    } else {
                        (Some(path), None)
                    }
                } else {
                    (Some(path), None)
                }
            } else {
                (None, None)
            }
        };

        // If loaded settings specify a custom data_dir, try that path too
        // (custom path wins over default path)
        if let Some(ref s) = loaded {
            if !s.data_dir.is_empty() {
                let custom_path = runtime_config_path(&s.data_dir);
                if custom_path.exists() {
                    if let Ok(content) = fs::read_to_string(&custom_path) {
                        if let Ok(custom) = serde_json::from_str::<Self>(&content) {
                            log::info!("Loaded config from {:?} (custom data_dir)", custom_path);
                            return Some(custom);
                        }
                    }
                }
            }
        }

        if let Some(s) = loaded {
            log::info!("Loaded config from {:?}", rt_path.unwrap());
            return Some(s);
        }

        let path = env_path();
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                    let s = Self::from_json(&json);
                    log::info!("Loaded config from {:?}", path);
                    return Some(s);
                }
            }
        }

        let s = Self::from_env();
        if !s.cookie.is_empty() {
            return Some(s);
        }
        None
    }

    /// Save settings to runtime config file (overwrites)
    pub fn save_to_runtime(&self) -> Result<(), String> {
        let path = runtime_config_path(&self.data_dir);
        let json = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create config dir: {}", e))?;
        }
        fs::write(&path, &json).map_err(|e| format!("Failed to write config: {}", e))?;
        log::info!("Saved config to {:?}", path);
        Ok(())
    }

    fn from_json(json: &serde_json::Value) -> Self {
        Self {
            cookie: json.get("cookie").or_else(|| json.get("MIHOYO_COOKIE")).and_then(|v| v.as_str()).unwrap_or("").to_string(),
            stoken: json.get("stoken").or_else(|| json.get("MIHOYO_STOKEN")).and_then(|v| v.as_str()).unwrap_or("").to_string(),
            stuid: json.get("stuid").or_else(|| json.get("MIHOYO_STUID")).and_then(|v| v.as_str()).unwrap_or("").to_string(),
            mid: json.get("mid").or_else(|| json.get("MIHOYO_MID")).and_then(|v| v.as_str()).unwrap_or("").to_string(),
            device_id: json.get("device_id").or_else(|| json.get("MIHOYO_DEVICE_ID")).and_then(|v| v.as_str()).unwrap_or("98003eca-c296-330c-80c5-a8e49d09390b").to_string(),
            device_fp: json.get("device_fp").or_else(|| json.get("MIHOYO_DEVICE_FP")).and_then(|v| v.as_str()).unwrap_or("").to_string(),
            device_fp_updated: json.get("device_fp_updated").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            seed_id: json.get("seed_id").or_else(|| json.get("DEVICEFP_SEED_ID")).and_then(|v| v.as_str()).unwrap_or("").to_string(),
            seed_time: json.get("seed_time").or_else(|| json.get("DEVICEFP_SEED_TIME")).and_then(|v| v.as_str()).unwrap_or("").to_string(),
            uid: json.get("uid").or_else(|| json.get("MIHOYO_UID")).and_then(|v| v.as_str()).unwrap_or("").to_string(),
            region: json.get("region").or_else(|| json.get("MIHOYO_REGION")).and_then(|v| v.as_str()).unwrap_or("prod_gf_cn").to_string(),
            poll_interval_secs: json.get("poll_interval_secs").or_else(|| json.get("POLL_INTERVAL")).and_then(|v| v.as_u64()).unwrap_or(90),
            notification: json.get("notification").map(|v| serde_json::from_value(v.clone()).unwrap_or_default()).unwrap_or_default(),
            data_dir: json.get("data_dir").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            first_run_done: json.get("first_run_done").and_then(|v| v.as_bool()).unwrap_or(true),
        }
    }

    fn from_env() -> Self {
        Self {
            cookie: std::env::var("MIHOYO_COOKIE").unwrap_or_default(),
            stoken: std::env::var("MIHOYO_STOKEN").unwrap_or_default(),
            stuid: std::env::var("MIHOYO_STUID").unwrap_or_default(),
            mid: std::env::var("MIHOYO_MID").unwrap_or_default(),
            device_id: std::env::var("MIHOYO_DEVICE_ID").unwrap_or_default(),
            device_fp: std::env::var("MIHOYO_DEVICE_FP").unwrap_or_default(),
            device_fp_updated: String::new(),
            seed_id: std::env::var("DEVICEFP_SEED_ID").unwrap_or_default(),
            seed_time: std::env::var("DEVICEFP_SEED_TIME").unwrap_or_default(),
            uid: std::env::var("MIHOYO_UID").unwrap_or_default(),
            region: std::env::var("MIHOYO_REGION").unwrap_or_else(|_| "prod_gf_cn".into()),
            poll_interval_secs: std::env::var("POLL_INTERVAL").ok().and_then(|v| v.parse().ok()).unwrap_or(90),
            // notification 字段由 runtime.json 或默认值决定，环境变量不覆盖
            notification: NotificationConfig::default(),
            data_dir: String::new(),
            first_run_done: false,
        }
    }

    pub fn stoken_cookie(&self) -> String {
        if self.mid.is_empty() {
            format!("stuid={};stoken={}", self.stuid, self.stoken)
        } else {
            format!("stuid={};stoken={};mid={}", self.stuid, self.stoken, self.mid)
        }
    }
}
