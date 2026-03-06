const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Room management
  listRooms: () => ipcRenderer.invoke('rooms:list'),
  getRoom: (name) => ipcRenderer.invoke('rooms:get', name),
  saveRoom: (data) => ipcRenderer.invoke('rooms:save', data),
  getHints: (roomName, language) => ipcRenderer.invoke('rooms:getHints', roomName, language),

  // Timer controls — send to main, which forwards via Socket.IO
  timerStart: (data) => ipcRenderer.send('timer:start', data),
  timerPause: () => ipcRenderer.send('timer:pause'),
  timerResume: () => ipcRenderer.send('timer:resume'),
  timerReset: () => ipcRenderer.send('timer:reset'),
  timerAddTime: (data) => ipcRenderer.send('timer:addTime', data),
  timerEnd: (data) => ipcRenderer.send('timer:end', data),

  // Hint controls
  sendHint: (data) => ipcRenderer.send('hint:send', data),
  clearHint: () => ipcRenderer.send('hint:clear'),

  // Display controls
  setProgress: (data) => ipcRenderer.send('display:progress', data),
  showBonusTime: (data) => ipcRenderer.send('display:bonusTime', data),
  showMessage: (data) => ipcRenderer.send('display:message', data),
  playSound: (data) => ipcRenderer.send('sound:play', data),
  playVideo: (data) => ipcRenderer.send('video:play', data),
  updateConfig: (data) => ipcRenderer.send('config:update', data),

  // Events from main process
  onTimerTick: (cb) => ipcRenderer.on('timer:tick', (_, data) => cb(data)),
  onTimerFinished: (cb) => ipcRenderer.on('timer:finished', () => cb()),
  onTimerDisplayConnected: (cb) => ipcRenderer.on('timer-display:connected', () => cb()),
  onTimerDisplayDisconnected: (cb) => ipcRenderer.on('timer-display:disconnected', () => cb()),

  // Server info
  getTimerURL: () => `http://localhost:3333/room`
});
