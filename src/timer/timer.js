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
let firedEvents = new Set();

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

  timerDigits.classList.remove('danger', 'paused', 'ended',
    'fx-pulsate', 'fx-bounce', 'fx-shake', 'fx-blur', 'fx-jello',
    'fx-flash', 'fx-rubberband', 'fx-heartbeat', 'fx-swing', 'fx-flicker');
  if (remaining <= 60 && remaining > 0) {
    timerDigits.classList.add('danger');
    if (config.countdownEffect) timerDigits.classList.add(config.countdownEffect);
  }

  socket.emit('timer:tick', { remaining, formatted: formatTime(remaining, config.countdownType) });

  checkScheduledEvents(remaining);

  if (remaining <= 0) {
    clearInterval(timerInterval);
    timerInterval = null;
    socket.emit('timer:finished');
  }
}

// ---- Scheduled Events Engine ----

function checkScheduledEvents(remaining) {
  if (!config.scheduledEvents || config.scheduledEvents.length === 0) return;
  const elapsed = totalDuration - remaining;
  const elapsedMinutes = Math.floor(elapsed / 60);

  config.scheduledEvents.forEach((evt, i) => {
    if (firedEvents.has(i)) return;
    if (elapsedMinutes >= evt.minute) {
      firedEvents.add(i);
      executeScheduledEvent(evt);
    }
  });
}

function executeScheduledEvent(evt) {
  switch (evt.action) {
    case 'playSound':
      new Audio(`/assets/sounds/${evt.param}`).play().catch(() => {});
      break;
    case 'displayText':
      showOverlay('bonus', evt.param);
      setTimeout(hideOverlay, 5000);
      break;
    case 'playVideo':
      hintContent.innerHTML = `<video src="/assets/videos/${evt.param}" autoplay></video>`;
      hintContent.classList.add('visible');
      const video = hintContent.querySelector('video');
      if (video) video.onended = () => clearHintDisplay();
      break;
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
  if (data.theme) {
    const t = data.theme;
    if (t.backgroundColor) document.body.style.background = t.backgroundColor;
    if (t.timerColor) timerDigits.style.color = t.timerColor;
    if (t.hintColor) hintContent.style.color = t.hintColor;
    if (t.fontFamily) timerDigits.style.fontFamily = t.fontFamily + ', sans-serif';
  }
  if (data.bgMedia) {
    const bgEl = document.getElementById('bgMedia');
    const ext = data.bgMedia.split('.').pop().toLowerCase();
    if (['mp4', 'webm'].includes(ext)) {
      bgEl.innerHTML = `<video src="/assets/backgrounds/${data.bgMedia}" autoplay loop muted></video>`;
    } else {
      bgEl.innerHTML = `<img src="/assets/backgrounds/${data.bgMedia}" alt="">`;
    }
  } else {
    document.getElementById('bgMedia').innerHTML = '';
  }

  // Feature 1: More fonts support — dynamic Google Fonts loading
  if (data.fontUrl) {
    const link = document.getElementById('customFontLink') || document.createElement('link');
    link.id = 'customFontLink';
    link.rel = 'stylesheet';
    link.href = data.fontUrl;
    document.head.appendChild(link);
  }

  // Feature 3: Configurable timer digit size
  if (data.timerFontSize) {
    timerDigits.style.fontSize = data.timerFontSize;
  }

  // Feature 4: Border/frame around timer
  if (data.timerBorder) {
    const b = data.timerBorder;
    const wrapper = document.querySelector('.timer-wrapper');
    if (b.style && b.color) {
      wrapper.style.border = `${b.style} ${b.color}`;
      wrapper.style.padding = '24px 48px';
      wrapper.style.borderRadius = b.radius || '0px';
    }
    if (b.shadow) wrapper.style.boxShadow = b.shadow;
  }

  // Feature 5: Idle screen — show room description/logo before game start
  const idleScreen = document.getElementById('idleScreen');
  if (data.roomName) {
    document.getElementById('idleRoomName').textContent = data.roomName;
  }
  if (data.description) {
    document.getElementById('idleDescription').textContent = data.description;
  }
  if (data.roomName && data.idleScreen !== false) {
    // Show logo if exists
    const logoPath = `/data/rooms/${data.roomName}/logo.png`;
    document.getElementById('idleLogo').innerHTML = `<img src="${logoPath}" alt="" onerror="this.style.display='none'">`;
    idleScreen.classList.add('visible');
  }

  // Feature 7: Configurable element positions (display layout)
  if (data.displayLayout) {
    document.querySelector('.display-container').dataset.layout = data.displayLayout;
  }
});

