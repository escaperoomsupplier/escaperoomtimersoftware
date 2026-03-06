// ========================================
// Timer Display Controller
// ========================================

const socket = io();

let timerInterval = null;
let endTime = null;
let totalDuration = 0;
let isPaused = false;
let pausedRemaining = 0;
let config = {};

// ---- DOM ----
const timerDigits = document.getElementById('timerDigits');
const timerLabel = document.getElementById('timerLabel');
const hintsValue = document.getElementById('hintsValue');
const progressValue = document.getElementById('progressValue');
const progressCard = document.getElementById('progressCard');
const hintContent = document.getElementById('hintContent');
const messageOverlay = document.getElementById('messageOverlay');
const messageText = document.getElementById('messageText');
const overlayIcon = document.getElementById('overlayIcon');
const roomTitle = document.getElementById('roomTitle');
const connectionStatus = document.getElementById('connectionStatus');

// ---- Time Formatting ----

function formatTime(totalSeconds, countdownType) {
  const type = countdownType || 'S0';
  const abs = Math.abs(Math.floor(totalSeconds));

  if (type === 'S1') return String(abs);
  if (type === 'S2') {
    const pct = totalDuration > 0 ? (totalSeconds / totalDuration) * 100 : 0;
    return Math.max(0, pct).toFixed(1) + '%';
  }
  if (type === 'S3') {
    const pct = totalDuration > 0 ? 100 - (totalSeconds / totalDuration) * 100 : 100;
    return Math.min(100, Math.max(0, pct)).toFixed(1) + '%';
  }
  if (type === 'S4') {
    const elapsed = Math.max(0, totalDuration - totalSeconds);
    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = elapsed % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // S0 Standard
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function updateDisplay() {
  if (isPaused) {
    timerDigits.textContent = formatTime(pausedRemaining, config.countdownType);
    return;
  }
  if (!endTime) return;

  const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
  timerDigits.textContent = formatTime(remaining, config.countdownType);

  timerDigits.classList.remove('danger', 'paused', 'ended');
  if (remaining <= 60 && remaining > 0) timerDigits.classList.add('danger');

  socket.emit('timer:tick', { remaining, formatted: formatTime(remaining, config.countdownType) });

  if (remaining <= 0) {
    clearInterval(timerInterval);
    timerInterval = null;
    socket.emit('timer:finished');
  }
}

// ---- Socket Events ----

socket.on('connect', () => {
  socket.emit('status:ready');
  connectionStatus.innerHTML = '<span class="status-dot connected"></span> Connected';
});

socket.on('disconnect', () => {
  connectionStatus.innerHTML = '<span class="status-dot"></span> Disconnected';
});

socket.on('config:update', (data) => {
  config = data;
  if (data.roomName) roomTitle.textContent = data.roomName;
  if (data.maxHints != null) hintsValue.textContent = data.maxHints;
  if (data.duration) {
    totalDuration = data.duration * 60;
    timerDigits.textContent = formatTime(totalDuration, data.countdownType);
  }
});

socket.on('timer:start', (data) => {
  clearInterval(timerInterval);
  isPaused = false;
  hideOverlay();
  clearHintDisplay();

  totalDuration = (data.hours * 3600) + (data.minutes * 60) + data.seconds;
  endTime = Date.now() + totalDuration * 1000;

  timerDigits.classList.remove('paused', 'ended');

  updateDisplay();
  timerInterval = setInterval(updateDisplay, 250);
});

socket.on('timer:pause', () => {
  if (!endTime) return;
  isPaused = true;
  pausedRemaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
  clearInterval(timerInterval);
  timerInterval = null;

  timerDigits.classList.add('paused');
  timerDigits.classList.remove('danger');
  timerDigits.textContent = formatTime(pausedRemaining, config.countdownType);
});

socket.on('timer:resume', () => {
  if (!isPaused) return;
  isPaused = false;
  endTime = Date.now() + pausedRemaining * 1000;
  timerDigits.classList.remove('paused');

  updateDisplay();
  timerInterval = setInterval(updateDisplay, 250);
});

socket.on('timer:reset', () => {
  clearInterval(timerInterval);
  timerInterval = null;
  endTime = null;
  isPaused = false;

  timerDigits.classList.remove('paused', 'danger', 'ended');
  hideOverlay();
  clearHintDisplay();

  if (config.duration) {
    totalDuration = config.duration * 60;
    timerDigits.textContent = formatTime(totalDuration, config.countdownType);
  }
  if (config.maxHints != null) hintsValue.textContent = config.maxHints;
});

socket.on('timer:addTime', (data) => {
  if (endTime && !isPaused) {
    endTime += data.seconds * 1000;
    totalDuration += data.seconds;
  } else if (isPaused) {
    pausedRemaining = Math.max(0, pausedRemaining + data.seconds);
    timerDigits.textContent = formatTime(pausedRemaining, config.countdownType);
  }
});

socket.on('timer:end', (data) => {
  clearInterval(timerInterval);
  timerInterval = null;
  timerDigits.classList.remove('danger', 'paused');
  timerDigits.classList.add('ended');

  showOverlay(data.type, data.message);
});

// ---- Hints ----

socket.on('hint:send', (data) => {
  const current = parseInt(hintsValue.textContent, 10);
  if (current > 0) hintsValue.textContent = current - 1;
  showHint(data);
});

socket.on('hint:clear', () => clearHintDisplay());

function showHint(data) {
  hintContent.classList.remove('visible');
  hintContent.className = 'hint-content';

  setTimeout(() => {
    switch (data.type) {
      case 'text':
        hintContent.classList.add('text-hint');
        hintContent.innerHTML = data.content;
        break;
      case 'image':
        hintContent.innerHTML = `<img src="${data.path}" alt="Hint">`;
        break;
      case 'video':
        hintContent.innerHTML = `<video src="${data.path}" autoplay controls></video>`;
        break;
      case 'audio':
        hintContent.innerHTML = `
          <div class="audio-indicator">
            <div class="audio-bars">
              <div class="audio-bar"></div>
              <div class="audio-bar"></div>
              <div class="audio-bar"></div>
              <div class="audio-bar"></div>
              <div class="audio-bar"></div>
            </div>
            <div class="audio-label">Playing Audio Hint</div>
          </div>`;
        const audio = new Audio(data.path);
        audio.play().catch(() => {});
        break;
      default:
        hintContent.classList.add('text-hint');
        hintContent.innerHTML = data.content || '';
    }
    hintContent.classList.add('visible');
  }, 100);
}

function clearHintDisplay() {
  hintContent.classList.remove('visible');
  setTimeout(() => {
    hintContent.innerHTML = '';
    hintContent.className = 'hint-content';
  }, 500);
}

// ---- Overlays ----

function showOverlay(type, text) {
  messageOverlay.className = 'overlay visible ' + type;

  if (type === 'success') {
    overlayIcon.innerHTML = '<svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
  } else if (type === 'fail') {
    overlayIcon.innerHTML = '<svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>';
  } else {
    overlayIcon.innerHTML = '';
  }

  messageText.innerHTML = text;
}

function hideOverlay() {
  messageOverlay.className = 'overlay';
}

socket.on('display:progress', (data) => {
  progressCard.style.display = 'block';
  progressValue.textContent = data.value;
});

socket.on('display:bonusTime', (data) => {
  showOverlay('bonus', data.label || 'BONUS TIME');
  setTimeout(hideOverlay, 3000);
});

socket.on('display:message', (data) => {
  showOverlay('bonus', data.text);
  if (data.duration) setTimeout(hideOverlay, data.duration);
});

socket.on('sound:play', (data) => {
  new Audio(`/assets/sounds/${data.filename}`).play().catch(() => {});
});

socket.on('video:play', (data) => {
  hintContent.innerHTML = `<video src="/assets/sounds/${data.filename}" autoplay></video>`;
  hintContent.classList.add('visible');
  const video = hintContent.querySelector('video');
  if (video) video.onended = () => clearHintDisplay();
});

// ---- Fullscreen ----

document.addEventListener('keydown', (e) => {
  if (e.key === 'F11') {
    e.preventDefault();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }
});
