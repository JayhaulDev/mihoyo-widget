use crate::api::challenge::de_mihoyo_date;

/// Challenge Peak (最高挑战) — endgame PvE mode
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PeakData {
    pub has_data: bool,
    pub boss_name: String,
    pub cur_floor: i64,
    pub max_floor: i64,
    pub begin_time: String,
    pub end_time: String,
    pub status: String,
}

// Raw: { data: { challenge_peak_records: [{ group: {...}, boss_info: {...}, current_max_floor: N }] } }
#[derive(serde::Deserialize)]
pub(crate) struct PeakRaw {
    #[serde(default)]
    pub challenge_peak_records: Vec<PeakRecord>,
}

#[derive(serde::Deserialize)]
#[serde(default)]
#[derive(Default)]
pub(crate) struct PeakRecord {
    pub group: PeakGroup,
    pub boss_info: PeakBoss,
    pub current_max_floor: i64,
}


#[derive(serde::Deserialize, Default)]
#[serde(default)]
pub(crate) struct PeakGroup {
    pub status: String,
    pub name_mi18n: String,
    #[serde(deserialize_with = "de_mihoyo_date")]
    pub begin_time: String,
    #[serde(deserialize_with = "de_mihoyo_date")]
    pub end_time: String,
}

#[derive(serde::Deserialize, Default)]
#[serde(default)]
pub(crate) struct PeakBoss {
    pub name_mi18n: String,
}

impl From<PeakRaw> for PeakData {
    fn from(raw: PeakRaw) -> Self {
        raw.challenge_peak_records
            .into_iter()
            .next()
            .map(|r| PeakData {
                has_data: true,
                boss_name: r.boss_info.name_mi18n,
                cur_floor: r.current_max_floor,
                max_floor: 12, // HSR 最高挑战通常12层
                begin_time: r.group.begin_time,
                end_time: r.group.end_time,
                status: r.group.status,
            })
            .unwrap_or_else(|| PeakData {
                has_data: false,
                boss_name: String::new(),
                cur_floor: 0,
                max_floor: 0,
                begin_time: String::new(),
                end_time: String::new(),
                status: String::new(),
            })
    }
}
