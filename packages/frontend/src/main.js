import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import './style.css';

let widgetData = null;
let playerInfo = null;
let config = null;
let ledgerData = null;
let bannerData = null;
let forgottenHall = null;
let pureFiction = null;
let apocalypticShadow = null;
let periodicAct = null;
let challengePeak = null;
let rogueArchive = null;

let currentTab = 'overview';
let previousTab = 'overview';
let isSettingsOpen = false;
let settingsStack = ['settings-root'];

function $(id) {
  return document.getElementById(id);
}

const canvas = $('stamina-ring');
const ctx = canvas?.getContext('2d');
let animPct = 0;

// ── Tab system ──
function switchTab(tab) {
  if (tab === 'settings') {
    isSettingsOpen = !isSettingsOpen;
    if (isSettingsOpen) {
      previousTab = currentTab;
      currentTab = 'settings';
      loadSettingsForm();
    } else {
      currentTab = previousTab;
    }
    renderTab();
    return;
  }
  if (isSettingsOpen) {
    isSettingsOpen = false;
  }
  currentTab = tab;
  updateTabBar();
  renderTab();
}

function updateTabBar() {
  document.querySelectorAll('.tab-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.tab === currentTab);
  });
}

function renderTab() {
  document.querySelectorAll('.tab-content').forEach((el) => el.classList.remove('active'));
  if (isSettingsOpen || currentTab === 'settings') {
    $('settings-view')?.classList.add('active');
  } else {
    const panel = document.getElementById(`tab-${currentTab}`);
    if (panel) panel.classList.add('active');
    switch (currentTab) {
      case 'overview':
        renderDashboard();
        break;
      case 'battle':
        renderChallengeTab();
        break;
      case 'more':
        renderMoreTab();
        break;
    }
  }
  $('settings-btn')?.classList.toggle('active', isSettingsOpen);
}

// ── Settings drill-down navigation ──
let _saveTimeout = null;
async function saveCurrentSettings() {
  if (_saveTimeout) {
    clearTimeout(_saveTimeout);
    _saveTimeout = null;
  }
  const cookie = $('input-cookie')?.value.trim() || config?.cookie || '';
  const uid = $('input-uid')?.value.trim() || config?.uid || '';
  if (!cookie) return; // Not yet configured, skip save
  const nc = {
    cookie,
    stoken: $('input-stoken')?.value || config?.stoken || '',
    uid,
    stuid: $('input-stuid')?.value || config?.stuid || '',
    mid: $('input-mid')?.value || config?.mid || '',
    device_id: config?.device_id || '',
    device_fp: config?.device_fp || '',
    seed_id: config?.seed_id || '',
    seed_time: config?.seed_time || '',
    region: config?.region || 'prod_gf_cn',
    poll_interval_secs: config?.poll_interval_secs || 90,
    data_dir: config?.data_dir || '',
  };
  // Collect notification settings
  const notif = {};
  document.querySelectorAll('.notif-toggle').forEach((el) => {
    notif[el.dataset.key] = el.checked;
  });
  document.querySelectorAll('.notif-input').forEach((el) => {
    const key = el.dataset.key;
    if (key === 'rogue_reminder_day') return;
    let val = el.value;
    if (key.startsWith('stamina_threshold')) {
      val = parseInt(val) / 100 || 0;
    }
    notif[key] = val;
  });
  const rogueDay = document.querySelector('.notif-input[data-key="rogue_reminder_day"]');
  const rogueTime = document.querySelector('.notif-input[data-key="rogue_reminder_time"]');
  if (rogueDay && rogueTime) {
    notif.rogue_reminder_time = `${rogueDay.value} ${rogueTime.value}`;
  }
  if (config?.notification?.notification_mode != null) {
    notif.notification_mode = config.notification.notification_mode;
  }
  nc.notification = notif;
  try {
    await invoke('save_config', { newConfig: nc });
    config = nc;
  } catch (e) {
    console.error('保存失败:', e);
  }
}

// Debounced auto-save on input blur
function setupAutoSave() {
  if (window._autoSaveSetup) return;
  window._autoSaveSetup = true;
  document.querySelectorAll('#settings-view input, #settings-view select').forEach((el) => {
    el.addEventListener('change', () => {
      if (_saveTimeout) clearTimeout(_saveTimeout);
      _saveTimeout = setTimeout(saveCurrentSettings, 200);
    });
    el.addEventListener('blur', () => {
      if (_saveTimeout) clearTimeout(_saveTimeout);
      _saveTimeout = setTimeout(saveCurrentSettings, 300);
    });
  });
}

// ── Settings subpage actions ──

// Storage picker
$('settings-pick-dir')?.addEventListener('click', async () => {
  try {
    const dir = await invoke('pick_data_dir');
    if (dir) {
      config.data_dir = dir;
      await invoke('set_data_dir', { dataDir: dir });
      updateSettingsSummary();
      saveCurrentSettings();
    }
  } catch (e) {
    console.warn('Dir pick failed:', e);
  }
});

// WebView login — open window, then show capture/close actions
$('settings-webview-login')?.addEventListener('click', async () => {
  try {
    await invoke('open_login_webview');
    $('settings-webview-login')?.classList.add('hidden');
    $('settings-capture-cookies')?.classList.remove('hidden');
    $('settings-close-login')?.classList.remove('hidden');
  } catch (e) {
    console.warn('Login webview failed:', e);
  }
});

// Capture cookies from the login window
$('settings-capture-cookies')?.addEventListener('click', async () => {
  try {
    await invoke('capture_login_cookies');
    $('settings-capture-cookies')?.classList.add('hidden');
    $('settings-close-login')?.classList.add('hidden');
    $('settings-webview-login')?.classList.remove('hidden');
  } catch (e) {
    console.warn('Capture failed:', e);
  }
});

