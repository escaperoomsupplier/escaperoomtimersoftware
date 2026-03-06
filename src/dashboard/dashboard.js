// ========================================
// Dashboard Controller
// ========================================

let currentRoom = null;
let gameState = 'idle'; // idle, running, paused, ended
let timerSeconds = 0;
let hintsRemaining = 0;
let hints = [];
let timerInterval = null;

// ---- Theme ----

function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
}

document.getElementById('themeToggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});

initTheme();

// ---- Navigation ----

const views = {
  rooms: document.getElementById('view-rooms'),
  setup: document.getElementById('view-setup'),
  control: document.getElementById('view-control'),
  scores: document.getElementById('view-scores')
};

const navItems = document.querySelectorAll('.nav-item[data-view]');

function showView(viewName) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  navItems.forEach(n => n.classList.remove('active'));

  if (views[viewName]) views[viewName].classList.add('active');

  const activeNav = document.querySelector(`.nav-item[data-view="${viewName}"]`);
  if (activeNav) activeNav.classList.add('active');

  if (viewName === 'scores') loadScores();
  if (viewName !== 'control') stopUupcPolling();
}

navItems.forEach(item => {
  item.addEventListener('click', () => showView(item.dataset.view));
});

// ---- Clock ----

function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  document.getElementById('clockDisplay').textContent = `${h}:${m}`;
}
setInterval(updateClock, 1000);
updateClock();

// ---- Rooms ----

async function loadRooms() {
  const rooms = await window.api.listRooms();
  const grid = document.getElementById('roomsGrid');

  if (rooms.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
        No rooms yet<br>Create your first room to get started
      </div>`;
    return;
  }

  grid.innerHTML = rooms.map(room => `
    <div class="room-card">
      <div class="room-name">${room.name}</div>
      <div class="room-meta">
        <span class="room-stat"><strong>${room.duration}</strong> min</span>
        <span class="room-stat"><strong>${room.maxHints}</strong> hints</span>
      </div>
      <div class="room-actions">
        <button class="btn btn-primary btn-sm btn-open-room" data-room="${room.name}">Open Room</button>
        <button class="btn btn-ghost btn-sm btn-edit-room" data-room="${room.name}">Edit</button>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.btn-open-room').forEach(btn => {
    btn.addEventListener('click', () => openRoom(btn.dataset.room));
  });
  grid.querySelectorAll('.btn-edit-room').forEach(btn => {
    btn.addEventListener('click', () => editRoom(btn.dataset.room));
  });
}

async function openRoom(roomName) {
  currentRoom = await window.api.getRoom(roomName);
  if (!currentRoom) return;

  timerSeconds = currentRoom.duration * 60;
  hintsRemaining = currentRoom.maxHints;
  gameState = 'idle';

  hints = await window.api.getHints(roomName, currentRoom.defaultLanguage || 'English');
  await loadAlertTones(roomName);

  document.getElementById('controlRoomName').textContent = currentRoom.name;
  updateTimerDisplay();
  updateHintsPanel();
  renderQuickActionsPanel();
  renderUupcPanel();
  startUupcPolling();
  updateStatusIndicator();

  window.api.updateConfig({
    roomName: currentRoom.name,
    duration: currentRoom.duration,
    maxHints: currentRoom.maxHints,
    countdownType: currentRoom.countdownType || 'S0',
    countdownEffect: currentRoom.countdownEffect || '',
    successMessage: currentRoom.successMessage,
    failMessage: currentRoom.failMessage,
    theme: currentRoom.theme,
    bgMedia: currentRoom.bgMedia || '',
    scheduledEvents: currentRoom.scheduledEvents || []
  });

  showView('control');
}

