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

// Serve public static audio files with CORS & CORP headers
app.use('/audio', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Accept-Ranges', 'bytes');
  next();
}, express.static(audioDir));

// Multer setup for host custom audio file uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.mp3';
    const cleanExt = ext.replace(/[^a-z0-9.]/gi, '');
    const uniqueName = `upload-${Date.now()}-${Math.random().toString(36).substring(2, 9)}${cleanExt}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB max for high-quality audio
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = [
      '.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac',
      '.weba', '.webm', '.opus', '.aif', '.aiff', '.caf', '.mp4'
    ];
    // Permissive check for mobile uploads which often send application/octet-stream or video/mp4
    if (
      allowedExts.includes(ext) ||
      file.mimetype.startsWith('audio/') ||
      file.mimetype === 'application/octet-stream' ||
      file.mimetype === 'video/mp4' ||
      file.mimetype === 'video/ogg' ||
      file.mimetype === 'video/webm'
    ) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext || file.mimetype}. Please upload an audio file (MP3, WAV, AAC, M4A, OGG, FLAC).`));
    }
  }
});

// Custom audio upload endpoint with explicit error trapping
app.post('/api/upload-track', (req, res) => {
  upload.single('audio')(req, res, (err: any) => {
    if (err) {
      console.error('[Server Upload] Error during upload:', err.message || err);
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'File is too large. Maximum allowed size is 100 MB.'
        : (err.message || 'File upload failed');
      return res.status(400).json({ success: false, error: message });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No audio file received in request.' });
    }

    try {
      const rawTitle = path.basename(req.file.originalname, path.extname(req.file.originalname));
      const cleanTitle = rawTitle.replace(/[_-]/g, ' ').trim() || 'Uploaded Audio Track';
      const duration = parseFloat(req.body.duration) || 180;
      const artist = req.body.artist ? String(req.body.artist).trim() : 'Host Custom Audio';

      const newTrack: TrackInfo = {
        id: `track-${req.file.filename}`,
        title: cleanTitle,
        artist: artist,
        duration: duration,
        url: `/api/uploads/${req.file.filename}`,
        sourceType: 'upload',
        artwork: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80'
      };

      console.log(`[Server Upload] Audio uploaded: ${newTrack.title} (${req.file.filename}, ${(req.file.size / 1024 / 1024).toFixed(2)} MB, duration: ${duration}s)`);
      return res.json({ success: true, track: newTrack });
    } catch (procErr: any) {
      console.error('[Server Upload] Failed to process track metadata:', procErr);
      return res.status(500).json({ success: false, error: 'Failed to process uploaded track metadata' });
    }
  });
});

// Serve uploaded audio files with CORS & range requests support
app.use('/api/uploads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Accept-Ranges', 'bytes');
  next();
}, express.static(uploadsDir));

// Network discovery endpoint: returns local LAN IP for QR codes
const localIp = getLocalIpAddress();

app.get('/api/network-info', (req, res) => {
  const renderUrl = process.env.RENDER_EXTERNAL_URL;
  const forwardedHost = (req.headers['x-forwarded-host'] as string) || req.headers.host;
  const proto = (req.headers['x-forwarded-proto'] as string) || (req.secure ? 'https' : 'http');
  let publicUrl = `http://${localIp}:${PORT}`;

  if (renderUrl) {
    publicUrl = renderUrl;
  } else if (forwardedHost && !forwardedHost.includes('localhost') && !forwardedHost.includes('127.0.0.1') && !forwardedHost.startsWith('10.') && !forwardedHost.startsWith('192.168.')) {
    publicUrl = `${proto}://${forwardedHost}`;
  } else if (isCloudProduction && forwardedHost) {
    publicUrl = `https://${forwardedHost}`;
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

// Global Error Handling Middleware for Express
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server] Unhandled Express Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

// Create HTTP and HTTPS internal servers
const httpServer = http.createServer(app);
const isCloudProduction = !!process.env.RENDER || !!process.env.RENDER_EXTERNAL_URL || process.env.NODE_ENV === 'production';

// In cloud hosting (like Render), TLS is terminated at the edge reverse proxy.
// Only generate self-signed cert in local environments where dual HTTP/HTTPS is desired.
let pems: { private: string; cert: string } | null = null;
if (!isCloudProduction) {
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
}

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

// In cloud environments (Render) or when no HTTPS cert, bind directly to httpServer
// to ensure zero TCP socket unshift buffering issues on large multipart file uploads
if (isCloudProduction || !httpsServer) {
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`
  ===============================================================
  🎵 SyncBeat Cloud Server running on PORT ${PORT}!
  ---------------------------------------------------------------
  Environment:   ${isCloudProduction ? 'Cloud Production (Render)' : 'Local Direct'}
  URL:           http://localhost:${PORT} / ${process.env.RENDER_EXTERNAL_URL || `http://${localIp}:${PORT}`}
  ===============================================================
    `);
  });
} else {
  // Local Master Protocol Multiplexer: Allows BOTH http:// and https:// on port 3000!
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
}