// Close login window without capturing
$('settings-close-login')?.addEventListener('click', async () => {
  try {
    await invoke('close_login_window');
  } catch {}
  $('settings-capture-cookies')?.classList.add('hidden');
  $('settings-close-login')?.classList.add('hidden');
  $('settings-webview-login')?.classList.remove('hidden');
});

// Re-launch welcome
$('settings-show-welcome')?.addEventListener('click', () => {
  closeSettings();
  showWelcome();
});

// Password reveal toggles in account subpage
document.querySelectorAll('.setting-password-toggle').forEach((btn) => {
  btn.addEventListener('click', () => {
    const inputId = btn.dataset.for;
    const input = $(inputId);
    if (!input) return;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    btn.innerHTML = isPassword
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  });
});

function pushSubpage(pageId) {
  const current = settingsStack[settingsStack.length - 1];
  const currentEl = $(current);
  const nextEl = $(pageId);
  if (!nextEl || current === pageId) return;
  // Save current page before leaving
  saveCurrentSettings();
  // Animate out current, in next
  currentEl.classList.remove('active');
  currentEl.classList.add('exit-left');
  nextEl.classList.add('enter-right');
  // Force reflow for transition
  nextEl.offsetHeight;
  nextEl.classList.remove('enter-right');
  nextEl.classList.add('active');
  settingsStack.push(pageId);
  renderSettingsNav();
  // Cleanup after animation
  setTimeout(() => {
    currentEl.classList.remove('exit-left');
  }, 300);
}

function popSubpage() {
  if (settingsStack.length <= 1) return;
  saveCurrentSettings();
  const leaving = settingsStack.pop();
  const target = settingsStack[settingsStack.length - 1];
  const leavingEl = $(leaving);
  const targetEl = $(target);
  // Animate out current (right), in target (from left)
  leavingEl.classList.remove('active');
  leavingEl.classList.add('exit-right');
  targetEl.style.transform = 'translateX(-30px)';
  targetEl.style.opacity = '0';
  targetEl.classList.add('active');
  targetEl.offsetHeight;
  targetEl.style.transform = '';
  targetEl.style.opacity = '';
  renderSettingsNav();
  setTimeout(() => {
    leavingEl.classList.remove('exit-right');
  }, 300);
}

function closeSettings() {
  settingsStack = ['settings-root'];
  // Reset all pages to clean state
  document.querySelectorAll('.settings-page').forEach((el) => {
    el.classList.remove('active', 'exit-left', 'exit-right', 'enter-right');
    el.style.transform = '';
    el.style.opacity = '';
  });
  $('settings-root')?.classList.add('active');
  isSettingsOpen = false;
  currentTab = previousTab;
  updateTabBar();
  renderTab();
}

function renderSettingsNav() {
  const isRoot = settingsStack.length <= 1;
  const backBtn = $('settings-back');
  const doneBtn = $('settings-done');
  const titleEl = $('settings-title');
  const currentPage = settingsStack[settingsStack.length - 1];
  // Title mapping
  const titles = {
    'settings-root': '设置',
    'settings-account': '账号',
    'settings-storage': '数据存储',
    'settings-notifications': '通知',
    'settings-general': '通用',
  };
  titleEl.textContent = titles[currentPage] || '设置';
  if (isRoot) {
    backBtn.classList.add('hidden');
    doneBtn.classList.remove('hidden');
    doneBtn.textContent = '完成';
  } else {
    backBtn.classList.remove('hidden');
    const parentTitle = titles[settingsStack[settingsStack.length - 2]] || '设置';
    document.getElementById('settings-back-text').textContent = parentTitle;
    doneBtn.classList.add('hidden');
  }
}

// Settings nav event bindings
document.getElementById('settings-pages')?.addEventListener('click', (e) => {
  const menuRow = e.target.closest('.settings-menu-row[data-page]');
  if (menuRow) {
    pushSubpage(menuRow.dataset.page);
    return;
  }
});

$('settings-back')?.addEventListener('click', popSubpage);
$('settings-done')?.addEventListener('click', closeSettings);

// Close on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isSettingsOpen) {
    if (settingsStack.length > 1) {
      popSubpage();
    } else {
      closeSettings();
    }
  }
});

// ═══════════════════════════════════════
//    TAB 1: 仪表盘
// ═══════════════════════════════════════
function renderDashboard() {
  if (!widgetData) return;
  const d = widgetData;

  // Stamina
  $('stamina-current').textContent = d.current_stamina;
  $('stamina-max').textContent = d.max_stamina;
  drawRing(d.current_stamina, d.max_stamina);
  startRecoveryTimer(d.stamina_recover_time);

  // Reserve
  if (d.current_reserve_stamina > 0) {
    $('reserve-row').classList.remove('hidden');
    $('reserve-value').textContent = d.is_reserve_stamina_full ? '已满' : d.current_reserve_stamina;
  } else {
    $('reserve-row').classList.add('hidden');
  }

  function setCell(id, value, dotClass, sub) {
    const el = $(id);
    if (!el) return;
    el.className = 'ov-grid-value';
    el.innerHTML = `${value}${dotClass ? `<span class="ov-grid-dot ${dotClass}"></span>` : ''}`;
    const subEl = el.parentElement?.querySelector('.ov-grid-sub');
    if (subEl) subEl.textContent = sub || '';
  }

  // Sign
  setCell('sign-value', d.has_signed ? '已签到' : '未签到', d.has_signed ? 'ok' : 'warn', '');

  // Expedition: accepted = 进行中, 0 = 全部可领
  if (d.total_expedition_num > 0) {
    const done = d.accepted_expedition_num === 0;
    const val = done
      ? `${d.total_expedition_num}/${d.total_expedition_num}`
      : `${d.accepted_expedition_num}/${d.total_expedition_num}`;
    setCell('expedition-value', val, done ? 'ok' : 'muted', done ? '可领取' : '进行中');
  }

  // Rogue (周期演算)
  if (d.rogue_tourn_weekly_max > 0) {
    const full = d.rogue_tourn_weekly_cur >= d.rogue_tourn_weekly_max;
    const val = `${d.rogue_tourn_weekly_cur}/${d.rogue_tourn_weekly_max}`;
    setCell(
      'rogue-value',
      val,
      full ? 'done' : d.rogue_tourn_weekly_cur === 0 ? 'warn' : '',
      full ? '已满' : '',
    );
  }

  // Cocoon (历战余响)
  if (d.weekly_cocoon_limit > 0) {
    const done = d.weekly_cocoon_cnt >= d.weekly_cocoon_limit;
    const val = `${d.weekly_cocoon_cnt}/${d.weekly_cocoon_limit}`;
    setCell('cocoon-value', val, done ? 'done' : 'muted', done ? '已打完' : '剩余');
  }

  // Daily training
  if (d.max_train_score > 0) {
    const full = d.current_train_score >= d.max_train_score;
    const val = `${d.current_train_score}/${d.max_train_score}`;
    setCell(
      'train-value',
      val,
      full ? 'done' : d.current_train_score === 0 ? 'warn' : '',
      full ? '已满' : '',
    );
  }

  // Player info
  if (playerInfo) {
    $('player-name').textContent = playerInfo.stats?.active_days
      ? `开拓${playerInfo.stats.active_days}天`
      : '未知开拓者';
    $('player-level').textContent = `Lv.${playerInfo.avatar_list?.[0]?.level || '--'}`;
    $('achievement-value').textContent =
      playerInfo.stats?.achievement_num?.toLocaleString() || '--';
  }

  // Season info row
  renderSeasonRow();

  // 模拟宇宙档案
  renderRogueArchive();
}

