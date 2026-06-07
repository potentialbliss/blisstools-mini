// ─── CONFIG ────────────────────────────────────────────────────
const WEBHOOK_URL = 'https://blisstools.online/webhook/mini-schedule';
const STATUS_URL = 'https://blisstools.online/webhook/mini-status';
const DAYS_LOOKAHEAD = 14;
const STATUS_FETCH_INTERVAL = 5000; // 5 seconds

const TABS = ['reels-shorts', 'stories', 'feed'];
const DAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Tab configuration for dynamic rendering
const TAB_CONFIG = {
  'reels-shorts': {
    label: 'Reels + Shorts',
    platforms: [
      { id: 'reel', icon: '▶', name: 'Instagram Reel', tag: 'video · 9:16' },
      { id: 'short', icon: '▷', name: 'YouTube Short', tag: 'video · 9:16' }
    ],
    defaultDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    defaultTime: '09:00',
    timezone: 'America/Los_Angeles'
  },
  stories: {
    label: 'Stories',
    platforms: [
      { id: 'story', icon: '◎', name: 'IG Story', tag: 'video · 9:16' },
      { id: 'story_photo', icon: '◎', name: 'IG Story', tag: 'photo · 9:16' }
    ],
    defaultDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    defaultTime: '12:00',
    timezone: 'America/Los_Angeles',
    note: 'Drop photos or videos — pipeline detects type automatically'
  },
  feed: {
    label: 'Feed',
    platforms: [
      { id: 'feed', icon: '⊞', name: 'IG Main Feed', tag: 'photo · 4:5' }
    ],
    defaultDays: ['Mon', 'Wed', 'Fri'],
    defaultTime: '10:00',
    timezone: 'America/Los_Angeles',
    note: 'Crop photos to 4:5 (1080×1350) before uploading — use your phone\'s crop tool'
  }
};

// State
let enabled = true;
let currentTab = 'reels-shorts';
let statusFetchInterval;

// ─── INITIALIZATION ────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  renderTabPanels();
  attachEventListeners();
  loadAllState();
  updateAllNextPosts();
  updateStatusBar();
  fetchStatus();
  startStatusPolling();
});

