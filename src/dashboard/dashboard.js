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
  control: document.getElementById('view-control')
};

const navItems = document.querySelectorAll('.nav-item[data-view]');

function showView(viewName) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  navItems.forEach(n => n.classList.remove('active'));

  if (views[viewName]) views[viewName].classList.add('active');

  const activeNav = document.querySelector(`.nav-item[data-view="${viewName}"]`);
  if (activeNav) activeNav.classList.add('active');
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

  document.getElementById('controlRoomName').textContent = currentRoom.name;
  updateTimerDisplay();
  updateHintsPanel();
  updateStatusIndicator();

  window.api.updateConfig({
    roomName: currentRoom.name,
    duration: currentRoom.duration,
    maxHints: currentRoom.maxHints,
    countdownType: currentRoom.countdownType || 'S0',
    successMessage: currentRoom.successMessage,
    failMessage: currentRoom.failMessage,
    theme: currentRoom.theme
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
    countdownType: document.getElementById('setupCountdownType').value
  });

  await loadRooms();
  showView('rooms');
});

document.getElementById('btnCancelSetup').addEventListener('click', () => showView('rooms'));

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

// ---- End Game ----

function endGame(type) {
  clearInterval(timerInterval);
  gameState = 'ended';

  const message = type === 'success'
    ? (currentRoom?.successMessage || 'Congratulations! You escaped!')
    : (currentRoom?.failMessage || 'Time is up! You are trapped!');

  window.api.timerEnd({ type, message });

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

// ---- Init ----

loadRooms();
showView('rooms');
