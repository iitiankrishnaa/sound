# SyncBeat 🎵
> **Turn your devices into one synchronized speaker system.**

SyncBeat enables multiple phones, tablets, laptops, and desktop computers to behave like a single distributed speaker array. One device acts as the **Host / Controller**, while other devices join as **Speakers** via instant camera QR-code scanning or a 5-character room code.

---

## Key Features

1. **High-Precision Synchronization Engine**
   - **NTP-Style Network Clock Synchronization:** Uses Cristian's algorithm with outlier filtering to lock client clocks to server UTC time with millisecond accuracy.
   - **Web Audio API Hardware DAC Scheduling:** Audio buffers are preloaded and scheduled at exact hardware clock ticks (`AudioContext.currentTime`).
   - **Smooth Micro-Drift Correction:** Continually compares playback position against expected time. Micro-nudges `playbackRate` by ±0.5% for 300ms to eliminate echo without perceptible pitch shifts or audio dropouts.

2. **Zero-Friction Joining**
   - No login, no app store installation, no accounts.
   - Automatic local Wi-Fi IP detection (`http://192.168.1.X:5173`) embedded into the QR code.
   - Any phone camera can scan and activate as a speaker within 3 seconds.

3. **Multi-Source Audio Engine**
   - **Studio Audio Tracks:** Built-in royalty-free Lo-Fi, Synthwave, Funk, and Acoustic tracks generated for instantaneous offline playback.
   - **Instant Metronome Pulse (120 BPM):** 100% synthesized in Web Audio API with zero network download for immediate echo testing.
   - **Host Custom File Upload:** Drag and drop your own MP3, WAV, or FLAC files—automatically distributed and cached across all connected speakers.
   - **YouTube Coordinated Player:** Official YouTube IFrame Player integration with synchronized play/pause/seek and technical transparency documentation.

4. **Hardware Delay Calibration**
   - Compensates for Bluetooth latency, external soundbars, or DAC differences.
   - Interactive calibration drawer with test ticks and fine adjustment stepper (`-10ms`, `-1ms`, `+1ms`, `+10ms`, `0 to ±1000ms`).
   - Persisted in device `localStorage`.

5. **Production PWA & Mobile UX**
   - Web App Manifest and Service Worker for installation to mobile home screens.
   - Explicit user-gesture activation overlay complying with iOS Safari and Android Chrome autoplay policies.
   - **Screen WakeLock API** to prevent phone displays from sleeping and throttling background timers during parties.
   - Responsive dark glassmorphic UI with animated beat visualizers.

---

## Quick Start

### 1. Install Dependencies
```bash
# In the root directory
npm install

# In the server directory
cd server && npm install

# In the client directory
cd ../client && npm install
```

### 2. Run in Development Mode
From the root directory:
```bash
npm run dev
```
This starts:
- **Backend WebSocket Server** on `http://localhost:3000` (and on your local Wi-Fi IP `http://192.168.X.X:3000`).
- **Frontend Vite Client** on `http://localhost:5173`.

### 3. Testing with Multiple Devices
1. Open `http://localhost:5173` on your PC and click **Create Room**.
2. Click **Show QR Code** on the host dashboard.
3. Open your mobile phone's camera (connected to the same Wi-Fi) and scan the QR code.
4. On your phone, tap **ACTIVATE SPEAKER**.
5. Press **Play** on the PC host. Both devices will play in tight synchrony!

---

## Production Deployment

### Single-Command Production Build
```bash
npm run build
```
This compiles the React frontend into `client/dist` and compiles the TypeScript server into `server/dist`.

### Start Production Server
```bash
npm start
```
The Express server serves the static frontend, WebSocket endpoints, and audio streams on port `3000` (or `PORT` environment variable).

---

## Architecture Diagram

```
HOST CONTROLLER (PC / Mac / Phone)
  │
  ├─► [Socket.IO] Play / Pause / Seek / Change Track
  │
SERVER (Node.js + Socket.IO)
  │
  ├─► NTP Clock Pong (t0, t1, t2)
  ├─► Broadcast PlaybackState { track, position, targetServerTime }
  │
SPEAKER CLIENTS (Phones, Laptops, Tablets)
  │
  ├─► NTP Clock Sync Filter (RTT & Offset Calculation)
  ├─► Web Audio API Buffer Scheduling (AudioContext.currentTime)
  ├─► Output Latency Calibration Offset (±1000ms)
  └─► Drift Detection & 0.5% Micro-Nudge Correction
```
