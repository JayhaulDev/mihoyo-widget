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

  // Sign
  const sv = $('sign-value');
  sv.textContent = d.has_signed ? '已签到' : '未签到';
  sv.className = `item-value ${d.has_signed ? 'ok' : 'warn'}`;

  // Expedition
  if (d.total_expedition_num > 0) {
    $('expedition-value').textContent = `${d.accepted_expedition_num}/${d.total_expedition_num}`;
    $('expedition-value').className = `item-value ${d.accepted_expedition_num === 0 ? 'ok' : ''}`;
  }

  // Rogue (周期演算)
  if (d.rogue_tourn_weekly_max > 0) {
    $('rogue-value').textContent = `${d.rogue_tourn_weekly_cur}/${d.rogue_tourn_weekly_max}`;
    $('rogue-value').className = `item-value ${d.rogue_tourn_weekly_cur === 0 ? 'warn' : 'ok'}`;
  }

  // Cocoon (历战余响)
  if (d.weekly_cocoon_limit > 0) {
    $('cocoon-value').textContent = `${d.weekly_cocoon_cnt}/${d.weekly_cocoon_limit}`;
    $('cocoon-value').className = `item-value ${d.weekly_cocoon_cnt > 0 ? '' : 'ok'}`;
  }

  // Daily training
  if (d.max_train_score > 0) {
    $('train-value').textContent = `${d.current_train_score}/${d.max_train_score}`;
    $('train-value').className = `item-value ${d.current_train_score > 0 ? '' : 'warn'}`;
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
}