async function editRoom(roomName) {
  const room = await window.api.getRoom(roomName);
  if (!room) return;

  document.getElementById('setupName').value = room.name;
  document.getElementById('setupDuration').value = room.duration;
  document.getElementById('setupMaxHints').value = room.maxHints;
  document.getElementById('setupDescription').value = room.description || '';
  document.getElementById('setupSuccessMsg').value = room.successMessage || 'Congratulations! You escaped!';
  document.getElementById('setupFailMsg').value = room.failMessage || 'Time is up! You are trapped!';
  document.getElementById('setupCountdownType').value = room.countdownType || 'S0';
  document.getElementById('setupCountdownEffect').value = room.countdownEffect || '';
  setThemeFields(room.theme);
  document.getElementById('setupDefaultLang').value = room.defaultLanguage || 'English';
  document.getElementById('setupBgMedia').value = room.bgMedia || '';

  scheduledEvents = (room.scheduledEvents || []).map(e => ({ ...e }));
  renderEventsTable();
  quickActions = (room.quickActions || []).map(q => ({ ...q }));
  renderQuickActionsTable();
  uupcControllers = (room.uupcControllers || []).map(c => ({ ...c }));
  renderUupcTable();

  showView('setup');
}

// ---- New / Save Room ----

document.getElementById('btnNewRoom').addEventListener('click', () => {
  document.getElementById('setupName').value = '';
  document.getElementById('setupDuration').value = 60;
  document.getElementById('setupMaxHints').value = 5;
  document.getElementById('setupDescription').value = '';
  document.getElementById('setupSuccessMsg').value = 'Congratulations! You escaped!';
  document.getElementById('setupFailMsg').value = 'Time is up! You are trapped!';
  document.getElementById('setupCountdownType').value = 'S0';
  document.getElementById('setupCountdownEffect').value = '';
  setThemeFields({});
  document.getElementById('setupDefaultLang').value = 'English';
  document.getElementById('setupBgMedia').value = '';
  scheduledEvents = [];
  renderEventsTable();
  quickActions = [];
  renderQuickActionsTable();
  uupcControllers = [];
  renderUupcTable();
  showView('setup');
});

document.getElementById('btnSaveRoom').addEventListener('click', async () => {
  const name = document.getElementById('setupName').value.trim();
  if (!name) return;

  await window.api.saveRoom({
    name,
    duration: parseInt(document.getElementById('setupDuration').value, 10),
    maxHints: parseInt(document.getElementById('setupMaxHints').value, 10),
    description: document.getElementById('setupDescription').value,
    successMessage: document.getElementById('setupSuccessMsg').value,
    failMessage: document.getElementById('setupFailMsg').value,
    countdownType: document.getElementById('setupCountdownType').value,
    countdownEffect: document.getElementById('setupCountdownEffect').value,
    theme: getThemeFields(),
    defaultLanguage: document.getElementById('setupDefaultLang').value || 'English',
    bgMedia: document.getElementById('setupBgMedia').value.trim(),
    scheduledEvents: scheduledEvents.filter(e => e.param),
    quickActions: quickActions.filter(q => q.label && q.param),
    uupcControllers: uupcControllers.filter(c => c.ip)
  });

  await loadRooms();
  showView('rooms');
});

document.getElementById('btnCancelSetup').addEventListener('click', () => showView('rooms'));

// ---- UUPC Editor (Room Setup) ----

let uupcControllers = [];

function renderUupcTable() {
  const tbody = document.getElementById('uupcBody');
  const empty = document.getElementById('uupcEmpty');

  tbody.innerHTML = uupcControllers.map((c, i) => `
    <tr data-index="${i}">
      <td><input type="text" class="uupc-name-input" value="${c.name || ''}" placeholder="e.g. Main Puzzle"></td>
      <td><input type="text" class="uupc-ip-input" value="${c.ip || ''}" placeholder="192.168.1.100"></td>
      <td>
        <button class="btn-remove-event" title="Remove">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </td>
    </tr>
  `).join('');

  empty.style.display = uupcControllers.length === 0 ? '' : 'none';

  tbody.querySelectorAll('tr').forEach(row => {
    const idx = parseInt(row.dataset.index, 10);
    row.querySelector('.uupc-name-input').addEventListener('change', (e) => {
      uupcControllers[idx].name = e.target.value;
    });
    row.querySelector('.uupc-ip-input').addEventListener('change', (e) => {
      uupcControllers[idx].ip = e.target.value.trim();
    });
    row.querySelector('.btn-remove-event').addEventListener('click', () => {
      uupcControllers.splice(idx, 1);
      renderUupcTable();
    });
  });
}

