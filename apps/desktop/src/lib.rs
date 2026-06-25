use game_hsr::api::client::HsrApiClient;
use game_hsr::api::{WidgetData, PlayerInfo, RogueArchive};
use game_hsr::api::cache::{AllCachedData, HsrCache};
use game_hsr::notify::{check_rules, check_digest};
use mihoyo_core::cache::CacheDb;
use mihoyo_core::config::Settings;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex;

const POLL_INTERVAL_SECS: u64 = 90;
const MAX_BACKOFF_SECS: u64 = 900;

pub struct AppState {
    pub config_data: Mutex<Settings>,
    pub cache_data: Mutex<CacheDb>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct WelcomeStatus {
    pub needs_onboarding: bool,
    pub is_welcoming: bool,
}

// ── Sync commands ──

#[tauri::command]
fn get_all_cached(state: State<AppState>) -> AllCachedData {
    state.cache_data.blocking_lock().get_all_cached()
}

#[tauri::command]
fn get_widget_data(state: State<AppState>) -> Result<WidgetData, String> {
    state.cache_data.blocking_lock().get_latest().ok_or_else(|| "No data yet".into())
}

#[tauri::command]
fn get_player_info(state: State<AppState>) -> Result<PlayerInfo, String> {
    state.cache_data.blocking_lock().get_player_info().ok_or_else(|| "No player info yet".into())
}

#[tauri::command]
fn get_sign_status(state: State<AppState>) -> Result<serde_json::Value, String> {
    let cache = state.cache_data.blocking_lock();
    Ok(serde_json::json!({
        "has_signed": cache.has_signed_today(),
        "last_check": cache.last_check_time()
    }))
}

#[tauri::command]
fn load_env_config(state: State<AppState>) -> Result<Settings, String> {
    Ok(state.config_data.blocking_lock().clone())
}

#[tauri::command]
fn check_first_run(state: State<AppState>) -> Result<WelcomeStatus, String> {
    let config = state.config_data.blocking_lock();
    let needs_onboarding = !config.first_run_done;
    Ok(WelcomeStatus {
        needs_onboarding,
        is_welcoming: needs_onboarding,
    })
}

#[tauri::command]
fn complete_first_run(state: State<AppState>) -> Result<String, String> {
    let mut config = state.config_data.blocking_lock();
    config.first_run_done = true;
    config.save_to_runtime()?;
    Ok("ok".into())
}

#[tauri::command]
fn get_data_dir(state: State<AppState>) -> Result<String, String> {
    let config = state.config_data.blocking_lock();
    Ok(config.data_dir.clone())
}

#[tauri::command]
fn set_data_dir(state: State<AppState>, data_dir: String) -> Result<String, String> {
    {
        let mut config = state.config_data.blocking_lock();
        config.data_dir = data_dir;
        config.save_to_runtime()?;
    }
    Ok("ok".into())
}

// ── Async commands ──

#[tauri::command]
async fn force_refresh(state: State<'_, AppState>, app: AppHandle) -> Result<String, String> {
    let settings = state.config_data.lock().await.clone();
    let client = HsrApiClient::new(settings);

    let (widget_res, player_res, ledger_res, banner_res, fh_res, pf_res, as_res,
          periodic_res, peak_res, nous_res, magic_res, locust_res) = tokio::join!(
        client.get_note(),
        client.get_player_index(),
        client.get_ledger(),
        client.get_banners(),
        client.get_forgotten_hall(),
        client.get_pure_fiction(),
        client.get_apocalyptic_shadow(),
        client.get_periodic_act(),
        client.get_challenge_peak(),
        client.get_rogue_nous(),
        client.get_rogue_magic(),
        client.get_rogue_locust(),
    );

    let widget_data = widget_res.map_err(|e| format!("Widget refresh failed: {}", e))?;
    let player_data = player_res.ok();

    let rogue_archive = {
        let mut arch = RogueArchive::default();
        if let Ok(n) = &nous_res { arch = arch.merge(RogueArchive::from(n.clone())); }
        if let Ok(m) = &magic_res { arch = arch.merge(RogueArchive::from(m.clone())); }
        if let Ok(l) = &locust_res { arch = arch.merge(RogueArchive::from(l.clone())); }
        if arch.nous_progress.is_empty() && arch.magic_linear.is_empty() && arch.locust_narrow == 0 {
            None
        } else {
            Some(arch)
        }
    };

    {
        let cache = state.cache_data.lock().await;
        cache.save_widget(&widget_data);
        if let Some(ref p) = player_data { cache.save_player_info(p); }
        if let Ok(ref l) = ledger_res { cache.save_ledger(l); }
        if let Ok(ref b) = banner_res { cache.save_banners(b); }
        if let (Ok(ref fh), Ok(ref pf), Ok(ref as_)) = (&fh_res, &pf_res, &as_res) {
            cache.save_challenges(fh, pf, as_);
        }
        if let Ok(ref p) = periodic_res { cache.save_periodic_act(p); }
        if let Ok(ref p) = peak_res { cache.save_peak(p); }
        if let Some(ref a) = rogue_archive { cache.save_rogue_archive(a); }
        let old = cache.get_latest();
        drop(cache);

        if let Some(ref old_data) = old {
            let state = app.state::<AppState>();
            let config = state.config_data.lock().await.notification.clone();
            drop(state);
            check_rules(&widget_data, Some(old_data), &app, &config);
        }
    }

    app.emit(
        "data-updated",
        serde_json::json!({
            "widget": &widget_data,
            "player": player_data,
            "ledger": ledger_res.ok(),
            "banners": banner_res.ok(),
            "forgotten_hall": fh_res.ok(),
            "pure_fiction": pf_res.ok(),
            "apocalyptic_shadow": as_res.ok(),
            "periodic_act": periodic_res.ok(),
            "challenge_peak": peak_res.ok(),
            "rogue_archive": rogue_archive,
        }),
    ).map_err(|e| e.to_string())?;

    Ok("ok".into())
}

#[tauri::command]
async fn save_config(
    state: State<'_, AppState>,
    _app: AppHandle,
    new_config: Settings,
) -> Result<String, String> {
    new_config.save_to_runtime()?;
    *state.config_data.lock().await = new_config;
    Ok("ok".into())
}

#[tauri::command]
async fn pick_data_dir(app: AppHandle) -> Result<String, String> {
    use tauri_plugin_dialog::DialogExt;

    let file = app.dialog()
        .file()
        .blocking_pick_folder();

    match file {
        Some(path) => Ok(path.to_string()),
        None => Err("No directory selected".into()),
    }
}

fn build_capture_html() -> String {
    format!(
        r#"<html><meta charset="utf-8"><body><script>
(function(){{
    var c = document.cookie.split(';').map(function(x){{return x.trim();}});
    var o = {{}};
    c.forEach(function(x){{var e=x.indexOf('=');if(e>0)o[x.slice(0,e).trim()]=x.slice(e+1);}});
    var stoken='', stuid='', mid='';
    try{{stoken=window.localStorage.getItem('stoken')||o['stoken']||'';}}catch(e){{}}
    try{{stuid=window.localStorage.getItem('stuid')||o['stuid']||'';}}catch(e){{}}
    try{{mid=window.localStorage.getItem('mid')||o['mid']||'';}}catch(e){{}}
    var uid=o['login_uid']||o['ltuid']||stuid||'';
    window.__TAURI_INTERNALS__.invoke('_on_captured_cookies',{{
        cookie:document.cookie, stoken:stoken, stuid:stuid, mid:mid, uid:uid
    }});
    window.__TAURI_INTERNALS__.invoke('close_login_window');
}})();
</script></body></html>"#
    )
}

const LOGIN_INJECT_JS: &str = r#"
(function(){
    var id = '__mhy_toolbar';
    var old = document.getElementById(id);
    if (old) { old.remove(); }

    var tb = document.createElement('div');
    tb.id = id;
    tb.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:999999;display:flex;gap:8px;padding:6px 16px;background:rgba(0,0,0,0.65);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-radius:22px;color:#fff;font-size:13px;font-family:-apple-system,sans-serif;box-shadow:0 2px 12px rgba(0,0,0,0.3);white-space:nowrap;';

    var closeBtn = document.createElement('span');
    closeBtn.textContent = '✕ 关闭';
    closeBtn.style.cssText = 'padding:4px 14px;cursor:pointer;opacity:0.85;';
    closeBtn.onclick = function(){ location.href = 'mhywidget://close'; };

    var capBtn = document.createElement('span');
    capBtn.textContent = '✓ 获取Cookie并关闭';
    capBtn.style.cssText = 'padding:4px 14px;cursor:pointer;font-weight:600;background:rgba(255,255,255,0.15);border-radius:16px;';
    capBtn.onclick = function(){ location.href = 'mhywidget://capture'; };

    tb.appendChild(closeBtn);
    tb.appendChild(capBtn);
    document.body.appendChild(tb);

    document.addEventListener('keydown', function __mhy_esc(e){
        if(e.key === 'Escape'){ location.href = 'mhywidget://close'; }
    });
})();
"#;

#[tauri::command]
async fn open_login_webview(app: AppHandle) -> Result<String, String> {
    use std::str::FromStr;
    let url = tauri::Url::from_str("https://user.mihoyo.com/").map_err(|e| e.to_string())?;

    if let Some(w) = app.get_webview_window("login-window") {
        let _ = w.set_focus();
        return Ok("already_open".into());
    }

    let capture_html = build_capture_html();
    let app2 = app.clone();

    let _ = tauri::WebviewWindowBuilder::new(
        &app,
        "login-window",
        tauri::WebviewUrl::External(url),
    )
    .title("米游社登录")
    .inner_size(360.0, 560.0)
    .center()
    .decorations(false)
    .resizable(false)
    .on_page_load(move |webview_win, payload| {
        if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
            if let Err(e) = webview_win.eval(LOGIN_INJECT_JS) {
                log::warn!("login toolbar inject failed: {}", e);
            }
        }
    })
    .on_navigation(move |nav_url| {
        match nav_url.scheme() {
            "mhywidget" => match nav_url.host_str() {
                Some("close") => {
                    let _ = app2.get_webview_window("login-window").map(|w| w.close());
                    let _ = app2.emit("login-window-closed", ());
                    false
                }
                Some("capture") => {
                    if let Some(w) = app2.get_webview_window("login-window") {
                        let data_url = tauri::Url::parse(&format!("data:text/html,{}", capture_html)).unwrap();
                        let _ = w.navigate(data_url);
                    }
                    false
                }
                _ => true,
            },
            _ => true,
        }
    })
    .build()
    .map_err(|e| e.to_string())?;

