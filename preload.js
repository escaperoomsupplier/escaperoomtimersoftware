const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Room management
  listRooms: () => ipcRenderer.invoke('rooms:list'),
  getRoom: (name) => ipcRenderer.invoke('rooms:get', name),
  saveRoom: (data) => ipcRenderer.invoke('rooms:save', data),
  getHints: (roomName, language) => ipcRenderer.invoke('rooms:getHints', roomName, language),
  getSounds: (roomName) => ipcRenderer.invoke('rooms:getSounds', roomName),
  deleteRoom: (name) => ipcRenderer.invoke('rooms:delete', name),
  saveScore: (roomName, data) => ipcRenderer.invoke('scores:save', roomName, data),
  getScores: (roomName) => ipcRenderer.invoke('scores:get', roomName),
  getAllScores: () => ipcRenderer.invoke('scores:getAll'),

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
  musicPlay: (data) => ipcRenderer.send('music:play', data),
  musicStop: () => ipcRenderer.send('music:stop'),
  updateConfig: (data) => ipcRenderer.send('config:update', data),

  // UUPC puzzle controller
  uupcGetState: (ip) => ipcRenderer.invoke('uupc:getState', ip),
  uupcSetMachineState: (ip, value) => ipcRenderer.invoke('uupc:setMachineState', ip, value),
  uupcOverrideInput: (ip, port, value) => ipcRenderer.invoke('uupc:overrideInput', ip, port, value),
  uupcOverrideOutput: (ip, port, value) => ipcRenderer.invoke('uupc:overrideOutput', ip, port, value),

  // Events from main process
  onTimerTick: (cb) => ipcRenderer.on('timer:tick', (_, data) => cb(data)),
  onTimerFinished: (cb) => ipcRenderer.on('timer:finished', () => cb()),
  onTimerDisplayConnected: (cb) => ipcRenderer.on('timer-display:connected', () => cb()),
  onTimerDisplayDisconnected: (cb) => ipcRenderer.on('timer-display:disconnected', () => cb()),

  // Server info
  getTimerURL: () => `http://localhost:3333/room`,
  getNetworkTimerURL: () => {
    const os = require('os');
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          return `http://${net.address}:3333/room`;
        }
      }
    }
    return `http://localhost:3333/room`;
  }
});