function startActualTimer(duration) {
  endTime = Date.now() + duration * 1000;
  updateDisplay();
  timerInterval = setInterval(updateDisplay, 250);
}

socket.on('timer:start', (data) => {
  // Hide idle screen
  document.getElementById('idleScreen').classList.remove('visible');

  clearInterval(timerInterval);
  isPaused = false;
  firedEvents = new Set();
  hideOverlay();
  clearHintDisplay();

  totalDuration = (data.hours * 3600) + (data.minutes * 60) + data.seconds;
  timerDigits.classList.remove('paused', 'ended');

  if (config.getReadyCountdown) {
    // Show get ready countdown
    let count = 5;
    const getReadyEl = document.getElementById('getReadyOverlay');
    const getReadyNum = document.getElementById('getReadyNumber');
    getReadyEl.classList.add('visible');
    getReadyNum.textContent = count;

    const countInterval = setInterval(() => {
      count--;
      if (count > 0) {
        getReadyNum.textContent = count;
        getReadyNum.classList.remove('pop');
        void getReadyNum.offsetWidth; // force reflow
        getReadyNum.classList.add('pop');
      } else {
        clearInterval(countInterval);
        getReadyEl.classList.remove('visible');
        // NOW start the actual timer
        startActualTimer(totalDuration);
      }
    }, 1000);
  } else {
    startActualTimer(totalDuration);
  }
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
  firedEvents = new Set();

  timerDigits.classList.remove('paused', 'danger', 'ended');
  hideOverlay();
  clearHintDisplay();

  if (config.duration) {
    totalDuration = config.duration * 60;
    timerDigits.textContent = formatTime(totalDuration, config.countdownType);
  }
  if (config.maxHints != null) hintsValue.textContent = config.maxHints;

  // Show idle screen again if configured
  if (config.idleScreen !== false && config.roomName) {
    document.getElementById('idleScreen').classList.add('visible');
  }
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
  // Play alert tone for hint delivery
  new Audio('/assets/sounds/hint-alert.mp3').play().catch(() => {});
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
        if (config.typingEffect) {
          hintContent.innerHTML = '';
          hintContent.classList.add('typing');
          const text = data.content;
          let i = 0;
          const typeInterval = setInterval(() => {
            if (i < text.length) {
              // Handle HTML tags - skip through them entirely
              if (text[i] === '<') {
                const closeIdx = text.indexOf('>', i);
                if (closeIdx !== -1) {
                  hintContent.innerHTML += text.substring(i, closeIdx + 1);
                  i = closeIdx + 1;
                  return;
                }
              }
              hintContent.innerHTML += text[i];
              i++;
            } else {
              clearInterval(typeInterval);
              hintContent.classList.remove('typing');
            }
          }, 40);
        } else {
          hintContent.innerHTML = data.content;
        }
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
  const src = data.path || `/assets/sounds/${data.filename}`;
  new Audio(src).play().catch(() => {});
});

let bgMusic = null;

socket.on('music:play', (data) => {
  if (bgMusic) { bgMusic.pause(); bgMusic = null; }
  bgMusic = new Audio(`/data/rooms/${data.roomName}/main_theme/theme.mp3`);
  bgMusic.loop = true;
  bgMusic.volume = 0.5;
  bgMusic.play().catch(() => {});
});

socket.on('music:stop', () => {
  if (bgMusic) { bgMusic.pause(); bgMusic = null; }
});

socket.on('video:play', (data) => {
  hintContent.innerHTML = `<video src="/assets/videos/${data.filename}" autoplay></video>`;
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