function renderSeasonRow() {
  const el = $('season-info');
  if (!el) return;
  if (!periodicAct?.acts?.length) {
    el.textContent = '';
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');
  const parts = periodicAct.acts
    .map((a) => {
      const name = a.season_name || '';
      const lvl = a.season_level || '';
      if (a.division_level && a.division_level !== '0') {
        return `${name || '财富造物主'} · 段位${a.division_level}`;
      }
      return name ? `${name} · Lv.${lvl}` : '';
    })
    .filter(Boolean);
  el.textContent = parts.join('  │  ');
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
  const card = document.querySelector(`#${prefix}-stat`)?.closest('.battle-card');
  if (!card) return;
  const statEl = $(`${prefix}-stat`);
  const dateEl = card.querySelector('.battle-card-date');
  const progressEl = card.querySelector('.battle-card-progress');

  if (!data || !data.has_data) {
    statEl.textContent = isPeak ? '未开放' : '暂无数据';
    statEl.style.color = 'var(--text-muted)';
    if (dateEl) dateEl.textContent = '';
    if (progressEl) progressEl.style.display = 'none';
    return;
  }

  const cur = isPeak ? data.cur_floor : data.star_num;
  const max = isPeak ? data.max_floor : data.max_star;
  const label = isPeak ? '层' : '星';

  statEl.textContent = `${cur}/${max}${label}`;
  statEl.style.color = cur >= max ? 'var(--green)' : 'var(--orange)';

  // Stars for non-peak
  if (!isPeak) {
    const starEl = card.querySelector('.battle-card-stars');
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
  if (isPeak && progressEl) {
    progressEl.style.display = 'flex';
    const fill = progressEl.querySelector('.challenge-bar-fill');
    const pct = max > 0 ? cur / max : 0;
    fill.style.width = `${Math.min(pct * 100, 100)}%`;
    fill.className = 'challenge-bar-fill' + (cur >= max ? ' done' : pct > 0.5 ? ' half' : '');
  } else if (progressEl) {
    progressEl.style.display = 'none';
  }
}

function renderProgressBar(id, cur, max, label) {
  const el = document.getElementById(id);
  if (!el) return;
  const labelEl = el.parentElement?.querySelector('.weekly-label');
  if (labelEl) labelEl.textContent = label;
  const valEl = el.parentElement?.querySelector('.weekly-value');
  if (valEl) valEl.textContent = `${cur}/${max}`;
  const fill = el.querySelector('.weekly-bar-fill');
  const pct = max > 0 ? cur / max : 0;
  fill.style.width = `${Math.min(pct * 100, 100)}%`;
  fill.className = 'weekly-bar-fill' + (cur >= max ? ' done' : pct > 0 ? '' : ' empty');
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
  if (act.act_type === '双倍' || act.act_type === '签到') card.classList.add('banner-card-event');

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

  top.appendChild(tag);
  top.appendChild(name);

  // Status badge
  if (act.act_status) {
    const status = document.createElement('span');
    status.className = 'banner-status';
    if (act.act_status === '未开始') status.classList.add('pending');
    else if (act.act_status === '已完成') status.classList.add('done');
    else status.classList.add('active');
    status.textContent = act.act_status;
    top.appendChild(status);
  }

  card.appendChild(top);

  // Time row
  const timeRow = document.createElement('div');
  timeRow.className = 'banner-info-row';

  const dateRange = document.createElement('span');
  dateRange.className = 'banner-info-text';
  dateRange.textContent = act.date_range || '';

  const days = document.createElement('span');
  days.className = 'banner-days';
  let dl = act.days_left;
  if (dl == null && act.end_time) {
    try {
      dl = Math.ceil((new Date(act.end_time).getTime() - Date.now()) / 86400000);
    } catch {}
  }
  if (dl > 3) {
    days.textContent = `剩${dl}天`;
    days.className = 'banner-days ok';
  } else if (dl > 0) {
    days.textContent = `剩${dl}天`;
    days.className = 'banner-days warn';
  } else if (dl === 0) {
    days.textContent = '最后一天';
    days.className = 'banner-days urgent';
  } else {
    days.textContent = '已结束';
    days.className = 'banner-days over';
  }

  timeRow.appendChild(dateRange);
  timeRow.appendChild(days);
  card.appendChild(timeRow);

  // Progress row (双倍活动)
  if (act.total_progress > 0) {
    const progRow = document.createElement('div');
    progRow.className = 'banner-info-row';
    const progLabel = document.createElement('span');
    progLabel.className = 'banner-info-text';
    progLabel.textContent = `剩余次数`;
    const progVal = document.createElement('span');
    progVal.className = 'banner-days ok';
    progVal.textContent = `${act.current_progress}/${act.total_progress}`;
    progRow.appendChild(progLabel);
    progRow.appendChild(progVal);
    card.appendChild(progRow);

    // Progress bar
    const progBar = document.createElement('div');
    progBar.className = 'banner-progress';
    const fill = document.createElement('div');
    fill.className = 'banner-progress-fill plenty';
    fill.style.width = `${(act.current_progress / act.total_progress) * 100}%`;
    progBar.appendChild(fill);
    card.appendChild(progBar);
  } else {
    // Time progress bar
    const progBar = document.createElement('div');
    progBar.className = 'banner-progress';
    const fill = document.createElement('div');
    fill.className = 'banner-progress-fill';
    let pct = 0;
    if (
      act.end_time &&
      act.begin_time &&
      act.end_time.length >= 10 &&
      act.begin_time.length >= 10
    ) {
      try {
        const total = new Date(act.end_time).getTime() - new Date(act.begin_time).getTime();
        const elapsed = Date.now() - new Date(act.begin_time).getTime();
        if (total > 0) pct = Math.min(Math.max(elapsed / total, 0), 1);
      } catch {}
    }
    fill.style.width = `${(1 - pct) * 100}%`;
    if (dl > 3) fill.className = 'banner-progress-fill plenty';
    else if (dl > 0) fill.className = 'banner-progress-fill warn';
    else if (dl === 0) fill.className = 'banner-progress-fill urgent';
    else fill.className = 'banner-progress-fill over';
    progBar.appendChild(fill);
    card.appendChild(progBar);
  }

  // Description
  if (act.panel_desc) {
    const desc = document.createElement('div');
    desc.className = 'banner-desc';
    desc.textContent = act.panel_desc;
    card.appendChild(desc);
  }

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
    h.className = 'tab-section-title';
    h.textContent = '角色 / 光锥';
    list.appendChild(h);
    for (const act of pools) list.appendChild(makeBannerCard(act));
  }
  if (events.length) {
    const h = document.createElement('div');
    h.className = 'tab-section-title';
    h.textContent = '限时活动';
    list.appendChild(h);
    for (const act of events) list.appendChild(makeBannerCard(act));
  }
}

function renderRogueArchive() {
  const el = $('archive-content');
  if (!el) return;
  const arch = rogueArchive;
  if (!arch || (!arch.nous_progress && !arch.magic_linear && !arch.locust_narrow)) {
    el.innerHTML = '<div class="archive-empty">暂无数据</div>';
    $('archive-section')?.classList.add('empty');
    return;
  }
  $('archive-section')?.classList.remove('empty');

  let html = '';
  if (arch.nous_progress) {
    html += `<div class="archive-item">
      <span class="archive-name">智识令使</span>
      <span class="archive-stat">${arch.nous_progress}</span>
      <span class="archive-sub">奇迹 ${arch.nous_miracle} · 神经 ${arch.nous_nerve}</span>
    </div>`;
  }
  if (arch.magic_linear) {
    html += `<div class="archive-item">
      <span class="archive-name">黄金与机械</span>
      <span class="archive-stat">线形树 ${arch.magic_linear}</span>
      <span class="archive-sub">秘闻 ${arch.magic_compendium} · 隐藏 ${arch.magic_secrets}</span>
    </div>`;
  }
  if (arch.locust_narrow > 0) {
    html += `<div class="archive-item">
      <span class="archive-name">寰宇蝗灾</span>
      <span class="archive-stat">窄道 ${arch.locust_narrow}</span>
      <span class="archive-sub">奇迹 ${arch.locust_miracle} · 事件 ${arch.locust_event}</span>
    </div>`;
    if (arch.locust_destinies?.length) {
      html += '<div class="archive-destinies">';
      for (const d of arch.locust_destinies) {
        html += `<span class="destiny-tag">${d.name} Lv.${d.level}</span>`;
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
    r = 44,
    lw = 5;

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
function startRecoveryTimer(secs) {
  if (recoveryInterval) clearInterval(recoveryInterval);
  if (secs <= 0) {
    $('recovery-time').textContent = '已满';
    return;
  }
  let r = secs;
  const tick = () => {
    if (r <= 0) {
      $('recovery-time').textContent = '已满';
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

// ── Event wiring ──
document.querySelectorAll('.tab-item').forEach((el) => {
  el.addEventListener('click', () => switchTab(el.dataset.tab));
});

$('settings-btn').addEventListener('click', () => switchTab('settings'));
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  switchTab('settings');
});

$('settings-save').addEventListener('click', async () => {
  const cookie = $('input-cookie').value.trim();
  const uid = $('input-uid').value.trim();
  if (!cookie) {
    alert('Cookie 不能为空');
    return;
  }
  if (uid && !/^\d+$/.test(uid)) {
    alert('UID 格式不正确（应为纯数字）');
    return;
  }
  const nc = {
    cookie,
    stoken: $('input-stoken').value,
    uid,
    stuid: $('input-stuid').value,
    mid: $('input-mid').value,
    device_id: config?.device_id || '',
    device_fp: config?.device_fp || '',
    seed_id: config?.seed_id || '',
    seed_time: config?.seed_time || '',
    region: config?.region || 'prod_gf_cn',
    poll_interval_secs: config?.poll_interval_secs || 90,
  };
  try {
    await invoke('save_config', { newConfig: nc });
    isSettingsOpen = false;
    currentTab = previousTab;
    updateTabBar();
    renderTab();
    config = nc;
    await doRefresh();
  } catch (e) {
    console.error('保存失败:', e);
    alert('保存失败: ' + e);
  }
});

$('settings-close').addEventListener('click', () => {
  isSettingsOpen = false;
  currentTab = previousTab;
  updateTabBar();
  renderTab();
});

$('refresh-btn').addEventListener('click', doRefresh);
$('theme-btn')?.addEventListener('click', toggleTheme);

$('banner-toggle').addEventListener('click', () => {
  $('banner-list').classList.toggle('hidden');
  $('banner-icon').classList.toggle('open');
});

$('archive-toggle')?.addEventListener('click', () => {
  $('archive-content')?.classList.toggle('hidden');
  $('archive-icon')?.classList.toggle('open');
});

// ── Init ──
applyTheme();
loadData();
