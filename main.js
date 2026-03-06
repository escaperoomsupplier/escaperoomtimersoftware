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

// --- Express + Socket.IO Server ---

function startServer() {
  expressApp = express();
  server = http.createServer(expressApp);
  io = new Server(server, { cors: { origin: '*' } });

  // Serve timer display
  expressApp.use('/room', express.static(path.join(__dirname, 'src', 'timer')));
  // Serve assets (sounds, fonts, backgrounds)
  expressApp.use('/assets', express.static(path.join(__dirname, 'assets')));
  // Serve room data files (hints media, sounds, etc.)
  expressApp.use('/data', express.static(path.join(__dirname, 'data')));

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

  // Forward all timer/hint/display commands to Socket.IO
  const forwardEvents = [
    'timer:start', 'timer:pause', 'timer:resume', 'timer:reset',
    'timer:addTime', 'timer:end',
    'hint:send', 'hint:clear',
    'display:progress', 'display:bonusTime', 'display:message',
    'sound:play', 'video:play',
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
    title: 'Escape Room Control — LCARS',
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
  roomManager = new RoomManager(path.join(__dirname, 'data', 'rooms'));
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
