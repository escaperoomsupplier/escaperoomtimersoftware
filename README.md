# Escape Room Timer & Hint Delivery System

A desktop application for managing escape room sessions. Game Masters use the dashboard to control a timer display shown on a second screen in the room.

Built with Electron, Express, and Socket.IO.

## Features

- **Dashboard** — control panel for the Game Master (start/pause/reset timer, send hints, end game)
- **Timer Display** — fullscreen countdown shown on a second monitor in the room
- **Real-time sync** — dashboard and timer display communicate via WebSocket
- **Multiple rooms** — create and configure rooms with different durations, hints, and messages
- **Hint types** — text, audio, image, and video hints
- **Countdown modes** — standard (MM:SS), total seconds, percentage, count-up
- **Light/Dark theme** — theme switcher in the dashboard

## Requirements

- [Node.js](https://nodejs.org/) 18 or later
- npm (comes with Node.js)

## Installation

```bash
git clone https://github.com/escaperoomsupplier/escaperoomtimersoftware.git
cd escaperoomtimersoftware
npm install
```

## Usage

```bash
npm start
```

This opens the Game Master dashboard. To show the timer on a second screen:

1. Click **Open Display** in the sidebar — this opens `http://localhost:3333/room` in a browser
2. Drag the browser window to your second monitor and press **F11** for fullscreen
3. Select a room from the dashboard and click **Open Room**
4. Use **Start / Pause / Reset** to control the timer
5. Click hints to send them to the room display
6. End the game with **End — Success** or **End — Fail**

### Development mode

Opens DevTools automatically:

```bash
npm run dev
```

## Room Configuration

Rooms are stored in `data/rooms/`. Each room has this structure:

```
data/rooms/My Room/
├── params.txt              # Duration, hint count, description
├── config.json             # Extended settings (theme, messages, countdown type)
├── DefaultLanguage.sys     # Default language
├── logo.png                # Room logo (optional)
├── hints/
│   └── English/
│       ├── Puzzle 1.txt    # Text hint (HTML content)
│       ├── Audio 1.mp3     # Audio hint (pair with .audioclue marker)
│       ├── Audio 1.audioclue
│       ├── Image 1.png     # Image hint (pair with .image marker)
│       ├── Image 1.image
│       ├── Video 1.mp4     # Video hint (pair with .videoclue marker)
│       └── Video 1.videoclue
├── main_theme/             # Background music
└── sounds/                 # Sound effects
```

You can also create rooms from the dashboard UI via **New Room**.

## Architecture

```
Electron Main Process
├── Express (port 3333) — serves timer display
├── Socket.IO — real-time events between dashboard and display
└── Room Manager — reads/writes room configs from data/rooms/

Dashboard (Electron window) ──Socket.IO──▸ Timer Display (browser)
```

## License

MIT
