use crate::api::widget::WidgetData;
use chrono::{Datelike, Timelike};
use mihoyo_core::config::settings::NotificationConfig;

/// Check all notification rules and fire system notifications
pub fn check_rules(
    data: &WidgetData,
    old: Option<&WidgetData>,
    app: &tauri::AppHandle,
    config: &NotificationConfig,
) {
    // 1. Stamina notification
    if config.stamina_enabled && data.max_stamina > 0 {
        let pct = data.current_stamina as f64 / data.max_stamina as f64;
        if pct >= config.stamina_threshold_urgent {
            notify(app, "体力快满了", &format!("当前 {}/{}", data.current_stamina, data.max_stamina));
        } else if pct >= config.stamina_threshold_mild {
            if let Some(old) = old {
                let old_pct = old.current_stamina as f64 / old.max_stamina as f64;
                if old_pct < config.stamina_threshold_mild {
                    notify(app, &format!("体力超过{}%", (config.stamina_threshold_mild * 100.0) as u32), &format!("当前 {}/{}", data.current_stamina, data.max_stamina));
                }
            }
        }
    }

    // 2. Expeditions all completed
    if config.expedition_enabled
        && data.total_expedition_num > 0
        && data.accepted_expedition_num == 0
    {
        if let Some(old) = old {
            if old.accepted_expedition_num > 0 {
                notify(app, "派遣全部完成", "所有委托已返回");
            }
        }
    }

    // 3. Reserve stamina full
    if config.reserve_stamina_enabled && data.is_reserve_stamina_full {
        notify(app, "备用体力已满", "请及时使用");
    }

    // 4. Sign reminder — only fire after configured time
    if config.sign_reminder_enabled && !data.has_signed
        && is_time_reached(&config.sign_reminder_time) {
            if let Some(old) = old {
                if old.has_signed {
                    notify(app, "今日未签到", "星穹铁道今日还未签到");
                }
            }
        }

    // 5. Simulated universe not done this week — only fire after configured time
    if config.rogue_reminder_enabled
        && data.max_rogue_score > 0
        && data.current_rogue_score == 0
        && is_time_reached(&config.rogue_reminder_time) {
            if let Some(old) = old {
                if old.current_rogue_score > 0 {
                    notify(app, "模拟宇宙未打", "本周模拟宇宙积分还未获取");
                }
            }
        }
}

/// Check if current time has reached the given time specification.
///
/// Formats:
///   "20:00"       — daily, true if HH:MM has passed today
///   "Sun 20:00"   — weekly, true if today matches weekday and HH:MM has passed
fn is_time_reached(time_str: &str) -> bool {
    let now = chrono::Local::now();
    let parts: Vec<&str> = time_str.split_whitespace().collect();

    let (hour, minute) = match parts.len() {
        1 => {
            // "HH:MM" format
            let t = parts[0];
            let hm: Vec<&str> = t.split(':').collect();
            if hm.len() != 2 {
                return false;
            }
            (hm[0].parse::<u32>().unwrap_or(99), hm[1].parse::<u32>().unwrap_or(99))
        }
        2 => {
            // "EEE HH:MM" format — check weekday first
            let weekday = parts[0];
            let t = parts[1];
            let hm: Vec<&str> = t.split(':').collect();
            if hm.len() != 2 {
                return false;
            }
            let weekday_now = now.format("%a").to_string();
            if !weekday_now.eq_ignore_ascii_case(weekday) {
                return false;
            }
            (hm[0].parse::<u32>().unwrap_or(99), hm[1].parse::<u32>().unwrap_or(99))
        }
        _ => return false,
    };

    let current_minutes = now.hour() * 60 + now.minute();
    let target_minutes = hour * 60 + minute;
    current_minutes >= target_minutes
}

/// Daily summary digest. Call on each poller tick; internally deduplicates per day.
pub fn check_digest(data: &WidgetData, app: &tauri::AppHandle, config: &NotificationConfig) {
    if !config.digest_enabled || !is_time_reached(&config.digest_time) {
        return;
    }

    use std::sync::OnceLock;
    static LAST_DIGEST_DAY: OnceLock<std::sync::Mutex<u32>> = OnceLock::new();
    let today = chrono::Local::now().ordinal(); // day of year
    let lock = LAST_DIGEST_DAY.get_or_init(|| std::sync::Mutex::new(0));
    let mut last = lock.lock().unwrap();
    if *last == today {
        return; // already sent today
    }
    *last = today;

    let stamina_line = format!("体力 {}/{}", data.current_stamina, data.max_stamina);
    let expedition_line = if data.total_expedition_num > 0 {
        format!("| 派遣 {}/{}", data.accepted_expedition_num, data.total_expedition_num)
    } else {
        String::new()
    };
    let sign_line = if data.has_signed { "| 已签到" } else { "| 未签到" };

    let body = format!("{} {} {}", stamina_line, expedition_line, sign_line);
    notify(app, "Mihoyo Widget 每日摘要", &body);
}

fn notify(app: &tauri::AppHandle, title: &str, body: &str) {
    use tauri_plugin_notification::NotificationExt;
    if let Err(e) = app.notification().builder()
        .title(title)
        .body(body)
        .show()
    {
        log::error!("Notification error: {}", e);
    }
}
