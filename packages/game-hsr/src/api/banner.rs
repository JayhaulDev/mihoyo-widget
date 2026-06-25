use crate::api::challenge::de_mihoyo_date;

#[derive(Debug, Clone, serde::Serialize)]
#[derive(Default)]
pub struct BannerData {
    pub card_pools: Vec<ActInfo>,
    pub events: Vec<ActInfo>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ActInfo {
    pub name: String,
    #[serde(rename = "type")]
    pub act_type: String,
    pub begin_time: String,
    pub end_time: String,
    #[serde(default)]
    pub date_range: String,
    #[serde(default)]
    pub days_left: i64,
    /// Activity status: 进行中 / 未开始 / 已结束 / ''
    #[serde(default)]
    pub act_status: String,
    /// Progress fields from API
    #[serde(default)]
    pub total_progress: i64,
    #[serde(default)]
    pub current_progress: i64,
    /// Panel description for activities
    #[serde(default)]
    pub panel_desc: String,
}

// ── BannerData backwards-compat deserialize ──
impl<'de> serde::Deserialize<'de> for BannerData {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(serde::Deserialize)]
        struct BannerDataOld {
            #[serde(default, rename = "act_list")]
            act_list: Vec<ActInfo>,
            #[serde(default)]
            card_pools: Vec<ActInfo>,
            #[serde(default)]
            events: Vec<ActInfo>,
        }
        let old = BannerDataOld::deserialize(deserializer)?;
        if !old.act_list.is_empty() && old.card_pools.is_empty() && old.events.is_empty() {
            let mut card_pools = Vec::new();
            let mut events = Vec::new();
            for act in old.act_list {
                if act.act_type == "活动" {
                    events.push(act);
                } else {
                    card_pools.push(act);
                }
            }
            return Ok(BannerData { card_pools, events });
        }
        Ok(BannerData { card_pools: old.card_pools, events: old.events })
    }
}


// ── Raw API types ──

/// Time info object from API: `time_info { start_time, end_time, ... }`
#[derive(serde::Deserialize)]
struct TimeInfo {
    #[serde(default, deserialize_with = "de_mihoyo_date")]
    start_time: String,
    #[serde(default, deserialize_with = "de_mihoyo_date")]
    end_time: String,
}

#[derive(serde::Deserialize)]
pub(crate) struct ActCalenderData {
    #[serde(default)]
    pub avatar_card_pool_list: Vec<CardPool>,
    #[serde(default)]
    pub equip_card_pool_list: Vec<CardPool>,
    #[serde(default)]
    pub act_list: Vec<RawAct>,
    #[allow(dead_code)]
    pub now: String,
}

#[derive(serde::Deserialize)]
pub(crate) struct CardPool {
    pub name: String,
    #[serde(default)]
    #[allow(dead_code)]
    pub r#type: String,
    #[serde(default)]
    time_info: Option<TimeInfo>,
}

#[derive(serde::Deserialize)]
pub(crate) struct RawAct {
    pub name: String,
    #[serde(default)]
    pub act_type: String,
    #[serde(default)]
    act_status: String,
    #[serde(default)]
    time_info: Option<TimeInfo>,
    #[serde(default)]
    total_progress: i64,
    #[serde(default)]
    current_progress: i64,
    #[serde(default)]
    panel_desc: String,
}

// ── Convert ──

fn get_time(ti: &Option<TimeInfo>) -> (String, String) {
    match ti {
        Some(t) => (t.start_time.clone(), t.end_time.clone()),
        None => (String::new(), String::new()),
    }
}

pub(crate) fn convert_to_banner_data(raw: ActCalenderData) -> BannerData {
    let mut card_pools: Vec<ActInfo> = Vec::new();

    for pool in &raw.avatar_card_pool_list {
        let (begin, end) = get_time(&pool.time_info);
        let days_left = days_until(&end);
        card_pools.push(ActInfo {
            name: pool.name.clone(),
            act_type: "角色".into(),
            begin_time: begin.clone(),
            end_time: end.clone(),
            date_range: make_range(&begin, &end),
            days_left,
            act_status: String::new(),
            total_progress: 0,
            current_progress: 0,
            panel_desc: String::new(),
        });
    }
    for pool in &raw.equip_card_pool_list {
        let (begin, end) = get_time(&pool.time_info);
        let days_left = days_until(&end);
        card_pools.push(ActInfo {
            name: pool.name.clone(),
            act_type: "光锥".into(),
            begin_time: begin.clone(),
            end_time: end.clone(),
            date_range: make_range(&begin, &end),
            days_left,
            act_status: String::new(),
            total_progress: 0,
            current_progress: 0,
            panel_desc: String::new(),
        });
    }

    let mut events: Vec<ActInfo> = Vec::new();
    for act in &raw.act_list {
        let (begin, end) = get_time(&act.time_info);
        let days_left = days_until(&end);
        let label = act_type_label(&act.act_type);
        let status = act_status_label(&act.act_status);
        events.push(ActInfo {
            name: act.name.clone(),
            act_type: label,
            begin_time: begin.clone(),
            end_time: end.clone(),
            date_range: make_range(&begin, &end),
            days_left,
            act_status: status,
            total_progress: act.total_progress,
            current_progress: act.current_progress,
            panel_desc: act.panel_desc.clone(),
        });
    }

    events.sort_by(|a, b| a.end_time.cmp(&b.end_time));

    BannerData { card_pools, events }
}

/// Map raw act_type to display label
fn act_type_label(raw: &str) -> String {
    match raw {
        "ActivityTypeDouble" => "双倍".into(),
        "ActivityTypeSign" => "签到".into(),
        _ => "活动".into(),
    }
}

/// Map act_status to Chinese
fn act_status_label(raw: &str) -> String {
    match raw {
        s if s.contains("Progress") || s.contains("UnFinish") => "进行中".into(),
        s if s.contains("Unopened") => "未开始".into(),
        s if s.contains("Finish") => "已完成".into(),
        _ => String::new(),
    }
}

fn parse_date(s: &str) -> i64 {
    if s.len() < 16 { return 0; }
    let y = s[0..4].parse::<i64>().unwrap_or(0);
    let m = s[5..7].parse::<i64>().unwrap_or(0);
    let d = s[8..10].parse::<i64>().unwrap_or(0);
    let hh = s[11..13].parse::<i64>().unwrap_or(0);
    let mm = s[14..16].parse::<i64>().unwrap_or(0);
    use chrono::NaiveDate;
    NaiveDate::from_ymd_opt(y as i32, m as u32, d as u32)
        .and_then(|dt| dt.and_hms_opt(hh as u32, mm as u32, 0))
        .map(|dt| dt.and_utc().timestamp())
        .unwrap_or(0)
}

fn fmt_md(s: &str) -> String {
    if s.len() < 10 { return String::new(); }
    let m = s[5..7].trim_start_matches('0');
    let d = s[8..10].trim_start_matches('0');
    format!("{}/{}", m, d)
}

fn days_until(end: &str) -> i64 {
    let ts = parse_date(end);
    if ts == 0 { return -1; }
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64;
    let diff = ts - now;
    if diff <= 0 { 0 } else { (diff + 86399) / 86400 }
}

fn make_range(begin: &str, end: &str) -> String {
    let b = fmt_md(begin);
    let e = fmt_md(end);
    if b.is_empty() && e.is_empty() { String::new() }
    else if b.is_empty() { format!("至{}", e) }
    else if e.is_empty() { format!("{}起", b) }
    else { format!("{} - {}", b, e) }
}