// ─── DYNAMIC RENDERING ────────────────────────────────────────
function renderTabPanels() {
  const container = document.getElementById('tab-panels');
  
  TABS.forEach((tab, index) => {
    const config = TAB_CONFIG[tab];
    const panel = document.createElement('div');
    panel.className = 'tab-panel';
    panel.id = `panel-${tab}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `tab-${tab}`);
    panel.setAttribute('aria-hidden', index !== 0 ? 'true' : 'false');

    // Platforms section
    const platformsHtml = `
      <div class="section">
        <div class="section-label">Platforms</div>
        <div class="platform-list">
          ${config.platforms.map(p => `
            <div class="platform-row" data-tab="${tab}" data-platform="${p.id}" data-active="true">
              <div class="platform-left">
                <div class="platform-icon">${p.icon}</div>
                <div class="platform-name">${p.name} <span class="platform-tag">${p.tag}</span></div>
              </div>
              <div class="platform-check"></div>
            </div>
          `).join('')}
        </div>
        ${config.note ? `<div class="timezone-note" style="margin-top:8px;">${config.note}</div>` : ''}
      </div>
    `;

    // Days section
    const daysHtml = `
      <div class="section">
        <div class="section-label">Post days</div>
        <div class="day-grid" id="days-${tab}">
          ${DAY_NAMES.map(day => {
            const isActive = config.defaultDays.includes(day);
            return `
              <div class="day-btn" data-day="${day}" data-active="${isActive}">
                <div class="day-label">${day}</div>
                <div class="day-check"></div>
              </div>
            `;
          }).join('')}
        </div>
        <div class="day-shortcuts">
          <button class="shortcut-btn" data-preset="all">Every day</button>
          <button class="shortcut-btn" data-preset="weekdays">Weekdays</button>
          <button class="shortcut-btn" data-preset="weekend">Weekend</button>
          <button class="shortcut-btn" data-preset="none">None</button>
        </div>
      </div>
    `;

    // Time section
    const timeHtml = `
      <div class="section">
        <div class="section-label">Post time</div>
        <input type="time" class="time-input" id="time-${tab}" value="${config.defaultTime}">
        <div class="timezone-note">${config.timezone}</div>
      </div>
    `;

    // Next post preview
    const nextPostHtml = `
      <div class="next-post-box">
        <div class="next-post-label">Next post — ${config.label}</div>
        <div class="next-post-value" id="next-${tab}">—</div>
      </div>
    `;

    // Save area
    const saveHtml = `
      <div class="save-area">
        <button class="save-btn" data-tab="${tab}">Save</button>
        <div class="save-feedback" id="feedback-${tab}"></div>
      </div>
    `;

    panel.innerHTML = platformsHtml + daysHtml + timeHtml + nextPostHtml + saveHtml;
    container.appendChild(panel);
  });

  // Add TikTok coming soon panel
  const tiktokPanel = document.createElement('div');
  tiktokPanel.className = 'tab-panel';
  tiktokPanel.id = 'panel-tiktok';
  tiktokPanel.setAttribute('role', 'tabpanel');
  tiktokPanel.setAttribute('aria-labelledby', 'tab-tiktok');
  tiktokPanel.setAttribute('aria-hidden', 'true');
  tiktokPanel.innerHTML = `
    <div class="coming-soon-panel">
      <div class="coming-soon-icon">🎵</div>
      <div class="coming-soon-title">TikTok — Coming Soon</div>
      <div class="coming-soon-sub">TikTok Video + TikTok Story scheduling<br>pending app review approval</div>
      <div class="coming-soon-badge">In Progress</div>
    </div>
  `;
  container.appendChild(tiktokPanel);
}

// ─── EVENT LISTENERS ───────────────────────────────────────────
function attachEventListeners() {
  // Tab switching with event delegation
  document.querySelectorAll('[role="tab"]').forEach((tab, index) => {
    const tabName = TABS[index] || 'tiktok';
    tab.id = `tab-${tabName}`;
    tab.addEventListener('click', (e) => {
      if (tab.getAttribute('aria-disabled') === 'true') return;
      switchTab(tabName, tab);
    });
  });

  // Toggle enabled with keyboard support
  document.querySelector('[role="switch"]').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleEnabled();
    }
  });

  // Platform toggles with event delegation
  document.addEventListener('click', (e) => {
    const platformRow = e.target.closest('.platform-row');
    if (platformRow) {
      togglePlatform(platformRow);
    }

    const dayBtn = e.target.closest('.day-btn');
    if (dayBtn) {
      const tab = dayBtn.closest('.tab-panel').id.replace('panel-', '');
      toggleDay(dayBtn, tab);
    }

    const shortcutBtn = e.target.closest('.shortcut-btn');
    if (shortcutBtn) {
      const tab = shortcutBtn.closest('.tab-panel').id.replace('panel-', '');
      const preset = shortcutBtn.dataset.preset;
      setDays(tab, preset);
    }

    const saveBtn = e.target.closest('.save-btn');
    if (saveBtn) {
      const tab = saveBtn.dataset.tab;
      saveTab(tab);
    }
  });

  // Time input changes
  document.addEventListener('change', (e) => {
    if (e.target.classList.contains('time-input')) {
      const tab = e.target.id.replace('time-', '');
      updateNextPost(tab);
    }
  });
}

// ─── TAB SWITCHING ─────────────────────────────────────────────
function switchTab(tab, btn) {
  currentTab = tab;
  
  // Update button states
  document.querySelectorAll('[role="tab"]').forEach((b, index) => {
    const tabName = TABS[index] || 'tiktok';
    b.setAttribute('aria-selected', tabName === tab);
  });

  // Update panel visibility
  document.querySelectorAll('.tab-panel').forEach((p) => {
    const isActive = p.id === `panel-${tab}`;
    p.setAttribute('aria-hidden', !isActive);
  });
}

// ─── PLATFORM MANAGEMENT ───────────────────────────────────────
function togglePlatform(row) {
  const isActive = row.getAttribute('data-active') === 'true';
  row.setAttribute('data-active', !isActive);
  updateStatusBar();
}

function getTabPlatforms(tab) {
  const platforms = [];
  document.querySelectorAll(`.platform-row[data-tab="${tab}"][data-active="true"]`).forEach(r => {
    platforms.push(r.dataset.platform);
  });
  return platforms;
}

// ─── DAY MANAGEMENT ────────────────────────────────────────────
function toggleDay(btn, tab) {
  const isActive = btn.getAttribute('data-active') === 'true';
  btn.setAttribute('data-active', !isActive);
  updateNextPost(tab);
}

function setDays(tab, preset) {
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const weekend = ['Sat', 'Sun'];
  
  document.querySelectorAll(`#days-${tab} .day-btn`).forEach(btn => {
    const day = btn.dataset.day;
    let active = false;
    
    if (preset === 'all') active = true;
    else if (preset === 'weekdays') active = weekdays.includes(day);
    else if (preset === 'weekend') active = weekend.includes(day);
    else if (preset === 'none') active = false;
    
    btn.setAttribute('data-active', active);
  });
  
  updateNextPost(tab);
}

