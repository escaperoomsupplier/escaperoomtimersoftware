const fs = require('fs');
const path = require('path');

class RoomManager {
  constructor(roomsDir) {
    this.roomsDir = roomsDir;
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
      uupcControllers: roomData.uupcControllers || []
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

    // Sort by name
    hints.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

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
      quickActions: []
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