    if let Some(w) = app.get_webview_window("login-window") {
        let _ = w.set_focus();
    }

    Ok("opened".into())
}

#[tauri::command]
async fn close_login_window(app: AppHandle) -> Result<String, String> {
    if let Some(w) = app.get_webview_window("login-window") {
        let _ = w.close();
        let _ = app.emit("login-window-closed", ());
        Ok("closed".into())
    } else {
        Err("Login window not found".into())
    }
}

/// Called from the main window when user clicks "capture cookies".
/// Injects JS into the login window to read cookies/localStorage,
/// then pipes the result back via the `_on_captured_cookies` command.
///
/// SAFETY: eval() is used to extract user's own cookies from a webview
/// they logged into — no external untrusted input is evaluated.
#[tauri::command]
async fn capture_login_cookies(app: AppHandle) -> Result<String, String> {
    let webview = app.get_webview_window("login-window")
        .ok_or_else(|| "Login window not found. Open the login page first.".to_string())?;

    // Injected JS reads cookies and calls back via __TAURI_INTERNALS__.invoke
    // which is available in all Tauri webviews including external URLs.
    let js = r#"
        (function() {
            try {
                var cookies = document.cookie.split(';').map(function(c) { return c.trim(); });
                var cookieObj = {};
                cookies.forEach(function(c) {
                    var eq = c.indexOf('=');
                    if (eq > 0) cookieObj[c.slice(0, eq).trim()] = c.slice(eq + 1);
                });
                var stoken = '', stuid = '', mid = '';
                try {
                    stoken = window.localStorage.getItem('stoken') || cookieObj['stoken'] || '';
                    stuid = window.localStorage.getItem('stuid') || cookieObj['stuid'] || '';
                    mid = window.localStorage.getItem('mid') || cookieObj['mid'] || '';
                } catch(e) {}
                window.__TAURI_INTERNALS__.invoke('_on_captured_cookies', {
                    cookie: document.cookie,
                    stoken: stoken,
                    stuid: stuid,
                    mid: mid,
                    uid: cookieObj['login_uid'] || cookieObj['ltuid'] || stuid || ''
                });
            } catch(e) {
                console.error('capture error', e);
            }
        })();
    "#;

    let _ = webview.eval(js);
    // Close the login window — the captured data will arrive via
    // the _on_captured_cookies command handler.
    let _ = webview.close();
    let _ = app.emit("login-window-closed", ());

    Ok("capturing".into())
}