document.getElementById('btnAddUupc').addEventListener('click', () => {
  uupcControllers.push({ name: '', ip: '' });
  renderUupcTable();
});

// ---- UUPC Status Panel (Control View) ----

const MACHINE_STATES = {
  0: { label: 'Armed', cls: 'uupc-state-armed' },
  1: { label: 'In Progress', cls: 'uupc-state-inprogress' },
  2: { label: 'Win', cls: 'uupc-state-win' },
  3: { label: 'Learning', cls: 'uupc-state-learning' }
};

let uupcPollingInterval = null;
let uupcStates = {};

function renderUupcPanel() {
  const controllers = currentRoom?.uupcControllers || [];
  const list = document.getElementById('uupcStatusList');
  const countBadge = document.getElementById('uupcCount');

  countBadge.textContent = controllers.length;

  if (controllers.length === 0) {
    list.innerHTML = '<div class="empty-state" style="padding:16px;font-size:13px">No controllers configured for this room</div>';
    stopUupcPolling();
    return;
  }

  list.innerHTML = controllers.map((c, i) => {
    const state = uupcStates[c.ip];
    const online = state && state.ok;
    const machineVal = online ? (state.machine?.value ?? state.machine ?? 0) : -1;
    const machineInfo = MACHINE_STATES[machineVal] || { label: 'Offline', cls: 'uupc-state-offline' };

    let inputsHtml = '';
    let outputsHtml = '';

    if (online && state.inputs) {
      const inputs = Array.isArray(state.inputs) ? state.inputs : Object.values(state.inputs);
      inputsHtml = `
        <div class="uupc-ports-label">Inputs</div>
        <div class="uupc-ports">${inputs.map((v, p) =>
          `<div class="uupc-port ${v ? 'active' : ''}" title="Input ${p + 1}">${p + 1}</div>`
        ).join('')}</div>`;
    }

    if (online && state.outputs) {
      const outputs = Array.isArray(state.outputs) ? state.outputs : Object.values(state.outputs);
      outputsHtml = `
        <div class="uupc-ports-label">Outputs</div>
        <div class="uupc-ports">${outputs.map((v, p) =>
          `<div class="uupc-port ${v ? 'active' : ''}" title="Output ${p + 1}">${p + 1}</div>`
        ).join('')}</div>`;
    }

    return `
      <div class="uupc-device ${online ? 'uupc-online' : 'uupc-offline'}" data-uupc-index="${i}">
        <div class="uupc-device-header">
          <div class="uupc-device-name">
            <span class="uupc-dot"></span>
            ${c.name || 'Controller ' + (i + 1)}
          </div>
          <span class="uupc-state-badge ${machineInfo.cls}">${machineInfo.label}</span>
        </div>
        <div class="uupc-device-ip">${c.ip}</div>
        ${inputsHtml}
        ${outputsHtml}
        <div class="uupc-controls">
          <button class="btn btn-success btn-sm uupc-btn-win" data-ip="${c.ip}" title="Set puzzle to Win state">Win</button>
          <button class="btn btn-secondary btn-sm uupc-btn-arm" data-ip="${c.ip}" title="Arm (reset) puzzle">Arm</button>
          <button class="btn btn-warning btn-sm uupc-btn-progress" data-ip="${c.ip}" title="Set to In Progress">Start</button>
        </div>
      </div>
    `;
  }).join('');

  // Bind control buttons
  list.querySelectorAll('.uupc-btn-win').forEach(btn => {
    btn.addEventListener('click', () => uupcSetState(btn.dataset.ip, 2));
  });
  list.querySelectorAll('.uupc-btn-arm').forEach(btn => {
    btn.addEventListener('click', () => uupcSetState(btn.dataset.ip, 0));
  });
  list.querySelectorAll('.uupc-btn-progress').forEach(btn => {
    btn.addEventListener('click', () => uupcSetState(btn.dataset.ip, 1));
  });
}