function getTabDays(tab) {
  const days = [];
  document.querySelectorAll(`#days-${tab} .day-btn[data-active="true"]`).forEach(b => {
    days.push(b.dataset.day);
  });
  return days;
}

// ─── AUTO-POST TOGGLE ──────────────────────────────────────────
function toggleEnabled() {
  enabled = !enabled;
  
  const sw = document.getElementById('toggle-switch');
  const dot = document.getElementById('status-dot');
  const st = document.getElementById('status-text');
  
  sw.setAttribute('data-enabled', enabled);
  dot.classList.toggle('idle', !enabled);
  
  if (enabled) {
    st.innerHTML = '<span class="status-dot" id="status-dot"></span>Active';
    st.className = 'status-value green';
  } else {
    st.innerHTML = '<span class="status-dot idle" id="status-dot"></span>Paused';
    st.className = 'status-value dim';
  }
  
  updateAllNextPosts();
  
  // Update aria-checked
  document.querySelector('[role="switch"]').setAttribute('aria-checked', enabled);
}

function handleToggleKeydown(event) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    toggleEnabled();
  }
}

// ─── NEXT POST CALCULATION ────────────────────────────────────
function calculateNextPost(days, time) {
  if (!enabled || days.length === 0 || !time) {
    return null;
  }

  const selectedNums = days.map(d => DAY_MAP[d]).sort((a, b) => a - b);
  const now = new Date();
  const [hh, mm] = time.split(':').map(Number);
  let next = null;

  for (let i = 0; i < DAYS_LOOKAHEAD; i++) {
    const c = new Date(now);
    c.setDate(now.getDate() + i);
    c.setHours(hh, mm, 0, 0);
    
    if (c <= now) continue;
    if (selectedNums.includes(c.getDay())) {
      next = c;
      break;
    }
  }

  return next;
}

function formatNextPostLabel(next) {
  if (!next) return '—';

  const now = new Date();
  const isToday = next.toDateString() === now.toDateString();
  const isTomorrow = next.toDateString() === new Date(now.getTime() + 86400000).toDateString();
  const timeStr = next.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (isToday) return `Today ${timeStr}`;
  if (isTomorrow) return `Tomorrow ${timeStr}`;
  return `${DAY_NAMES[next.getDay()]} ${next.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${timeStr}`;
}

function updateNextPost(tab) {
  const days = getTabDays(tab);
  const timeVal = document.getElementById(`time-${tab}`)?.value;
  const el = document.getElementById(`next-${tab}`);

  if (!el) return;

  if (!enabled || days.length === 0 || !timeVal) {
    el.textContent = 'Paused';
    el.className = 'next-post-value';
    return;
  }

  const next = calculateNextPost(days, timeVal);
  const label = formatNextPostLabel(next);

  el.textContent = label;
  el.className = `next-post-value ${next ? 'has-next' : ''}`;
}

function updateAllNextPosts() {
  TABS.forEach(tab => updateNextPost(tab));
  updateStatusBar();
}

