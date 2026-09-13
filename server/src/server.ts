import express from 'express';
import net from 'net';
import http from 'http';
import https from 'https';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { fileURLToPath } from 'url';
import selfsigned from 'selfsigned';
import { getLocalIpAddress } from './network.js';
import { RoomManager, DEFAULT_TRACKS } from './roomManager.js';
import { setupSocketHandlers } from './socketHandler.js';
import { ensureDefaultAudioFiles } from './audioGenerator.js';
import { TrackInfo } from '../../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const app = express();

// Enable CORS for frontend development
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.use(express.json());

// Robust resolution for project root and server directories
function findServerDir(): string {
  if (fs.existsSync(path.resolve(process.cwd(), 'server', 'package.json'))) {
    return path.resolve(process.cwd(), 'server');
  }
  if (fs.existsSync(path.resolve(process.cwd(), 'package.json'))) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
      if (pkg.name === 'syncbeat-server') {
        return process.cwd();
      }
    } catch {}
  }
  let curr = __dirname;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(curr, 'server', 'package.json'))) {
      return path.join(curr, 'server');
    }
    if (fs.existsSync(path.join(curr, 'package.json'))) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(curr, 'package.json'), 'utf8'));
        if (pkg.name === 'syncbeat-server') return curr;
      } catch {}
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return path.resolve(__dirname, '..');
}

const serverDir = findServerDir();
const rootDir = path.resolve(serverDir, '..');
const publicDir = path.resolve(serverDir, 'public');
const audioDir = path.join(publicDir, 'audio');
const uploadsDir = path.resolve(serverDir, 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Generate built-in audio tracks so offline playback works out of the box
try {
  ensureDefaultAudioFiles(audioDir);
} catch (err) {
  console.error('[AudioGenerator] Warning: Could not generate audio files', err);
}

// Serve public static audio files
app.use('/audio', express.static(audioDir));

// Multer setup for host custom audio file uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `upload-${Date.now()}-${Math.random().toString(36).substring(2, 9)}${ext}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext) || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files (MP3, WAV, AAC, M4A, OGG, FLAC) are supported.'));
    }
  }
});

// Custom audio upload endpoint
app.post('/api/upload-track', upload.single('audio'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file uploaded.' });
  }

  const rawTitle = path.basename(req.file.originalname, path.extname(req.file.originalname));
  const cleanTitle = rawTitle.replace(/[_-]/g, ' ').trim();

  const newTrack: TrackInfo = {
    id: `track-${req.file.filename}`,
    title: cleanTitle || 'Uploaded Audio Track',
    artist: 'Host Custom Audio',
    duration: 180,
    url: `/api/uploads/${req.file.filename}`,
    sourceType: 'upload',
    artwork: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80'
  };

  return res.json({ success: true, track: newTrack });
});

// Serve uploaded audio files
app.use('/api/uploads', express.static(uploadsDir));

// Network discovery endpoint: returns local LAN IP for QR codes
const localIp = getLocalIpAddress();

app.get('/api/network-info', (req, res) => {
  const renderUrl = process.env.RENDER_EXTERNAL_URL;
  const hostHeader = req.headers.host;
  let publicUrl = `http://${localIp}:${PORT}`;

  if (renderUrl) {
    publicUrl = renderUrl;
  } else if (hostHeader && !hostHeader.includes('localhost') && !hostHeader.includes('127.0.0.1') && !hostHeader.startsWith('10.') && !hostHeader.startsWith('192.168.')) {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    publicUrl = `${proto}://${hostHeader}`;
  }

  res.json({
    localIp,
    port: PORT,
    lanUrl: publicUrl
  });
});

// Default available tracks endpoint
app.get('/api/tracks', (_req, res) => {
  res.json({ tracks: DEFAULT_TRACKS });
});

// Serve built frontend assets if dist folder exists
const clientDist = path.resolve(rootDir, 'client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Generate self-signed certificate for dual HTTPS support
let pems: { private: string; cert: string } | null = null;
try {
  const generated = await selfsigned.generate(
    [{ name: 'commonName', value: 'SyncBeat' }],
    {
      algorithm: 'sha256',
      keySize: 2048,
      extensions: [
        {
          name: 'subjectAltName',
          altNames: [
            { type: 2, value: 'localhost' },
            { type: 7, ip: localIp },
            { type: 7, ip: '127.0.0.1' }
          ]
        }
      ]
    }
  );
  pems = { private: generated.private, cert: generated.cert };
} catch (e) {
  console.warn('[Server] Could not generate self-signed cert, running HTTP only:', e);
}

// Create HTTP and HTTPS internal servers
const httpServer = http.createServer(app);
const httpsServer = pems ? https.createServer({ key: pems.private, cert: pems.cert }, app) : null;

// Room Manager & Socket.IO
const roomManager = new RoomManager();
const io = new Server({
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingInterval: 10000,
  pingTimeout: 5000,
  transports: ['websocket', 'polling']
});

io.attach(httpServer);
if (httpsServer) {
  io.attach(httpsServer);
}

setupSocketHandlers(io, roomManager);

// Master Protocol Multiplexer: Allows BOTH http:// and https:// on port 3000!
const masterServer = net.createServer((socket) => {
  socket.once('data', (buffer) => {
    socket.pause();
    socket.unshift(buffer);
    // 0x16 = 22 is the first byte of a TLS Handshake (ClientHello)
    if (buffer[0] === 22 && httpsServer) {
      httpsServer.emit('connection', socket);
    } else {
      httpServer.emit('connection', socket);
    }
    process.nextTick(() => socket.resume());
  });

  socket.on('error', () => {
    // Ignore unexpected client socket resets
  });
});

masterServer.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ===============================================================
  🎵 SyncBeat Dual-Protocol Server is running!
  ---------------------------------------------------------------
  Local Host:    http://localhost:${PORT}
  Mobile Wi-Fi:  http://${localIp}:${PORT}
  Secure HTTPS:  https://${localIp}:${PORT}
  ===============================================================
  `);
});