async function uupcSetState(ip, value) {
  await window.api.uupcSetMachineState(ip, value);
  // Immediately poll to update UI
  await pollUupcState(ip);
  renderUupcPanel();
}

async function pollUupcState(ip) {
  const result = await window.api.uupcGetState(ip);
  uupcStates[ip] = result;
}

async function pollAllUupc() {
  const controllers = currentRoom?.uupcControllers || [];
  if (controllers.length === 0) return;
  await Promise.all(controllers.map(c => pollUupcState(c.ip)));
  renderUupcPanel();
}

function startUupcPolling() {
  stopUupcPolling();
  pollAllUupc();
  uupcPollingInterval = setInterval(pollAllUupc, 2000);
}

function stopUupcPolling() {
  if (uupcPollingInterval) {
    clearInterval(uupcPollingInterval);
    uupcPollingInterval = null;
  }
}

// ---- Color Picker Sync ----

function syncColorPair(colorId, textId) {
  const color = document.getElementById(colorId);
  const text = document.getElementById(textId);
  color.addEventListener('input', () => { text.value = color.value; });
  text.addEventListener('change', () => {
    if (/^#[0-9a-fA-F]{6}$/.test(text.value)) color.value = text.value;
  });
}

syncColorPair('setupBgColor', 'setupBgColorText');
syncColorPair('setupTimerColor', 'setupTimerColorText');
syncColorPair('setupHintColor', 'setupHintColorText');

function setThemeFields(theme) {
  const t = theme || {};
  document.getElementById('setupBgColor').value = t.backgroundColor || '#000000';
  document.getElementById('setupBgColorText').value = t.backgroundColor || '#000000';
  document.getElementById('setupTimerColor').value = t.timerColor || '#00ffcc';
  document.getElementById('setupTimerColorText').value = t.timerColor || '#00ffcc';
  document.getElementById('setupHintColor').value = t.hintColor || '#ff9900';
  document.getElementById('setupHintColorText').value = t.hintColor || '#ff9900';
  document.getElementById('setupFont').value = t.fontFamily || 'Orbitron';
}

function getThemeFields() {
  return {
    backgroundColor: document.getElementById('setupBgColor').value,
    timerColor: document.getElementById('setupTimerColor').value,
    hintColor: document.getElementById('setupHintColor').value,
    fontFamily: document.getElementById('setupFont').value
  };
}

// ---- Scheduled Events Editor ----

let scheduledEvents = [];

function renderEventsTable() {
  const tbody = document.getElementById('eventsBody');
  const empty = document.getElementById('eventsEmpty');

  tbody.innerHTML = scheduledEvents.map((evt, i) => `
    <tr data-index="${i}">
      <td><input type="number" class="evt-minute" value="${evt.minute}" min="1" max="999" placeholder="Min"></td>
      <td>
        <select class="evt-action">
          <option value="playSound" ${evt.action === 'playSound' ? 'selected' : ''}>Play Sound</option>
          <option value="displayText" ${evt.action === 'displayText' ? 'selected' : ''}>Display Text</option>
          <option value="playVideo" ${evt.action === 'playVideo' ? 'selected' : ''}>Play Video</option>
        </select>
      </td>
      <td><input type="text" class="evt-param" value="${evt.param || ''}" placeholder="${evt.action === 'displayText' ? 'Message text...' : 'filename.mp3'}"></td>
      <td>
        <button class="btn-remove-event" title="Remove">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </td>
    </tr>
  `).join('');

  empty.style.display = scheduledEvents.length === 0 ? '' : 'none';

  // Bind change listeners
  tbody.querySelectorAll('tr').forEach(row => {
    const idx = parseInt(row.dataset.index, 10);
    row.querySelector('.evt-minute').addEventListener('change', (e) => {
      scheduledEvents[idx].minute = parseInt(e.target.value, 10) || 1;
    });
    row.querySelector('.evt-action').addEventListener('change', (e) => {
      scheduledEvents[idx].action = e.target.value;
      const paramInput = row.querySelector('.evt-param');
      paramInput.placeholder = e.target.value === 'displayText' ? 'Message text...' : 'filename.mp3';
    });
    row.querySelector('.evt-param').addEventListener('change', (e) => {
      scheduledEvents[idx].param = e.target.value;
    });
    row.querySelector('.btn-remove-event').addEventListener('click', () => {
      scheduledEvents.splice(idx, 1);
      renderEventsTable();
    });
  });
}

document.getElementById('btnAddEvent').addEventListener('click', () => {
  scheduledEvents.push({ minute: 30, action: 'displayText', param: '' });
  renderEventsTable();
});

// ---- Quick Actions Editor ----

let quickActions = [];

function renderQuickActionsTable() {
  const tbody = document.getElementById('quickActionsBody');
  const empty = document.getElementById('quickActionsEmpty');

  tbody.innerHTML = quickActions.map((qa, i) => `
    <tr data-index="${i}">
      <td><input type="text" class="qa-label" value="${qa.label || ''}" placeholder="Button label"></td>
      <td>
        <select class="qa-action">
          <option value="playSound" ${qa.action === 'playSound' ? 'selected' : ''}>Play Sound</option>
          <option value="displayText" ${qa.action === 'displayText' ? 'selected' : ''}>Display Text</option>
          <option value="playVideo" ${qa.action === 'playVideo' ? 'selected' : ''}>Play Video</option>
          <option value="addTime" ${qa.action === 'addTime' ? 'selected' : ''}>Add Time (sec)</option>
        </select>
      </td>
      <td><input type="text" class="qa-param" value="${qa.param || ''}" placeholder="${qa.action === 'addTime' ? '60' : qa.action === 'displayText' ? 'Message...' : 'filename'}"></td>
      <td>
        <button class="btn-remove-event" title="Remove">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </td>
    </tr>
  `).join('');

  empty.style.display = quickActions.length === 0 ? '' : 'none';

  tbody.querySelectorAll('tr').forEach(row => {
    const idx = parseInt(row.dataset.index, 10);
    row.querySelector('.qa-label').addEventListener('change', (e) => {
      quickActions[idx].label = e.target.value;
    });
    row.querySelector('.qa-action').addEventListener('change', (e) => {
      quickActions[idx].action = e.target.value;
    });
    row.querySelector('.qa-param').addEventListener('change', (e) => {
      quickActions[idx].param = e.target.value;
    });
    row.querySelector('.btn-remove-event').addEventListener('click', () => {
      quickActions.splice(idx, 1);
      renderQuickActionsTable();
    });
  });
}

document.getElementById('btnAddQuickAction').addEventListener('click', () => {
  quickActions.push({ label: '', action: 'playSound', param: '' });
  renderQuickActionsTable();
});

function renderQuickActionsPanel() {
  const panel = document.getElementById('quickActionsPanel');
  const actions = currentRoom?.quickActions || [];

  if (actions.length === 0) {
    panel.innerHTML = '<span class="quick-actions-empty">No quick actions configured</span>';
    return;
  }

  panel.innerHTML = actions.map((qa, i) => `
    <button class="qa-btn" data-qa-index="${i}">${qa.label || qa.action}</button>
  `).join('');

  panel.querySelectorAll('.qa-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const qa = actions[parseInt(btn.dataset.qaIndex, 10)];
      executeQuickAction(qa);
    });
  });
}