// ─── STATUS BAR ────────────────────────────────────────────────
function updateStatusBar() {
  const activeTabs = TABS.filter(tab => 
    getTabPlatforms(tab).length > 0 && getTabDays(tab).length > 0
  );
  
  document.getElementById('active-tabs-stat').textContent = `${activeTabs.length} / 3`;

  // Find earliest next post across all tabs
  let earliest = null;
  
  TABS.forEach(tab => {
    const days = getTabDays(tab);
    const timeVal = document.getElementById(`time-${tab}`)?.value;
    
    if (!enabled || days.length === 0 || !timeVal) return;
    
    const next = calculateNextPost(days, timeVal);
    if (next && (!earliest || next < earliest)) {
      earliest = next;
    }
  });

  const statEl = document.getElementById('next-post-stat');
  const label = formatNextPostLabel(earliest);
  
  statEl.textContent = label;
  statEl.className = earliest ? 'status-value' : 'status-value dim';
}

// ─── SAVE PER TAB ──────────────────────────────────────────────
async function saveTab(tab) {
  const days = getTabDays(tab);
  const time = document.getElementById(`time-${tab}`).value;
  const platforms = getTabPlatforms(tab);
  const feedbackEl = document.getElementById(`feedback-${tab}`);

  // Validation
  if (days.length === 0) {
    showFeedback(tab, 'Select at least one day', false);
    return;
  }
  if (!time) {
    showFeedback(tab, 'Set a post time', false);
    return;
  }
  if (platforms.length === 0) {
    showFeedback(tab, 'Enable at least one platform', false);
    return;
  }

  const payload = {
    tab,
    enabled,
    days,
    time,
    platforms,
    savedAt: new Date().toISOString()
  };

  // Save locally
  try {
    const allState = JSON.parse(localStorage.getItem('mini_v2') || '{}');
    allState[tab] = payload;
    localStorage.setItem('mini_v2', JSON.stringify(allState));
  } catch (e) {
    console.error('LocalStorage error:', e);
  }

  // Send to webhook
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showFeedback(tab, 'Saved ✓', true);
  } catch (e) {
    console.error('Webhook error:', e);
    showFeedback(tab, 'Saved locally — webhook unreachable', false);
  }
}

function showFeedback(tab, message, isSuccess) {
  const el = document.getElementById(`feedback-${tab}`);
  if (!el) return;

  el.textContent = message;
  el.className = `save-feedback visible ${isSuccess ? 'success' : 'error'}`;

  setTimeout(() => {
    el.classList.remove('visible');
  }, 3000);
}

// ─── STATE MANAGEMENT ──────────────────────────────────────────
function loadAllState() {
  try {
    const allState = JSON.parse(localStorage.getItem('mini_v2') || '{}');

    TABS.forEach(tab => {
      const state = allState[tab];
      if (!state) return;

      // Restore days
      if (state.days && Array.isArray(state.days)) {
        document.querySelectorAll(`#days-${tab} .day-btn`).forEach(btn => {
          const isActive = state.days.includes(btn.dataset.day);
          btn.setAttribute('data-active', isActive);
        });
      }

      // Restore time
      if (state.time) {
        const timeInput = document.getElementById(`time-${tab}`);
        if (timeInput) timeInput.value = state.time;
      }

      // Restore platforms
      if (state.platforms && Array.isArray(state.platforms)) {
        document.querySelectorAll(`.platform-row[data-tab="${tab}"]`).forEach(row => {
          const isActive = state.platforms.includes(row.dataset.platform);
          row.setAttribute('data-active', isActive);
        });
      }
    });

    // Restore enabled state if present
    if (allState.globalEnabled !== undefined) {
      enabled = allState.globalEnabled;
      const sw = document.getElementById('toggle-switch');
      if (sw) sw.setAttribute('data-enabled', enabled);
    }
  } catch (e) {
    console.error('Error loading state:', e);
  }
}

// ─── STATUS POLLING ────────────────────────────────────────────
function fetchStatus() {
  fetch(STATUS_URL)
    .then(res => res.json())
    .then(data => {
      console.log('Status:', data);
      // Handle status updates if needed
    })
    .catch(e => console.error('Status fetch error:', e));
}

function startStatusPolling() {
  statusFetchInterval = setInterval(fetchStatus, STATUS_FETCH_INTERVAL);
}

function stopStatusPolling() {
  if (statusFetchInterval) {
    clearInterval(statusFetchInterval);
  }
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  stopStatusPolling();
});
