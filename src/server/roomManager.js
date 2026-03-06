const fs = require('fs');
const path = require('path');

class RoomManager {
  constructor(roomsDir, assetsDir) {
    this.roomsDir = roomsDir;
    this.assetsDir = assetsDir || path.join(roomsDir, '..', '..', 'assets');
    if (!fs.existsSync(roomsDir)) {
      fs.mkdirSync(roomsDir, { recursive: true });
    }
  }

  listRooms() {
    if (!fs.existsSync(this.roomsDir)) return [];
    return fs.readdirSync(this.roomsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const roomPath = path.join(this.roomsDir, d.name);
        const params = this._readParams(roomPath);
        return {
          name: d.name,
          duration: params.duration || 60,
          maxHints: params.maxHints || 5,
          hasLogo: fs.existsSync(path.join(roomPath, 'logo.png'))
        };
      });
  }

  getRoom(roomName) {
    const roomPath = path.join(this.roomsDir, roomName);
    if (!fs.existsSync(roomPath)) return null;

    const params = this._readParams(roomPath);
    const languages = this._getLanguages(roomPath);
    const defaultLang = this._readDefaultLanguage(roomPath) || (languages[0] || 'English');

    return {
      name: roomName,
      ...params,
      languages,
      defaultLanguage: defaultLang
    };
  }

  saveRoom(roomData) {
    const roomPath = path.join(this.roomsDir, roomData.name);
    if (!fs.existsSync(roomPath)) {
      fs.mkdirSync(roomPath, { recursive: true });
    }

    // Save params.txt
    const paramsContent = [
      roomData.duration || 60,
      roomData.maxHints || 5,
      roomData.puzzleCount || 5,
      roomData.maxHints || 5,
      roomData.puzzleCount || 5,
      roomData.logo || 'logo.png',
      roomData.description || ''
    ].join('\n') + '\n';

    fs.writeFileSync(path.join(roomPath, 'params.txt'), paramsContent, 'utf-8');

    // Save extended config as JSON
    const config = {
      successMessage: roomData.successMessage || 'Congratulations! You escaped!',
      failMessage: roomData.failMessage || 'Time is up! You are trapped!',
      theme: roomData.theme || {
        backgroundColor: '#000000',
        timerColor: '#00ffcc',
        hintColor: '#ff9900',
        fontFamily: 'Orbitron'
      },
      countdownType: roomData.countdownType || 'S0',
      countdownEffect: roomData.countdownEffect || '',
      bgMedia: roomData.bgMedia || '',
      scheduledEvents: roomData.scheduledEvents || [],
      quickActions: roomData.quickActions || [],
      uupcControllers: roomData.uupcControllers || [],
      timerFontSize: roomData.timerFontSize || '180px',
      timerBorder: roomData.timerBorder || { style: 'none', color: '#ffffff', radius: '0', shadow: 'none' },
      fontUrl: roomData.fontUrl || '',
      idleScreen: roomData.idleScreen !== undefined ? roomData.idleScreen : true,
      getReadyCountdown: roomData.getReadyCountdown !== undefined ? roomData.getReadyCountdown : true,
      typingEffect: roomData.typingEffect !== undefined ? roomData.typingEffect : true,
      displayLayout: roomData.displayLayout || 'center',
      hintSchedule: roomData.hintSchedule || [],
      uupcPortNames: roomData.uupcPortNames || {},
      uupcAutoActions: roomData.uupcAutoActions || []
    };

    fs.writeFileSync(
      path.join(roomPath, 'config.json'),
      JSON.stringify(config, null, 2),
      'utf-8'
    );

    // Create hints directory structure
    const defaultLang = roomData.defaultLanguage || 'English';
    const hintsDir = path.join(roomPath, 'hints', defaultLang);
    if (!fs.existsSync(hintsDir)) {
      fs.mkdirSync(hintsDir, { recursive: true });
    }

    // Create other dirs
    ['main_theme', 'sounds'].forEach(dir => {
      const dirPath = path.join(roomPath, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    });

    // Save DefaultLanguage.sys
    fs.writeFileSync(
      path.join(roomPath, 'DefaultLanguage.sys'),
      defaultLang,
      'utf-8'
    );

    return { success: true, name: roomData.name };
  }

  getHints(roomName, language) {
    const hintsDir = path.join(this.roomsDir, roomName, 'hints', language || 'English');
    if (!fs.existsSync(hintsDir)) return [];

    const files = fs.readdirSync(hintsDir);
    const hints = [];

    // Group files by base name
    const processed = new Set();

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      const baseName = path.basename(file, ext);

      if (processed.has(baseName)) continue;

      if (ext === '.txt') {
        // Text hint
        const content = fs.readFileSync(path.join(hintsDir, file), 'utf-8');
        hints.push({ id: baseName, type: 'text', name: baseName, content });
        processed.add(baseName);
      } else if (ext === '.mp3' && files.includes(baseName + '.audioclue')) {
        // Audio hint
        hints.push({
          id: baseName, type: 'audio', name: baseName,
          filename: file,
          path: `/data/rooms/${roomName}/hints/${language || 'English'}/${file}`
        });
        processed.add(baseName);
      } else if (ext === '.png' && files.includes(baseName + '.image')) {
        // Image hint
        hints.push({
          id: baseName, type: 'image', name: baseName,
          filename: file,
          path: `/data/rooms/${roomName}/hints/${language || 'English'}/${file}`
        });
        processed.add(baseName);
      } else if (ext === '.jpg' && files.includes(baseName + '.image')) {
        hints.push({
          id: baseName, type: 'image', name: baseName,
          filename: file,
          path: `/data/rooms/${roomName}/hints/${language || 'English'}/${file}`
        });
        processed.add(baseName);
      } else if (ext === '.mp4' && files.includes(baseName + '.videoclue')) {
        // Video hint
        hints.push({
          id: baseName, type: 'video', name: baseName,
          filename: file,
          path: `/data/rooms/${roomName}/hints/${language || 'English'}/${file}`
        });
        processed.add(baseName);
      } else if (ext === '.txt') {
        // Fallback text
        const content = fs.readFileSync(path.join(hintsDir, file), 'utf-8');
        hints.push({ id: baseName, type: 'text', name: baseName, content });
        processed.add(baseName);
      }
    }

    // Sort by order.json if it exists, otherwise alphabetically
    const orderFile = path.join(hintsDir, 'order.json');
    if (fs.existsSync(orderFile)) {
      try {
        const order = JSON.parse(fs.readFileSync(orderFile, 'utf-8'));
        hints.sort((a, b) => {
          const idxA = order.indexOf(a.name);
          const idxB = order.indexOf(b.name);
          // Items not in order.json go to the end
          const posA = idxA === -1 ? order.length : idxA;
          const posB = idxB === -1 ? order.length : idxB;
          return posA - posB;
        });
      } catch (e) {
        hints.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      }
    } else {
      hints.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    }

    return hints;
  }

  saveScore(roomName, scoreData) {
    const scoresFile = path.join(this.roomsDir, roomName, 'scores.json');
    let scores = [];
    if (fs.existsSync(scoresFile)) {
      try { scores = JSON.parse(fs.readFileSync(scoresFile, 'utf-8')); } catch (e) { scores = []; }
    }
    scores.push({
      ...scoreData,
      timestamp: new Date().toISOString()
    });
    fs.writeFileSync(scoresFile, JSON.stringify(scores, null, 2), 'utf-8');
    return { success: true };
  }

  getScores(roomName) {
    const scoresFile = path.join(this.roomsDir, roomName, 'scores.json');
    if (!fs.existsSync(scoresFile)) return [];
    try { return JSON.parse(fs.readFileSync(scoresFile, 'utf-8')); } catch (e) { return []; }
  }

  getAllScores() {
    const rooms = this.listRooms();
    const all = [];
    for (const room of rooms) {
      const scores = this.getScores(room.name);
      scores.forEach(s => all.push({ ...s, roomName: room.name }));
    }
    all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return all;
  }

  deleteRoom(roomName) {
    const roomPath = path.join(this.roomsDir, roomName);
    if (!fs.existsSync(roomPath)) return { success: false, error: 'Room not found' };
    fs.rmSync(roomPath, { recursive: true, force: true });
    return { success: true };
  }

  getSounds(roomName) {
    const sounds = [];

    // Room-specific sounds
    const roomSoundsDir = path.join(this.roomsDir, roomName, 'sounds');
    if (fs.existsSync(roomSoundsDir)) {
      fs.readdirSync(roomSoundsDir)
        .filter(f => /\.(mp3|wav|ogg)$/i.test(f))
        .forEach(f => sounds.push({
          name: path.basename(f, path.extname(f)),
          filename: f,
          path: `/data/rooms/${roomName}/sounds/${f}`
        }));
    }

    // Global sounds
    const globalSoundsDir = path.join(this.roomsDir, '..', '..', 'assets', 'sounds');
    if (fs.existsSync(globalSoundsDir)) {
      fs.readdirSync(globalSoundsDir)
        .filter(f => /\.(mp3|wav|ogg)$/i.test(f))
        .forEach(f => sounds.push({
          name: path.basename(f, path.extname(f)),
          filename: f,
          path: `/assets/sounds/${f}`
        }));
    }

    return sounds;
  }

  // --- Hint file operations ---

  saveHintFile(roomName, language, fileName, sourceFilePath) {
    const hintsDir = path.join(this.roomsDir, roomName, 'hints', language || 'English');
    if (!fs.existsSync(hintsDir)) {
      fs.mkdirSync(hintsDir, { recursive: true });
    }
    const destPath = path.join(hintsDir, fileName);
    fs.copyFileSync(sourceFilePath, destPath);

    // Create marker file based on extension
    const ext = path.extname(fileName).toLowerCase();
    const baseName = path.basename(fileName, ext);
    if (['.mp3', '.wav', '.ogg'].includes(ext)) {
      fs.writeFileSync(path.join(hintsDir, baseName + '.audioclue'), '', 'utf-8');
    } else if (['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'].includes(ext)) {
      fs.writeFileSync(path.join(hintsDir, baseName + '.image'), '', 'utf-8');
    } else if (['.mp4', '.webm', '.avi', '.mov'].includes(ext)) {
      fs.writeFileSync(path.join(hintsDir, baseName + '.videoclue'), '', 'utf-8');
    }

    return { success: true, fileName };
  }

  deleteHint(roomName, language, fileName) {
    const hintsDir = path.join(this.roomsDir, roomName, 'hints', language || 'English');
    const filePath = path.join(hintsDir, fileName);

    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Hint file not found' };
    }

    const ext = path.extname(fileName).toLowerCase();
    const baseName = path.basename(fileName, ext);

    // Delete the main file
    fs.unlinkSync(filePath);

    // Delete associated marker files if they exist
    const markers = ['.audioclue', '.image', '.videoclue'];
    for (const marker of markers) {
      const markerPath = path.join(hintsDir, baseName + marker);
      if (fs.existsSync(markerPath)) {
        fs.unlinkSync(markerPath);
      }
    }

    // Update order.json if it exists
    const orderFile = path.join(hintsDir, 'order.json');
    if (fs.existsSync(orderFile)) {
      try {
        let order = JSON.parse(fs.readFileSync(orderFile, 'utf-8'));
        order = order.filter(name => name !== baseName);
        fs.writeFileSync(orderFile, JSON.stringify(order, null, 2), 'utf-8');
      } catch (e) {
        // ignore
      }
    }

    return { success: true };
  }

  createTextHint(roomName, language, name, content) {
    const hintsDir = path.join(this.roomsDir, roomName, 'hints', language || 'English');
    if (!fs.existsSync(hintsDir)) {
      fs.mkdirSync(hintsDir, { recursive: true });
    }
    const filePath = path.join(hintsDir, name + '.txt');
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true, name };
  }

  updateTextHint(roomName, language, name, content) {
    const hintsDir = path.join(this.roomsDir, roomName, 'hints', language || 'English');
    const filePath = path.join(hintsDir, name + '.txt');
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Hint file not found' };
    }
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true, name };
  }

  reorderHints(roomName, language, orderedNames) {
    const hintsDir = path.join(this.roomsDir, roomName, 'hints', language || 'English');
    if (!fs.existsSync(hintsDir)) {
      return { success: false, error: 'Hints directory not found' };
    }
    const orderFile = path.join(hintsDir, 'order.json');
    fs.writeFileSync(orderFile, JSON.stringify(orderedNames, null, 2), 'utf-8');
    return { success: true };
  }

  // --- File upload operations ---

  saveLogo(roomName, sourceFilePath) {
    const roomPath = path.join(this.roomsDir, roomName);
    if (!fs.existsSync(roomPath)) {
      return { success: false, error: 'Room not found' };
    }
    const destPath = path.join(roomPath, 'logo.png');
    fs.copyFileSync(sourceFilePath, destPath);
    return { success: true };
  }

  saveBackground(fileName, sourceFilePath) {
    const bgDir = path.join(this.assetsDir, 'backgrounds');
    if (!fs.existsSync(bgDir)) {
      fs.mkdirSync(bgDir, { recursive: true });
    }
    const destPath = path.join(bgDir, fileName);
    fs.copyFileSync(sourceFilePath, destPath);
    return { success: true, fileName };
  }

  saveRoomSound(roomName, fileName, sourceFilePath) {
    const soundsDir = path.join(this.roomsDir, roomName, 'sounds');
    if (!fs.existsSync(soundsDir)) {
      fs.mkdirSync(soundsDir, { recursive: true });
    }
    const destPath = path.join(soundsDir, fileName);
    fs.copyFileSync(sourceFilePath, destPath);
    return { success: true, fileName };
  }

  saveGlobalSound(fileName, sourceFilePath) {
    const soundsDir = path.join(this.assetsDir, 'sounds');
    if (!fs.existsSync(soundsDir)) {
      fs.mkdirSync(soundsDir, { recursive: true });
    }
    const destPath = path.join(soundsDir, fileName);
    fs.copyFileSync(sourceFilePath, destPath);
    return { success: true, fileName };
  }

  // --- UUPC helpers ---

  saveUupcPortNames(roomName, portNames) {
    const roomPath = path.join(this.roomsDir, roomName);
    const configFile = path.join(roomPath, 'config.json');
    let config = {};
    if (fs.existsSync(configFile)) {
      try { config = JSON.parse(fs.readFileSync(configFile, 'utf-8')); } catch (e) { config = {}; }
    }
    config.uupcPortNames = portNames;
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8');
    return { success: true };
  }

  getUupcPortNames(roomName) {
    const roomPath = path.join(this.roomsDir, roomName);
    const configFile = path.join(roomPath, 'config.json');
    if (!fs.existsSync(configFile)) return {};
    try {
      const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
      return config.uupcPortNames || {};
    } catch (e) {
      return {};
    }
  }

  // --- Private helpers ---

  _readParams(roomPath) {
    const paramsFile = path.join(roomPath, 'params.txt');
    const configFile = path.join(roomPath, 'config.json');

    let params = {
      duration: 60,
      maxHints: 5,
      description: '',
      logo: 'logo.png',
      successMessage: 'Congratulations! You escaped!',
      failMessage: 'Time is up! You are trapped!',
      theme: {
        backgroundColor: '#000000',
        timerColor: '#00ffcc',
        hintColor: '#ff9900',
        fontFamily: 'Orbitron'
      },
      countdownType: 'S0',
      scheduledEvents: [],
      quickActions: [],
      timerFontSize: '180px',
      timerBorder: { style: 'none', color: '#ffffff', radius: '0', shadow: 'none' },
      fontUrl: '',
      idleScreen: true,
      getReadyCountdown: true,
      typingEffect: true,
      displayLayout: 'center',
      hintSchedule: [],
      uupcPortNames: {},
      uupcAutoActions: []
    };

    // Read params.txt
    if (fs.existsSync(paramsFile)) {
      const lines = fs.readFileSync(paramsFile, 'utf-8').split('\n');
      if (lines[0]) params.duration = parseInt(lines[0], 10) || 60;
      if (lines[1]) params.maxHints = parseInt(lines[1], 10) || 5;
      if (lines[5]) params.logo = lines[5].trim();
      if (lines[6]) params.description = lines[6].trim();
    }

    // Read our extended config.json
    if (fs.existsSync(configFile)) {
      try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
        Object.assign(params, config);
      } catch (e) {
        // ignore malformed config
      }
    }

    return params;
  }

  _getLanguages(roomPath) {
    const hintsDir = path.join(roomPath, 'hints');
    if (!fs.existsSync(hintsDir)) return [];
    return fs.readdirSync(hintsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  }

  _readDefaultLanguage(roomPath) {
    const langFile = path.join(roomPath, 'DefaultLanguage.sys');
    if (!fs.existsSync(langFile)) return null;
    return fs.readFileSync(langFile, 'utf-8').trim();
  }
}

module.exports = RoomManager;