function executeQuickAction(qa) {
  switch (qa.action) {
    case 'playSound':
      window.api.playSound({ filename: qa.param });
      break;
    case 'displayText':
      window.api.showMessage({ text: qa.param, duration: 5000 });
      break;
    case 'playVideo':
      window.api.playVideo({ filename: qa.param });
      break;
    case 'addTime': {
      const sec = parseInt(qa.param, 10) || 0;
      timerSeconds = Math.max(0, timerSeconds + sec);
      updateTimerDisplay();
      window.api.timerAddTime({ seconds: sec });
      if (sec > 0) window.api.showBonusTime({ label: qa.label || 'BONUS TIME' });
      break;
    }
  }
}

// ---- Alert Tones ----

let availableSounds = [];

async function loadAlertTones(roomName) {
  availableSounds = await window.api.getSounds(roomName);
  renderAlertTones();
}

function renderAlertTones() {
  const panel = document.getElementById('alertTonesPanel');

  if (availableSounds.length === 0) {
    panel.innerHTML = '<span class="alert-tones-empty">No sound files found. Add .mp3/.wav/.ogg files to assets/sounds/ or the room\'s sounds/ folder.</span>';
    return;
  }

  panel.innerHTML = availableSounds.map((s, i) => `
    <button class="tone-btn" data-tone-index="${i}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>
      ${s.name}
    </button>
  `).join('');

  panel.querySelectorAll('.tone-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sound = availableSounds[parseInt(btn.dataset.toneIndex, 10)];
      window.api.playSound({ filename: sound.filename, path: sound.path });
    });
  });
}