function renderSeasonRow() {
  const section = $('season-section');
  if (!section) return;
  if (!periodicAct?.acts?.length) {
    section.innerHTML = '';
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');
  section.innerHTML = periodicAct.acts
    .filter((a) => a.season_name)
    .map((a) => {
      const name = a.season_name || '';
      let detail = '';
      if (a.division_level && a.division_level !== '0') {
        detail = `段位${a.division_level}`;
      } else if (a.season_level) {
        detail = `Lv.${a.season_level}`;
      }
      return `<div class="ov-season-item"><span class="ov-season-name">${name}</span>${detail ? `<span class="ov-season-detail">${detail}</span>` : ''}</div>`;
    })
    .join('');
}

// ═══════════════════════════════════════
//    TAB 2: 挑战
// ═══════════════════════════════════════
function renderChallengeTab() {
  // 4 challenge cards
  renderChallengeCard('forgotten-hall', forgottenHall);
  renderChallengeCard('pure-fiction', pureFiction);
  renderChallengeCard('apocalyptic-shadow', apocalypticShadow);
  renderChallengeCard('challenge-peak', challengePeak, true);

  // Weekly progress bars
  const d = widgetData;
  if (!d) return;
  renderProgressBar(
    'weekly-rogue-bar',
    d.rogue_tourn_weekly_cur,
    d.rogue_tourn_weekly_max,
    '差分宇宙',
  );
  renderProgressBar(
    'weekly-gold-bar',
    d.grid_fight_weekly_cur,
    d.grid_fight_weekly_max,
    '财富造物主',
  );
  renderProgressBar('weekly-train-bar', d.current_train_score, d.max_train_score, '每日实训');
}

function renderChallengeCard(prefix, data, isPeak) {
  const card = document.getElementById(`btl-${prefix}`);
  if (!card) return;
  const statEl = $(`${prefix}-stat`);
  const dateEl = card.querySelector('.btl-card-date');
  const barEl = card.querySelector('.btl-card-bar');
  const fillEl = card.querySelector('.btl-card-fill');

  if (!data || !data.has_data) {
    statEl.textContent = isPeak ? '未开放' : '暂无数据';
    statEl.style.color = 'var(--text-muted)';
    if (dateEl) dateEl.textContent = '';
    if (barEl) barEl.style.display = 'none';
    return;
  }

  const cur = isPeak ? data.cur_floor : data.star_num;
  const max = isPeak ? data.max_floor : data.max_star;
  const label = isPeak ? '层' : '星';

  statEl.textContent = `${cur}/${max}${label}`;
  statEl.style.color = cur >= max ? 'var(--green)' : 'var(--orange)';

  // Stars for non-peak
  if (!isPeak) {
    const starEl = card.querySelector('.btl-card-stars');
    if (starEl) {
      const filled = starFilled.repeat(Math.min(data.star_num, data.max_star));
      const empty = starEmpty.repeat(Math.max(0, data.max_star - data.star_num));
      starEl.innerHTML = filled + empty || '—';
    }
  }

  // Date
  if (dateEl) {
    if (data.begin_time && data.end_time) {
      dateEl.textContent = `${data.begin_time.slice(5, 10)} ~ ${data.end_time.slice(5, 10)}`;
    } else {
      dateEl.textContent = '';
    }
  }

  // Progress bar for peak mode
  if (isPeak && barEl) {
    barEl.style.display = 'block';
    const pct = max > 0 ? cur / max : 0;
    fillEl.style.width = `${Math.min(pct * 100, 100)}%`;
    fillEl.className = 'btl-card-fill' + (cur >= max ? ' done' : pct > 0.5 ? ' half' : '');
  } else if (barEl) {
    barEl.style.display = 'none';
  }
}

function renderProgressBar(id, cur, max, label) {
  const fill = document.getElementById(id);
  if (!fill) return;
  const card = fill.closest('.btl-weekly');
  if (!card) return;
  const labelEl = card.querySelector('.btl-weekly-label');
  if (labelEl) labelEl.textContent = label;
  const valEl = card.querySelector('.btl-weekly-value');
  if (valEl) valEl.textContent = `${cur}/${max}`;
  const pct = max > 0 ? cur / max : 0;
  fill.style.width = `${Math.min(pct * 100, 100)}%`;
  fill.className = 'btl-weekly-fill' + (cur >= max ? ' done' : pct > 0 ? '' : ' empty');
}

// ═══════════════════════════════════════
//    TAB 3: 活动·档案
// ═══════════════════════════════════════
function renderMoreTab() {
  // Ledger
  if (ledgerData) {
    $('ledger-hcoin').textContent = ledgerData.current_hcoin?.toLocaleString() || '--';
    $('ledger-pass').textContent = ledgerData.current_rails_pass || '--';
    if (ledgerData.hcoin_rate != null) {
      const r = ledgerData.hcoin_rate;
      const sign = r >= 0 ? '+' : '';
      const el = $('ledger-hcoin-rate');
      el.textContent = `${sign}${r}%`;
      el.style.color = r >= 0 ? 'var(--green)' : 'var(--red)';
    }
  }

  renderBanners();
  renderRogueArchive();
}

function makeBannerCard(act) {
  const card = document.createElement('div');
  card.className = 'banner-card';

  // Primary row: tag + name + days
  const top = document.createElement('div');
  top.className = 'banner-card-top';

  const tag = document.createElement('span');
  tag.className = 'banner-tag';
  const typeStyle = act.act_type === '双倍' || act.act_type === '签到' ? '活动' : act.act_type;
  tag.dataset.type = typeStyle;
  tag.textContent = act.act_type;

  const name = document.createElement('span');
  name.className = 'banner-name';
  name.textContent = act.name;

  // Days pill
  const days = document.createElement('span');
  days.className = 'banner-days-pill';
  let dl = act.days_left;
  if (dl == null && act.end_time) {
    try {
      dl = Math.ceil((new Date(act.end_time).getTime() - Date.now()) / 86400000);
    } catch {}
  }
  if (dl > 3) {
    days.textContent = `剩${dl}天`;
    days.className = 'banner-days-pill ok';
  } else if (dl > 0) {
    days.textContent = `剩${dl}天`;
    days.className = 'banner-days-pill warn';
  } else if (dl === 0) {
    days.textContent = '最后一天';
    days.className = 'banner-days-pill urgent';
  } else {
    days.textContent = '已结束';
    days.className = 'banner-days-pill over';
  }

  top.appendChild(tag);
  top.appendChild(name);
  top.appendChild(days);
  card.appendChild(top);

  // Thin progress bar at bottom
  const progBar = document.createElement('div');
  progBar.className = 'banner-progress';
  const fill = document.createElement('div');
  fill.className = 'banner-progress-fill';

  if (act.total_progress > 0) {
    // 双倍活动 — 按进度
    fill.style.width = `${(act.current_progress / act.total_progress) * 100}%`;
    fill.className = 'banner-progress-fill plenty';
  } else if (
    act.end_time &&
    act.begin_time &&
    act.end_time.length >= 10 &&
    act.begin_time.length >= 10
  ) {
    try {
      const total = new Date(act.end_time).getTime() - new Date(act.begin_time).getTime();
      const elapsed = Date.now() - new Date(act.begin_time).getTime();
      if (total > 0) {
        const pct = Math.min(Math.max(elapsed / total, 0), 1);
        fill.style.width = `${(1 - pct) * 100}%`;
        if (dl > 3) fill.className = 'banner-progress-fill plenty';
        else if (dl > 0) fill.className = 'banner-progress-fill warn';
        else fill.className = 'banner-progress-fill urgent';
      }
    } catch {}
  } else {
    progBar.style.display = 'none';
  }
  progBar.appendChild(fill);
  card.appendChild(progBar);

  return card;
}

function renderBanners() {
  const pools = bannerData?.card_pools ?? [];
  const events = bannerData?.events ?? [];
  const total = pools.length + events.length;

  const section = $('banner-section');
  if (!total) {
    section?.classList.add('empty');
    return;
  }
  section?.classList.remove('empty');
  $('banner-count').textContent = total;

  const list = $('banner-list');
  list.innerHTML = '';

  if (pools.length) {
    const h = document.createElement('div');
    h.className = 'banner-list-label';
    h.textContent = '角色 / 光锥';
    list.appendChild(h);
    for (const act of pools) list.appendChild(makeBannerCard(act));
  }
  if (events.length) {
    const h = document.createElement('div');
    h.className = 'banner-list-label';
    h.textContent = '限时活动';
    list.appendChild(h);
    for (const act of events) list.appendChild(makeBannerCard(act));
  }
}

function renderRogueArchive() {
  const el = $('ov-archive-content');
  const section = $('ov-archive-section');
  if (!el) return;
  const arch = rogueArchive;
  if (!arch || (!arch.nous_progress && !arch.magic_linear && !arch.locust_narrow)) {
    el.innerHTML = '<div class="archive-empty">暂无数据</div>';
    section?.classList.add('empty');
    return;
  }
  section?.classList.remove('empty');

  let html = '';
  if (arch.nous_progress) {
    html += `<div class="arc-cell">
      <svg class="arc-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
      <span class="arc-name">智识令使</span>
      <span class="arc-progress">${arch.nous_progress}</span>
      <span class="arc-sub">奇迹 ${arch.nous_miracle || '--'} · 神经 ${arch.nous_nerve || '--'}</span>
    </div>`;
  }
  if (arch.magic_linear) {
    html += `<div class="arc-cell">
      <svg class="arc-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
      <span class="arc-name">黄金与机械</span>
      <span class="arc-progress">${arch.magic_linear}</span>
      <span class="arc-sub">秘闻 ${arch.magic_compendium || '--'} · 隐藏 ${arch.magic_secrets || '--'}</span>
    </div>`;
  }
  if (arch.locust_narrow > 0) {
    html += `<div class="arc-cell">
      <svg class="arc-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
      <span class="arc-name">寰宇蝗灾</span>
      <span class="arc-progress">窄道 ${arch.locust_narrow}</span>
      <span class="arc-sub">奇迹 ${arch.locust_miracle || '--'} · 事件 ${arch.locust_event || '--'}</span>
    </div>`;
    if (arch.locust_destinies?.length) {
      html += '<div class="arc-destinies">';
      for (const d of arch.locust_destinies) {
        html += `<span class="arc-destiny">${d.name} Lv.${d.level}</span>`;
      }
      html += '</div>';
    }
  }
  el.innerHTML = html;
}

// ═══════════════════════════════════════
//    DRAW STAMINA RING
// ═══════════════════════════════════════
function drawRing(current, max) {
  if (!ctx) return;
  const targetPct = max > 0 ? current / max : 0;
  animPct += (targetPct - animPct) * 0.15;
  if (Math.abs(animPct - targetPct) < 0.001) animPct = targetPct;

  const w = canvas.width,
    h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2,
    cy = h / 2,
    r = 32,
    lw = 4;

  const g = ctx.createRadialGradient(cx, cy, r - 6, cx, cy, r + 12);
  g.addColorStop(0, 'rgba(10, 132, 255, 0.03)');
  g.addColorStop(1, 'transparent');
  ctx.beginPath();
  ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const isDark = document.documentElement.dataset.theme === 'dark';
  ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  ctx.lineWidth = lw;
  ctx.stroke();

  const pct = Math.min(Math.max(animPct, 0), 1);
  const start = -Math.PI / 2;
  const end = start + Math.PI * 2 * pct;

  const grad = ctx.createConicGradient(start, cx, cy);
  if (pct >= 0.95) {
    grad.addColorStop(0, '#FF453A');
    grad.addColorStop(1, '#FF6961');
  } else if (pct >= 0.8) {
    grad.addColorStop(0, '#FF9F0A');
    grad.addColorStop(1, '#FFD60A');
  } else {
    grad.addColorStop(0, '#0A84FF');
    grad.addColorStop(1, '#64D2FF');
  }

  ctx.beginPath();
  ctx.arc(cx, cy, r, start, end);
  ctx.strokeStyle = grad;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.stroke();

  if (pct > 0.02) {
    const a = end,
      dx = cx + Math.cos(a) * r,
      dy = cy + Math.sin(a) * r;
    const c = pct >= 0.95 ? '#FF453A' : pct >= 0.8 ? '#FFD60A' : '#0A84FF';
    ctx.beginPath();
    ctx.arc(dx, dy, 3, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(dx, dy, 6, 0, Math.PI * 2);
    ctx.fillStyle =
      pct >= 0.95
        ? 'rgba(255,69,58,0.2)'
        : pct >= 0.8
          ? 'rgba(255,214,10,0.2)'
          : 'rgba(10,132,255,0.2)';
    ctx.fill();
  }

  if (Math.abs(animPct - targetPct) > 0.001) requestAnimationFrame(() => drawRing(current, max));
}

function formatTime(secs) {
  if (secs <= 0) return '已满';
  const h = Math.floor(secs / 3600),
    m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}分钟`;
}

let recoveryInterval = null;
function formatEstTime(secs) {
  if (secs <= 0) return '';
  const now = new Date();
  const ms = now.getTime() + secs * 1000;
  const target = new Date(ms);
  const h = target.getHours().toString().padStart(2, '0');
  const m = target.getMinutes().toString().padStart(2, '0');
  const today = new Date();
  if (target.getDate() === today.getDate()) {
    return `· ${h}:${m}`;
  }
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (target.getDate() === tomorrow.getDate()) {
    return `· 明天 ${h}:${m}`;
  }
  return `· ${target.getMonth() + 1}/${target.getDate()} ${h}:${m}`;
}
function startRecoveryTimer(secs) {
  if (recoveryInterval) clearInterval(recoveryInterval);
  const est = $('recovery-est');
  if (secs <= 0) {
    $('recovery-time').textContent = '已满';
    if (est) est.textContent = '';
    return;
  }
  if (est) est.textContent = formatEstTime(secs);
  let r = secs;
  const tick = () => {
    if (r <= 0) {
      $('recovery-time').textContent = '已满';
      if (est) est.textContent = '';
      clearInterval(recoveryInterval);
      recoveryInterval = null;
      return;
    }
    $('recovery-time').textContent = formatTime(r);
    r--;
  };
  tick();
  recoveryInterval = setInterval(tick, 1000);
}

// ── Settings ──
async function loadSettingsForm() {
  try {
    config = await invoke('load_env_config');
  } catch {}
  if (config) {
    $('input-cookie').value = config.cookie || '';
    $('input-stoken').value = config.stoken || '';
    $('input-uid').value = config.uid || '';
    $('input-stuid').value = config.stuid || '';
    $('input-mid').value = config.mid || '';
  }
  // 通知设置
  if (config) {
    const notif = config.notification || {};
    document.querySelectorAll('.notif-toggle').forEach((el) => {
      const key = el.dataset.key;
      if (key in notif) {
        el.checked = notif[key];
      }
    });
    document.querySelectorAll('.notif-input').forEach((el) => {
      const key = el.dataset.key;
      if (key in notif) {
        if (key === 'rogue_reminder_time') {
          // "Sun 20:00" → select + time
          const parts = notif[key].split(' ');
          const daySel = document.querySelector('.notif-input[data-key="rogue_reminder_day"]');
          const timeInp = el;
          if (parts.length === 2) {
            if (daySel) daySel.value = parts[0];
            timeInp.value = parts[1];
          }
        } else if (key.startsWith('stamina_threshold')) {
          el.value = Math.round(notif[key] * 100);
        } else {
          el.value = notif[key];
        }
      }
    });
    updateNotifDependencies();
  }
  setupAutoSave();
  if (typeof updateSettingsSummary === 'function') updateSettingsSummary();
}

function updateNotifDependencies() {
  document.querySelectorAll('[data-depends]').forEach((el) => {
    const depKey = el.dataset.depends;
    const toggle = document.querySelector(`.notif-toggle[data-key="${depKey}"]`);
    el.style.display = toggle && toggle.checked ? '' : 'none';
  });
}

function updateSettingsSummary() {
  // Account summary
  const hasCookie = config && config.cookie;
  document.getElementById('summary-account').textContent = hasCookie ? '已配置' : '未配置';

  // Storage summary
  const dataDir = config?.data_dir || '';
  document.getElementById('summary-storage').textContent = dataDir
    ? dataDir.length > 24
      ? '…' + dataDir.slice(-24)
      : dataDir
    : '默认位置';
  const pathEl = document.getElementById('settings-storage-path');
  if (pathEl) pathEl.textContent = dataDir || '默认位置 (~/.config/mihoyo-widget)';

  // Notifications summary
  const notif = config?.notification || {};
  const enabledCount = [
    'stamina_enabled',
    'expedition_enabled',
    'reserve_stamina_enabled',
    'sign_reminder_enabled',
    'rogue_reminder_enabled',
    'digest_enabled',
  ].filter((k) => notif[k]).length;
  document.getElementById('summary-notifications').textContent =
    enabledCount > 0 ? `${enabledCount} 项开启` : '关闭';

  // General summary
  const interval = config?.poll_interval_secs || 90;
  document.getElementById('summary-general').textContent = `轮询 ${interval}s`;
  document.getElementById('settings-poll-interval').textContent = `${interval}s`;
  document.getElementById('settings-notif-mode').textContent = notif.notification_mode
    ? '静默'
    : '弹窗';
}

// ── Startup ──
async function loadData() {
  let cached;
  try {
    cached = await invoke('get_all_cached');
  } catch (e) {
    console.error('读取缓存失败:', e);
  }
  if (cached) {
    widgetData = cached.widget;
    playerInfo = cached.player;
    forgottenHall = cached.forgotten_hall;
    pureFiction = cached.pure_fiction;
    apocalypticShadow = cached.apocalyptic_shadow;
    ledgerData = cached.ledger;
    bannerData = cached.banners;
    periodicAct = cached.periodic_act;
    challengePeak = cached.challenge_peak;
    rogueArchive = cached.rogue_archive;
  }

  try {
    config = await invoke('load_env_config');
  } catch (e) {
    console.error('加载配置失败:', e);
  }

  // 无缓存数据时显示 loading 占位
  if (!widgetData) {
    $('player-name').textContent = '正在获取数据...';
  }

  renderTab();
  try {
    await invoke('force_refresh');
  } catch (e) {
    console.warn('Refresh failed:', e);
  }
}

async function doRefresh() {
  $('refresh-btn').classList.add('spinning');
  try {
    await invoke('force_refresh');
    $('last-update').textContent = new Date().toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch (e) {
    console.error('Refresh failed:', e);
    $('last-update').textContent =
      '刷新失败 ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const btn = $('refresh-btn');
    btn.classList.add('spin-error');
    setTimeout(() => btn.classList.remove('spin-error'), 2000);
  } finally {
    setTimeout(() => $('refresh-btn').classList.remove('spinning'), 600);
  }
}

// ── Events ──
listen('data-updated', (event) => {
  const p = event.payload;
  let changed = false;
  if (p.widget) {
    widgetData = p.widget;
    changed = true;
  }
  if (p.player) {
    playerInfo = p.player;
    changed = true;
  }
  if (p.ledger) {
    ledgerData = p.ledger;
    changed = true;
  }
  if (p.banners) {
    bannerData = p.banners;
    changed = true;
  }
  if (p.forgotten_hall) {
    forgottenHall = p.forgotten_hall;
    changed = true;
  }
  if (p.pure_fiction) {
    pureFiction = p.pure_fiction;
    changed = true;
  }
  if (p.apocalyptic_shadow) {
    apocalypticShadow = p.apocalyptic_shadow;
    changed = true;
  }
  if (p.periodic_act) {
    periodicAct = p.periodic_act;
    changed = true;
  }
  if (p.challenge_peak) {
    challengePeak = p.challenge_peak;
    changed = true;
  }
  if (p.rogue_archive) {
    rogueArchive = p.rogue_archive;
    changed = true;
  }
  if (changed) {
    $('last-update').textContent = new Date().toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
  renderTab();
});

// ── Drag ──
const dragHandle = $('drag-handle');
let isDragging = false,
  dragStartX,
  dragStartY,
  winStartX,
  winStartY;

dragHandle.addEventListener('mousedown', async (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  try {
    await getCurrentWindow().startDragging();
  } catch {
    isDragging = true;
    try {
      const pos = await getCurrentWindow().position();
      winStartX = pos.x;
      winStartY = pos.y;
    } catch {
      winStartX = 0;
      winStartY = 0;
    }
    dragStartX = e.screenX;
    dragStartY = e.screenY;
  }
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  getCurrentWindow()
    .setPosition({ x: winStartX + e.screenX - dragStartX, y: winStartY + e.screenY - dragStartY })
    .catch(() => {});
});

document.addEventListener('mouseup', () => {
  isDragging = false;
});

// ── Theme toggle ──
let darkTheme = localStorage.getItem('mihoyo-theme') !== 'light';

const moonSvg =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const sunSvg =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';

function applyTheme() {
  document.documentElement.dataset.theme = darkTheme ? 'dark' : 'light';
  $('theme-btn').innerHTML = darkTheme ? sunSvg : moonSvg;
}

function toggleTheme() {
  darkTheme = !darkTheme;
  localStorage.setItem('mihoyo-theme', darkTheme ? 'dark' : 'light');
  applyTheme();
}

// ── Star SVG for battle cards ──
const starFilled =
  '<svg width="10" height="10" viewBox="0 0 24 24" fill="var(--yellow)" stroke="var(--yellow)" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
const starEmpty =
  '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--gray-light)" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';

document.querySelectorAll('.notif-toggle').forEach((el) => {
  el.addEventListener('change', updateNotifDependencies);
});

// ── Event wiring ──
document.querySelectorAll('.tab-item').forEach((el) => {
  el.addEventListener('click', () => switchTab(el.dataset.tab));
});

$('settings-btn').addEventListener('click', () => {
  if (!isSettingsOpen) {
    settingsStack = ['settings-root'];
    document.querySelectorAll('.settings-page').forEach((el) => {
      el.classList.remove('active', 'exit-left', 'enter-right');
      el.style.transform = '';
      el.style.opacity = '';
    });
    $('settings-root')?.classList.add('active');
    renderSettingsNav();
  }
  switchTab('settings');
});

$('refresh-btn').addEventListener('click', doRefresh);
$('theme-btn')?.addEventListener('click', toggleTheme);

// 折叠功能已移除，banner/archive 始终保持展开

// ── Init (deferred — onboarding check runs after data load) ──
applyTheme();
loadData();

// ═══════════════════════════════════════
//    ONBOARDING WELCOME OVERLAY
// ═══════════════════════════════════════

const WELCOME_STEPS = [
  {
    title: '欢迎使用 Mihoyo Widget',
    subtitle: '桌面实时监控星穹铁道游戏数据\n体力 / 派遣 / 挑战 / 活动，一目了然',
    icon: '\u{1F3AE}',
    render: () => `
      <div class="welcome-icon">${WELCOME_STEPS[0].icon}</div>
      <div class="welcome-title">${WELCOME_STEPS[0].title}</div>
      <div class="welcome-subtitle">${WELCOME_STEPS[0].subtitle.replace(/\n/g, '<br>')}</div>
    `,
  },
  {
    title: '选择数据目录',
    subtitle: '数据文件和缓存的存储位置。默认为系统配置目录。',
    icon: '\u{1F4C1}',
    render: () => `
      <div class="welcome-icon">\u{1F4C1}</div>
      <div class="welcome-title">选择数据目录</div>
      <div class="welcome-subtitle">所有配置、缓存数据存储在此目录下。</div>
      <div class="welcome-path" id="welcome-dir-path">${currentDataDir || '默认位置（~/.config/mihoyo-widget）'}</div>
      <button class="welcome-dir-btn" id="welcome-pick-dir">选择其他目录</button>
    `,
  },
  {
    title: '登录米游社',
    subtitle: '配置认证信息以获取游戏数据。推荐使用米游社登录自动获取。',
    icon: '\u{1F510}',
    render: () => {
      const hasCookie = renderedConfig?.cookie && renderedConfig.cookie.length > 0;
      return `
        <div class="welcome-icon">\u{1F510}</div>
        <div class="welcome-title">登录设置</div>
        <div class="welcome-subtitle">${hasCookie ? '已配置 Cookie，可直接下一步。' : '选择登录方式：'}</div>
        ${
          hasCookie
            ? ''
            : `
        <div class="welcome-login-form">
          <button class="welcome-btn-primary" id="welcome-login-webview" style="width:100%">使用米游社登录</button>
          <div class="welcome-subtitle" style="font-size:11px; margin:4px 0">或手动输入</div>
          <input type="password" id="welcome-cookie-input" placeholder="Cookie（完整 Cookie 字符串）" />
          <input type="password" id="welcome-stoken-input" placeholder="SToken（可选）" />
          <input type="text" id="welcome-uid-input" placeholder="UID（可选）" />
        </div>
        `
        }
        ${hasCookie ? '<div class="welcome-login-status">✓ 已配置认证</div>' : ''}
      `;
    },
  },
  {
    title: '功能介绍',
    subtitle: '',
    icon: '✨',
    render: () => `
      <div class="welcome-icon">✨</div>
      <div class="welcome-title">功能介绍</div>
      <div class="welcome-features">
        <div class="welcome-feature-card">
          <div class="welcome-feature-icon">⚡</div>
          <div class="welcome-feature-name">实时数据</div>
          <div class="welcome-feature-desc">体力、派遣、模拟宇宙等实时监控</div>
        </div>
        <div class="welcome-feature-card">
          <div class="welcome-feature-icon">\u{1F3C6}</div>
          <div class="welcome-feature-name">挑战追踪</div>
          <div class="welcome-feature-desc">忘却之庭、虚构叙事、末日幻影</div>
        </div>
        <div class="welcome-feature-card">
          <div class="welcome-feature-icon">\u{1F514}</div>
          <div class="welcome-feature-name">通知提醒</div>
          <div class="welcome-feature-desc">可配置阈值和定时提醒规则</div>
        </div>
        <div class="welcome-feature-card">
          <div class="welcome-feature-icon">\u{1F5A5}️</div>
          <div class="welcome-feature-name">托盘模式</div>
          <div class="welcome-feature-desc">系统托盘常驻，静默通知不打扰</div>
        </div>
      </div>
    `,
  },
  {
    title: '准备就绪',
    subtitle: '引导已完成，可以开始使用了！',
    icon: '✅',
    render: () => `
      <div class="welcome-checkmark">✓</div>
      <div class="welcome-title">准备就绪</div>
      <div class="welcome-subtitle">引导已完成，可以开始使用 Mihoyo Widget 了！</div>
      <div class="welcome-subtitle" style="font-size:11px; color:var(--text-muted)">
        如需重新查看引导，可通过托盘菜单「欢迎引导」随时打开。
      </div>
    `,
  },
];

let welcomeStep = 0;
let isWelcoming = false;
let renderedConfig = null;
let currentDataDir = '';

async function showWelcome() {
  const overlay = $('welcome-overlay');
  if (!overlay) return;
  isWelcoming = true;
  welcomeStep = 0;
  overlay.classList.remove('hidden');
  try {
    currentDataDir = await invoke('get_data_dir');
  } catch {}
  try {
    renderedConfig = await invoke('load_env_config');
  } catch {}
  renderWelcomeStep();
}

function hideWelcome() {
  const overlay = $('welcome-overlay');
  if (overlay) overlay.classList.add('hidden');
  isWelcoming = false;
  if (renderedConfig && !renderedConfig.first_run_done) {
    invoke('complete_first_run').catch(() => {});
  }
}

function renderWelcomeStep() {
  const step = WELCOME_STEPS[welcomeStep];
  if (!step) return;

  // Dots
  const dots = document.querySelectorAll('.welcome-step-dot');
  dots.forEach((d, i) => d.classList.toggle('active', i === welcomeStep));

  // Content
  const content = $('welcome-content');
  content.innerHTML = step.render();

  // Footer buttons
  const isFirst = welcomeStep === 0;
  const isLast = welcomeStep === WELCOME_STEPS.length - 1;
  const skipBtn = $('welcome-skip');
  const nextBtn = $('welcome-next');

  skipBtn.textContent = isFirst ? '跳过引导' : isLast ? '' : '上一步';
  skipBtn.style.display = isFirst || isLast ? 'block' : 'inline-block';
  if (isLast) skipBtn.textContent = '';
  skipBtn.style.visibility = isLast ? 'hidden' : 'visible';

  nextBtn.textContent = isLast ? '开始使用' : '下一步';

  // Wire step-specific events
  wireWelcomeEvents();
}

function wireWelcomeEvents() {
  // Dir picker (step 2)
  const pickDirBtn = $('welcome-pick-dir');
  if (pickDirBtn) {
    pickDirBtn.addEventListener('click', async () => {
      try {
        const dir = await invoke('pick_data_dir');
        if (dir) {
          currentDataDir = dir;
          const pathEl = $('welcome-dir-path');
          if (pathEl) pathEl.textContent = dir;
          await invoke('set_data_dir', { dataDir: dir });
        }
      } catch (e) {
        console.warn('Directory pick failed:', e);
      }
    });
  }

  // Login webview (step 3)
  const loginBtn = $('welcome-login-webview');
  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      try {
        await invoke('open_login_webview');
      } catch (e) {
        console.warn('Open login failed:', e);
      }
    });
  }

  // Cookie/UID inputs (step 3)
  const cookeInp = $('welcome-cookie-input');
  const stokenInp = $('welcome-stoken-input');
  const uidInp = $('welcome-uid-input');
  if (cookeInp || stokenInp || uidInp) {
    const saveWelcomeCreds = () => {};
    if (cookeInp) cookeInp.addEventListener('input', saveWelcomeCreds);
    if (stokenInp) stokenInp.addEventListener('input', saveWelcomeCreds);
    if (uidInp) uidInp.addEventListener('input', saveWelcomeCreds);
  }
}

// ── Welcome navigation ──
$('welcome-next')?.addEventListener('click', async () => {
  if (welcomeStep === WELCOME_STEPS.length - 1) {
    await completeWelcome();
    return;
  }

  // Step-specific save before advancing
  if (welcomeStep === 2) {
    const cookie = $('welcome-cookie-input')?.value?.trim();
    const stoken = $('welcome-stoken-input')?.value?.trim();
    const uid = $('welcome-uid-input')?.value?.trim();
    if (cookie) {
      try {
        const currentConfig = await invoke('load_env_config');
        currentConfig.cookie = cookie;
        currentConfig.stoken = stoken || currentConfig.stoken;
        currentConfig.uid = uid || currentConfig.uid;
        currentConfig.first_run_done = false;
        await invoke('save_config', { newConfig: currentConfig });
        renderedConfig = currentConfig;
      } catch (e) {
        console.warn('Failed to save creds from welcome:', e);
      }
    }
  }

  welcomeStep++;
  renderWelcomeStep();
});

$('welcome-skip')?.addEventListener('click', async () => {
  await completeWelcome();
});

async function completeWelcome() {
  const cookie = $('welcome-cookie-input')?.value?.trim();
  if (cookie && renderedConfig) {
    renderedConfig.cookie = cookie;
    renderedConfig.stoken = $('welcome-stoken-input')?.value?.trim() || renderedConfig.stoken;
    renderedConfig.uid = $('welcome-uid-input')?.value?.trim() || renderedConfig.uid;
    renderedConfig.data_dir = currentDataDir;
    renderedConfig.first_run_done = true;
    try {
      await invoke('save_config', { newConfig: renderedConfig });
    } catch (e) {
      console.warn('Save on complete failed:', e);
    }
  } else {
    try {
      await invoke('set_data_dir', { dataDir: currentDataDir });
      await invoke('complete_first_run');
    } catch (e) {
      console.warn('Complete first run save failed:', e);
    }
  }

  hideWelcome();
  loadData();
}

// ── Listen for tray "show-welcome" event ──
listen('show-welcome', () => {
  showWelcome();
});

// ── Listen for login cookie capture ──
listen('login-cookies-captured', async (event) => {
  const data = event.payload;
  if (data.cookie) {
    const cookeInp = $('welcome-cookie-input');
    if (cookeInp) cookeInp.value = data.cookie;
    if (data.stoken) {
      const stokenInp = $('welcome-stoken-input');
      if (stokenInp) stokenInp.value = data.stoken;
    }
    if (data.uid) {
      const uidInp = $('welcome-uid-input');
      if (uidInp) uidInp.value = data.uid;
    }
    const mainCookie = $('input-cookie');
    if (mainCookie) mainCookie.value = data.cookie;
    const mainStoken = $('input-stoken');
    if (mainStoken && data.stoken) mainStoken.value = data.stoken;
    const mainUid = $('input-uid');
    if (mainUid && data.uid) mainUid.value = data.uid;
    // Reload config and update settings summary
    try {
      config = await invoke('load_env_config');
    } catch {}
    await loadSettingsForm();
    updateSettingsSummary();
  }
});

// ── Check first run after startup ──
const originalLoadData = loadData;
loadData = async function () {
  await originalLoadData();
  try {
    const status = await invoke('check_first_run');
    if (status.needs_onboarding) {
      setTimeout(() => showWelcome(), 300);
    }
  } catch (e) {
    console.warn('First run check failed:', e);
  }
};