#[tauri::command]
fn _on_captured_cookies(app: AppHandle, cookie: String, stoken: String, stuid: String, mid: String, uid: String) {
    let _ = app.emit("login-cookies-captured", serde_json::json!({
        "cookie": cookie,
        "stoken": stoken,
        "stuid": stuid,
        "mid": mid,
        "uid": uid,
    }));
}

fn rebuild_tray_menu(app: &tauri::AppHandle, notif_mode: bool) {
    let menu = {
        let m = tauri::menu::MenuBuilder::new(app)
            .item(&tauri::menu::MenuItemBuilder::with_id("show", "显示/隐藏窗口")
                .accelerator("CmdOrCtrl+Shift+H").build(app).unwrap())
            .item(&tauri::menu::MenuItemBuilder::with_id("refresh", "刷新数据")
                .build(app).unwrap())
            .separator()
            .item(&tauri::menu::MenuItemBuilder::with_id("show-welcome", "欢迎引导")
                .build(app).unwrap())
            .separator();
        let m = if notif_mode {
            m.item(&tauri::menu::MenuItemBuilder::with_id("toggle-notification-mode", "✓ 切换到窗口模式")
                .build(app).unwrap())
        } else {
            m.item(&tauri::menu::MenuItemBuilder::with_id("toggle-notification-mode", "切换到通知模式")
                .build(app).unwrap())
        };
        let m = m.separator();
        let m = m.item(&tauri::menu::MenuItemBuilder::with_id("quit", "退出")
                .accelerator("CmdOrCtrl+Q").build(app).unwrap());
        m.build().unwrap()
    };

    // Update tray menu
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_menu(Some(menu));
    }
}