// ---- Background Music ----

let musicPlaying = false;

document.getElementById('btnMusicToggle').addEventListener('click', () => {
  if (!currentRoom) return;
  musicPlaying = !musicPlaying;
  if (musicPlaying) {
    window.api.musicPlay({ roomName: currentRoom.name });
    document.getElementById('btnMusicToggle').textContent = 'Playing...';
  } else {
    window.api.musicStop();
    document.getElementById('btnMusicToggle').textContent = 'Play Music';
  }
});

document.getElementById('btnMusicStop').addEventListener('click', () => {
  window.api.musicStop();
  musicPlaying = false;
  document.getElementById('btnMusicToggle').textContent = 'Play Music';
});

// ---- Live Preview ----

let previewVisible = false;

document.getElementById('btnTogglePreview').addEventListener('click', () => {
  previewVisible = !previewVisible;
  const container = document.getElementById('previewContainer');
  const btn = document.getElementById('btnTogglePreview');
  const frame = document.getElementById('previewFrame');

  container.style.display = previewVisible ? '' : 'none';
  btn.textContent = previewVisible ? 'Hide' : 'Show';

  if (previewVisible && frame.src === 'about:blank') {
    frame.src = window.api.getTimerURL();
  }
});

// ---- Timer Controls ----

function formatTime(totalSeconds) {
  const abs = Math.abs(totalSeconds);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  const sign = totalSeconds < 0 ? '-' : '';
  return h > 0 ? `${sign}${h}:${mm}:${ss}` : `${sign}${mm}:${ss}`;
}

function updateTimerDisplay() {
  const el = document.getElementById('timerDisplay');
  el.textContent = formatTime(timerSeconds);

  el.classList.remove('paused', 'danger');
  if (gameState === 'paused') el.classList.add('paused');
  if (timerSeconds <= 60 && gameState === 'running') el.classList.add('danger');

  document.getElementById('hintsRemaining').textContent = hintsRemaining;
}

