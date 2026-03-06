const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const RoomManager = require('./src/server/roomManager');

const PORT = 3333;
let mainWindow;
let expressApp;
let server;
let io;
let roomManager;

// Resolve paths for both dev and packaged app
const isPackaged = app.isPackaged;
const appRoot = isPackaged ? process.resourcesPath : __dirname;
const dataPath = path.join(appRoot, 'data');
const assetsPath = path.join(isPackaged ? appRoot : __dirname, 'assets');

// --- Express + Socket.IO Server ---

function startServer() {
  expressApp = express();
  server = http.createServer(expressApp);
  io = new Server(server, { cors: { origin: '*' } });

  // Serve timer display
  expressApp.use('/room', express.static(path.join(__dirname, 'src', 'timer')));
  // Serve assets (sounds, fonts, backgrounds)
  expressApp.use('/assets', express.static(assetsPath));
  // Serve room data files (hints media, sounds, etc.)
  expressApp.use('/data', express.static(dataPath));

  // Socket.IO connection handling
  io.on('connection', (socket) => {
    console.log('Timer display connected:', socket.id);

    socket.on('status:ready', () => {
      console.log('Timer display ready');
      mainWindow?.webContents.send('timer-display:connected');
    });

    socket.on('timer:tick', (data) => {
      mainWindow?.webContents.send('timer:tick', data);
    });

    socket.on('timer:finished', () => {
      mainWindow?.webContents.send('timer:finished');
    });

    socket.on('disconnect', () => {
      console.log('Timer display disconnected:', socket.id);
      mainWindow?.webContents.send('timer-display:disconnected');
    });
  });

  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Forward dashboard commands to timer display via Socket.IO
function setupIPC() {
  // Room management
  ipcMain.handle('rooms:list', () => roomManager.listRooms());
  ipcMain.handle('rooms:get', (_, roomName) => roomManager.getRoom(roomName));
  ipcMain.handle('rooms:save', (_, roomData) => roomManager.saveRoom(roomData));
  ipcMain.handle('rooms:getHints', (_, roomName, language) => roomManager.getHints(roomName, language));
  ipcMain.handle('rooms:getSounds', (_, roomName) => roomManager.getSounds(roomName));
  ipcMain.handle('scores:save', (_, roomName, scoreData) => roomManager.saveScore(roomName, scoreData));
  ipcMain.handle('scores:get', (_, roomName) => roomManager.getScores(roomName));
  ipcMain.handle('scores:getAll', () => roomManager.getAllScores());

  // UUPC API proxy (avoids CORS from renderer)
  ipcMain.handle('uupc:getState', async (_, ip) => {
    try {
      const [machine, inputs, outputs] = await Promise.all([
        fetch(`http://${ip}/machine/state`).then(r => r.json()),
        fetch(`http://${ip}/input/state`).then(r => r.json()),
        fetch(`http://${ip}/output/state`).then(r => r.json())
      ]);
      return { ok: true, machine, inputs, outputs };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('uupc:setMachineState', async (_, ip, value) => {
    try {
      const res = await fetch(`http://${ip}/machine/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `value=${value}`
      });
      return { ok: res.ok };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('uupc:overrideInput', async (_, ip, port, value) => {
    try {
      const res = await fetch(`http://${ip}/input/overwrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `${port}=${value}`
      });
      return { ok: res.ok };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('uupc:overrideOutput', async (_, ip, port, value) => {
    try {
      const res = await fetch(`http://${ip}/output/overwrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `${port}=${value}`
      });
      return { ok: res.ok };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // Forward all timer/hint/display commands to Socket.IO
  const forwardEvents = [
    'timer:start', 'timer:pause', 'timer:resume', 'timer:reset',
    'timer:addTime', 'timer:end',
    'hint:send', 'hint:clear',
    'display:progress', 'display:bonusTime', 'display:message',
    'sound:play', 'video:play',
    'music:play', 'music:stop',
    'config:update'
  ];

  forwardEvents.forEach(event => {
    ipcMain.on(event, (_, data) => {
      io.emit(event, data);
    });
  });
}

// --- Electron Window ---

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Escape Room Control',
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'dashboard', 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// --- App lifecycle ---

app.whenReady().then(() => {
  roomManager = new RoomManager(path.join(dataPath, 'rooms'));
  startServer();
  setupIPC();
  createWindow();
});

app.on('window-all-closed', () => {
  server?.close();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