fn handle_tray_menu(app: &tauri::AppHandle, event: tauri::menu::MenuEvent) {
    let id = event.id();
    let window = app.get_webview_window("main");
    match id.as_ref() {
        "show" => {
            if let Some(w) = window {
                if w.is_visible().unwrap_or(false) {
                    let _ = w.hide();
                } else {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        }
        "refresh" => {
            if let Some(w) = window {
                let _ = w.emit("manual-refresh", ());
            }
        }
        "show-welcome" => {
            // Emit event to frontend to show welcome overlay
            let _ = app.emit("show-welcome", ());
        }
        "toggle-notification-mode" => {
            let state = app.state::<AppState>();
            let mut settings = state.config_data.blocking_lock();
            let new_mode = !settings.notification.notification_mode;
            settings.notification.notification_mode = new_mode;
            let _ = settings.save_to_runtime();
            drop(settings);
            drop(state);

            let window = app.get_webview_window("main");
            if new_mode {
                if let Some(w) = window {
                    let _ = w.hide();
                }
            } else {
                if let Some(w) = window {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
                let state = app.state::<AppState>();
                let cache = state.cache_data.blocking_lock();
                let all = cache.get_all_cached();
                drop(cache);
                drop(state);
                let _ = app.emit("data-updated", serde_json::json!({
                    "widget": all.widget,
                    "player": all.player,
                    "ledger": all.ledger,
                    "banners": all.banners,
                    "forgotten_hall": all.forgotten_hall,
                    "pure_fiction": all.pure_fiction,
                    "apocalyptic_shadow": all.apocalyptic_shadow,
                    "periodic_act": all.periodic_act,
                    "challenge_peak": all.challenge_peak,
                    "rogue_archive": all.rogue_archive,
                }));
            }

            rebuild_tray_menu(app, new_mode);
        }
        "quit" => {
            app.exit(0);
        }
        _ => {}
    }
}

pub fn run() {
    let mut settings = Settings::load().unwrap_or_default();
    let cache = CacheDb::open(&settings.data_dir).unwrap_or_default();
    cache.migrate().ok();

    if settings.device_fp.is_empty() {
        let client = HsrApiClient::new(settings.clone());
        let rt = tokio::runtime::Runtime::new().unwrap();
        match rt.block_on(client.register_device_fp()) {
            Ok(fp) => {
                log::info!("Registered device fp: {}", fp);
                settings.device_fp = fp;
                settings.save_to_runtime().ok();
            }
            Err(e) => log::warn!("Device FP registration failed: {}", e),
        }
    }

    // Build tray icon (widget always has a system tray entry)
    // NOTE: moved into .setup() because MenuBuilder needs AppHandle

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            config_data: Mutex::new(settings.clone()),
            cache_data: Mutex::new(cache),
        })
        .invoke_handler(tauri::generate_handler![
            get_all_cached,
            get_widget_data,
            get_player_info,
            get_sign_status,
            force_refresh,
            load_env_config,
            save_config,
            check_first_run,
            complete_first_run,
            get_data_dir,
            set_data_dir,
            pick_data_dir,
            open_login_webview,
            close_login_window,
            capture_login_cookies,
            _on_captured_cookies,
        ])
        .setup(|app| {
            // Build system tray — menu set by rebuild_tray_menu after config loads
            let icon_bytes = include_bytes!("../icons/icon.png");
            let icon = tauri::image::Image::from_bytes(icon_bytes).ok();
            let mut builder = tauri::tray::TrayIconBuilder::with_id("main")
                .tooltip("Mihoyo Widget")
                .show_menu_on_left_click(false)
                .on_menu_event(handle_tray_menu);
            if let Some(img) = icon {
                builder = builder.icon(img);
            }
            #[cfg(target_os = "macos")]
            {
                builder = builder.icon_as_template(true);
            }
            let _ = builder.build(app);

            // Get notification_mode and rebuild tray menu accordingly
            let notif_mode = {
                let state = app.state::<AppState>();
                let guard = state.config_data.blocking_lock();
                let m = guard.notification.notification_mode;
                drop(guard);
                m
            };

            rebuild_tray_menu(app.handle(), notif_mode);

            // Hide window on startup if notification mode is active
            if notif_mode {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let all = {
                let state = app.state::<AppState>();
                let cache = state.cache_data.blocking_lock();
                let r = cache.get_all_cached();
                drop(cache);
                r
            };
            let _ = app.emit("data-updated", serde_json::json!({
                "widget": all.widget,
                "player": all.player,
                "ledger": all.ledger,
                "banners": all.banners,
                "forgotten_hall": all.forgotten_hall,
                "pure_fiction": all.pure_fiction,
                "apocalyptic_shadow": all.apocalyptic_shadow,
                "periodic_act": all.periodic_act,
                "challenge_peak": all.challenge_peak,
                "rogue_archive": all.rogue_archive,
            }));

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                run_poller(handle).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn run_poller(app: AppHandle) {
    tokio::time::sleep(std::time::Duration::from_secs(3)).await;
    let mut backoff: u64 = POLL_INTERVAL_SECS;

    loop {
        let settings = {
            let state = app.state::<AppState>();
            let guard = state.config_data.lock().await;
            guard.clone()
        };

        if settings.cookie.is_empty() {
            tokio::time::sleep(std::time::Duration::from_secs(120)).await;
            continue;
        }

        let client = HsrApiClient::new(settings);

        match client.get_note().await {
            Ok(data) => {
                backoff = POLL_INTERVAL_SECS;
                let mut player_updated = None;
                let mut ledger_updated = None;
                let mut banners_updated = None;
                let mut fh_updated = None;
                let mut pf_updated = None;
                let mut as_updated = None;
                let mut periodic_updated = None;
                let mut peak_updated = None;
                let mut rogue_updated = None;

                {
                    let state = app.state::<AppState>();
                    let cache = state.cache_data.lock().await;
                    cache.save_widget(&data);
                    let old = cache.get_latest();
                    drop(cache);

                    if let Some(ref old_data) = old {
                        let state = app.state::<AppState>();
                        let config = state.config_data.lock().await.notification.clone();
                        drop(state);
                        check_rules(&data, Some(old_data), &app, &config);
                        check_digest(&data, &app, &config);
                    } else {
                        // No old data — can only send digest (no diff-based rules)
                        let state = app.state::<AppState>();
                        let config = state.config_data.lock().await.notification.clone();
                        drop(state);
                        check_digest(&data, &app, &config);
                    }
                }

                let (need_player, need_ledger, need_banners, need_challenge) = {
                    let state = app.state::<AppState>();
                    let cache = state.cache_data.lock().await;
                    let r = (
                        cache.should_refresh_player(),
                        cache.ledger_expired(),
                        cache.banners_expired(),
                        cache.challenge_expired(),
                    );
                    drop(cache);
                    drop(state);
                    r
                };

                if need_player {
                    let state = app.state::<AppState>();
                    let settings = state.config_data.lock().await.clone();
                    drop(state);
                    let client = HsrApiClient::new(settings);
                    match client.get_player_index().await {
                        Ok(info) => {
                            let state = app.state::<AppState>();
                            state.cache_data.lock().await.save_player_info(&info);
                            drop(state);
                            player_updated = Some(info);
                        }
                        Err(e) => log::error!("Player poll error: {}", e),
                    }
                }

                if need_ledger {
                    let state = app.state::<AppState>();
                    let settings = state.config_data.lock().await.clone();
                    drop(state);
                    let client = HsrApiClient::new(settings);
                    match client.get_ledger().await {
                        Ok(l) => {
                            let state = app.state::<AppState>();
                            state.cache_data.lock().await.save_ledger(&l);
                            drop(state);
                            ledger_updated = Some(l);
                        }
                        Err(e) => log::warn!("Ledger poll error: {}", e),
                    }
                }

                if need_banners {
                    let state = app.state::<AppState>();
                    let settings = state.config_data.lock().await.clone();
                    drop(state);
                    let client = HsrApiClient::new(settings);
                    match client.get_banners().await {
                        Ok(b) => {
                            let state = app.state::<AppState>();
                            state.cache_data.lock().await.save_banners(&b);
                            drop(state);
                            banners_updated = Some(b);
                        }
                        Err(e) => log::warn!("Banner poll error: {}", e),
                    }
                }

                if need_challenge {
                    let settings = {
                        let state = app.state::<AppState>();
                        let guard = state.config_data.lock().await;
                        guard.clone()
                    };
                    let client = HsrApiClient::new(settings);
                    match tokio::join!(
                        client.get_forgotten_hall(),
                        client.get_pure_fiction(),
                        client.get_apocalyptic_shadow(),
                        client.get_challenge_peak(),
                    ) {
                        (Ok(fh), Ok(pf), Ok(as_), Ok(pk)) => {
                            let state = app.state::<AppState>();
                            let cache = state.cache_data.lock().await;
                            cache.save_challenges(&fh, &pf, &as_);
                            cache.save_peak(&pk);
                            drop(cache);
                            fh_updated = Some(fh);
                            pf_updated = Some(pf);
                            as_updated = Some(as_);
                            peak_updated = Some(pk);
                        }
                        (e1, e2, e3, e4) => log::warn!("Challenge poll error: {:?} {:?} {:?} {:?}", e1, e2, e3, e4),
                    }
                }

                {
                    let settings = {
                        let state = app.state::<AppState>();
                        let guard = state.config_data.lock().await;
                        guard.clone()
                    };
                    let client = HsrApiClient::new(settings);
                    match tokio::join!(
                        client.get_periodic_act(),
                        client.get_rogue_nous(),
                        client.get_rogue_magic(),
                        client.get_rogue_locust(),
                    ) {
                        (Ok(pa), Ok(n), Ok(m), Ok(l)) => {
                            let state = app.state::<AppState>();
                            let cache = state.cache_data.lock().await;
                            cache.save_periodic_act(&pa);
                            periodic_updated = Some(pa);
                            let arch = RogueArchive::from(n)
                                .merge(RogueArchive::from(m))
                                .merge(RogueArchive::from(l));
                            cache.save_rogue_archive(&arch);
                            drop(cache);
                            rogue_updated = Some(arch);
                        }
                        (e1, e2, e3, e4) => log::warn!("Periodic/rogue poll error: {:?} {:?} {:?} {:?}", e1, e2, e3, e4),
                    }
                }

                let _ = app.emit(
                    "data-updated",
                    serde_json::json!({
                        "widget": &data,
                        "player": player_updated,
                        "ledger": ledger_updated,
                        "banners": banners_updated,
                        "forgotten_hall": fh_updated,
                        "pure_fiction": pf_updated,
                        "apocalyptic_shadow": as_updated,
                        "periodic_act": periodic_updated,
                        "challenge_peak": peak_updated,
                        "rogue_archive": rogue_updated,
                    }),
                );
            }
            Err(e) => {
                log::error!("Polling error: {} (backoff={}s)", e, backoff);
                backoff = (backoff * 2).min(MAX_BACKOFF_SECS);
            }
        }

        tokio::time::sleep(std::time::Duration::from_secs(backoff)).await;
    }
}