function startTimer() {
  if (gameState === 'running') return;

  if (gameState === 'idle' || gameState === 'ended') {
    timerSeconds = currentRoom.duration * 60;
    hintsRemaining = currentRoom.maxHints;
    hints.forEach(h => h.sent = false);
    updateHintsPanel();
  }

  gameState = 'running';
  updateStatusIndicator();

  const total = currentRoom.duration * 60;
  window.api.timerStart({
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60
  });

  document.getElementById('btnStart').innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Start`;
  document.getElementById('btnStart').disabled = true;
  document.getElementById('btnPause').disabled = false;

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (gameState === 'running') {
      timerSeconds--;
      updateTimerDisplay();
      if (timerSeconds <= 0) {
        timerSeconds = 0;
        endGame('fail');
      }
    }
  }, 1000);
}

function pauseTimer() {
  if (gameState !== 'running') return;
  gameState = 'paused';
  window.api.timerPause();
  document.getElementById('btnStart').innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Resume`;
  document.getElementById('btnStart').disabled = false;
  document.getElementById('btnPause').disabled = true;
  updateStatusIndicator();
  updateTimerDisplay();
}

function resumeTimer() {
  if (gameState !== 'paused') return;
  gameState = 'running';
  window.api.timerResume();
  document.getElementById('btnStart').innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Start`;
  document.getElementById('btnStart').disabled = true;
  document.getElementById('btnPause').disabled = false;
  updateStatusIndicator();
  updateTimerDisplay();
}

function resetTimer() {
  clearInterval(timerInterval);
  gameState = 'idle';
  if (currentRoom) {
    timerSeconds = currentRoom.duration * 60;
    hintsRemaining = currentRoom.maxHints;
  }
  hints.forEach(h => h.sent = false);
  window.api.timerReset();

  document.getElementById('btnStart').innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Start`;
  document.getElementById('btnStart').disabled = false;
  document.getElementById('btnPause').disabled = true;
  updateStatusIndicator();
  updateTimerDisplay();
  updateHintsPanel();
}

document.getElementById('btnStart').addEventListener('click', () => {
  gameState === 'paused' ? resumeTimer() : startTimer();
});
document.getElementById('btnPause').addEventListener('click', pauseTimer);
document.getElementById('btnReset').addEventListener('click', resetTimer);

// Time adjustment
document.querySelectorAll('[data-time]').forEach(btn => {
  btn.addEventListener('click', () => {
    const delta = parseInt(btn.dataset.time, 10);
    timerSeconds = Math.max(0, timerSeconds + delta);
    updateTimerDisplay();
    window.api.timerAddTime({ seconds: delta });
    if (delta > 0) window.api.showBonusTime({ label: 'BONUS TIME' });
  });
});

// ---- Hints ----

function updateHintsPanel() {
  const list = document.getElementById('hintsList');

  if (hints.length === 0) {
    list.innerHTML = '<div class="empty-state" style="padding:24px;font-size:13px">No hints loaded for this room</div>';
    return;
  }

  list.innerHTML = hints.map((hint, i) => `
    <div class="hint-item ${hint.sent ? 'sent' : ''}" data-index="${i}">
      <span class="hint-type-badge ${hint.type}">${hint.type}</span>
      <span class="hint-name">${hint.name}</span>
    </div>
  `).join('');

  list.querySelectorAll('.hint-item').forEach(item => {
    item.addEventListener('click', () => sendHint(parseInt(item.dataset.index, 10)));
  });
}

function sendHint(index) {
  if (hintsRemaining <= 0) return;
  const hint = hints[index];
  if (!hint || hint.sent) return;

  hint.sent = true;
  hintsRemaining--;

  window.api.sendHint({
    type: hint.type,
    content: hint.content || '',
    name: hint.name,
    filename: hint.filename || '',
    path: hint.path || ''
  });

  updateTimerDisplay();
  updateHintsPanel();
}

document.getElementById('btnSendCustomHint').addEventListener('click', () => {
  const input = document.getElementById('customHintText');
  const text = input.value.trim();
  if (!text) return;
  window.api.sendHint({ type: 'text', content: text, name: 'Custom', filename: '', path: '' });
  input.value = '';
});

document.getElementById('customHintText').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('btnSendCustomHint').click();
  }
});

document.getElementById('btnClearHint').addEventListener('click', () => window.api.clearHint());

// ---- Special Messages ----

