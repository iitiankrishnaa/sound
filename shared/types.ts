export type SyncQuality = 'excellent' | 'good' | 'fair' | 'poor';

export type TrackSourceType = 'studio' | 'synth' | 'upload' | 'youtube';

export interface TrackInfo {
  id: string;
  title: string;
  artist: string;
  duration: number; // in seconds
  url: string;
  artwork?: string;
  sourceType: TrackSourceType;
  youtubeVideoId?: string;
  bpm?: number;
}

export interface PlaybackState {
  isPlaying: boolean;
  track: TrackInfo | null;
  position: number; // position in seconds at targetServerTime
  targetServerTime: number; // timestamp in server milliseconds when position was recorded
  playbackRate: number;
  sourceType: TrackSourceType;
}

export interface SpeakerDevice {
  id: string;
  socketId: string;
  name: string;
  isHost: boolean;
  isMuted: boolean;
  volume: number; // 0.0 to 1.0 (software volume)
  latencyMs: number; // calculated one-way latency
  driftMs: number; // measured drift vs expected position
  syncQuality: SyncQuality;
  batteryLevel?: number | null; // 0.0 to 1.0 or null
  isCharging?: boolean | null;
  lastSeen: number;
  calibrationOffsetMs: number; // user manual output calibration offset (-1000 to +1000)
  isAudioUnlocked: boolean;
  userAgent?: string;
  deviceType?: 'phone' | 'tablet' | 'desktop' | 'unknown';
}

export interface Room {
  id: string;
  hostSocketId: string;
  hostToken: string;
  pin?: string;
  isLocked: boolean;
  createdAt: number;
  lastActivity: number;
  speakers: Record<string, SpeakerDevice>;
  currentPlayback: PlaybackState;
}

export interface SyncPingPayload {
  t0: number; // client high-res timestamp (performance.now())
}

export interface SyncPongPayload {
  t0: number; // original client timestamp
  t1: number; // server receive time
  t2: number; // server transmit time
}

export interface ServerNetworkInfo {
  localIp: string;
  port: number;
  lanUrl: string;
}