document.getElementById('btnMsgGetReady').addEventListener('click', () => {
  window.api.showMessage({ text: 'Get Ready!', duration: 5000 });
});

document.getElementById('btnMsgGoodLuck').addEventListener('click', () => {
  window.api.showMessage({ text: 'Good Luck!', duration: 5000 });
});

document.getElementById('btnMsgDescription').addEventListener('click', () => {
  if (currentRoom?.description) {
    window.api.showMessage({ text: currentRoom.description, duration: 10000 });
  }
});

document.getElementById('btnMsgClear').addEventListener('click', () => {
  window.api.showMessage({ text: '', duration: 1 });
});

// ---- End Game ----

function endGame(type) {
  clearInterval(timerInterval);
  gameState = 'ended';

  const message = type === 'success'
    ? (currentRoom?.successMessage || 'Congratulations! You escaped!')
    : (currentRoom?.failMessage || 'Time is up! You are trapped!');

  window.api.timerEnd({ type, message });

  // Save score
  if (currentRoom) {
    const totalSec = currentRoom.duration * 60;
    const elapsed = totalSec - timerSeconds;
    window.api.saveScore(currentRoom.name, {
      result: type,
      timeUsed: elapsed,
      totalTime: totalSec,
      hintsUsed: currentRoom.maxHints - hintsRemaining
    });
  }

  document.getElementById('btnStart').innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Start`;
  document.getElementById('btnStart').disabled = false;
  document.getElementById('btnPause').disabled = true;
  updateStatusIndicator();
}

document.getElementById('btnEndSuccess').addEventListener('click', () => endGame('success'));
document.getElementById('btnEndFail').addEventListener('click', () => endGame('fail'));

// ---- Status Indicator ----

function updateStatusIndicator() {
  const el = document.getElementById('statusIndicator');
  const dot = el.querySelector('.pill-dot');
  const label = el.querySelector('.pill-label');

  const states = {
    idle:    { text: 'Standby', cls: 'standby' },
    running: { text: 'Active',  cls: 'active' },
    paused:  { text: 'Paused',  cls: 'paused' },
    ended:   { text: 'Ended',   cls: 'ended' }
  };

  const state = states[gameState] || states.idle;
  dot.className = 'pill-dot ' + state.cls;
  label.textContent = state.text;
}

// ---- Timer Display Connection ----

window.api.onTimerDisplayConnected(() => {
  const el = document.getElementById('timerDisplayStatus');
  el.querySelector('.pill-dot').className = 'pill-dot online';
  el.querySelector('.pill-label').textContent = 'Display Online';
});

window.api.onTimerDisplayDisconnected(() => {
  const el = document.getElementById('timerDisplayStatus');
  el.querySelector('.pill-dot').className = 'pill-dot offline';
  el.querySelector('.pill-label').textContent = 'Display Offline';
});

// ---- Open Timer Display ----

document.getElementById('btnOpenTimer').addEventListener('click', () => {
  window.open(window.api.getTimerURL(), '_blank');
});

// ---- Scoreboard ----

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function loadScores() {
  const scores = await window.api.getAllScores();
  const tbody = document.getElementById('scoresBody');
  const empty = document.getElementById('scoresEmpty');

  if (scores.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = '';
    return;
  }

  empty.style.display = 'none';
  tbody.innerHTML = scores.map(s => {
    const date = new Date(s.timestamp);
    const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const resultClass = s.result === 'success' ? 'score-success' : 'score-fail';
    return `
      <tr>
        <td>${dateStr}</td>
        <td>${s.roomName}</td>
        <td><span class="score-badge ${resultClass}">${s.result === 'success' ? 'Escaped' : 'Failed'}</span></td>
        <td>${formatDuration(s.timeUsed)} / ${formatDuration(s.totalTime)}</td>
        <td>${s.hintsUsed}</td>
      </tr>
    `;
  }).join('');
}

// ---- Init ----

loadRooms();
showView('rooms');
