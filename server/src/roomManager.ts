import crypto from 'crypto';
import { Room, SpeakerDevice, PlaybackState, TrackInfo } from '../../shared/types.js';

// Default built-in royalty-free / synthetic tracks
export const DEFAULT_TRACKS: TrackInfo[] = [
  {
    id: 'track-sync-pulse',
    title: 'Sync Metronome Pulse (120 BPM)',
    artist: 'SyncBeat Calibration Test',
    duration: 300,
    url: '/audio/test-pulse.wav',
    sourceType: 'synth',
    bpm: 120,
    artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80'
  },
  {
    id: 'track-neon-synth',
    title: 'Neon Horizon',
    artist: 'Future Groove',
    duration: 184,
    url: '/audio/neon-horizon.mp3',
    sourceType: 'studio',
    bpm: 124,
    artwork: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400&q=80'
  },
  {
    id: 'track-lofi-chill',
    title: 'Midnight Coffee Lofi',
    artist: 'Chill Station',
    duration: 215,
    url: '/audio/lofi-chill.mp3',
    sourceType: 'studio',
    bpm: 85,
    artwork: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=400&q=80'
  },
  {
    id: 'track-acoustic-breeze',
    title: 'Golden Sunset Acoustic',
    artist: 'Acoustic Duo',
    duration: 198,
    url: '/audio/acoustic-breeze.mp3',
    sourceType: 'studio',
    bpm: 96,
    artwork: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=400&q=80'
  }
];

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private socketToRoom: Map<string, string> = new Map(); // socketId -> roomId

  constructor() {
    // Run cleanup every 5 minutes
    setInterval(() => this.cleanupInactiveRooms(), 5 * 60 * 1000);
  }

  // Generate 5-character readable code (e.g. A7K92)
  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // exclude 0, O, 1, I
    let code = '';
    do {
      code = '';
      for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } while (this.rooms.has(code));
    return code;
  }

  public createRoom(hostSocketId: string, options?: { pin?: string; hostName?: string }): Room {
    const roomId = this.generateRoomCode();
    const hostToken = crypto.randomBytes(16).toString('hex');
    const now = Date.now();

    const hostSpeaker: SpeakerDevice = {
      id: hostSocketId,
      socketId: hostSocketId,
      name: options?.hostName || 'Host Controller',
      isHost: true,
      isMuted: false,
      volume: 1.0,
      latencyMs: 0,
      driftMs: 0,
      syncQuality: 'excellent',
      batteryLevel: null,
      isCharging: null,
      lastSeen: now,
      calibrationOffsetMs: 0,
      isAudioUnlocked: true,
      deviceType: 'desktop'
    };

    const initialPlayback: PlaybackState = {
      isPlaying: false,
      track: DEFAULT_TRACKS[0],
      position: 0,
      targetServerTime: now,
      playbackRate: 1.0,
      sourceType: 'synth'
    };

    const room: Room = {
      id: roomId,
      hostSocketId,
      hostToken,
      pin: options?.pin?.trim() || undefined,
      isLocked: false,
      createdAt: now,
      lastActivity: now,
      speakers: {
        [hostSocketId]: hostSpeaker
      },
      currentPlayback: initialPlayback
    };

    this.rooms.set(roomId, room);
    this.socketToRoom.set(hostSocketId, roomId);

    console.log(`[RoomManager] Created room ${roomId} by host ${hostSocketId}`);
    return room;
  }

  public getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId.toUpperCase());
  }

  public getRoomBySocketId(socketId: string): Room | undefined {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) return undefined;
    return this.rooms.get(roomId);
  }

  public joinRoom(
    roomIdInput: string,
    socketId: string,
    deviceName: string,
    pin?: string,
    hostToken?: string
  ): { success: boolean; room?: Room; isHost?: boolean; error?: string } {
    if (!roomIdInput || typeof roomIdInput !== 'string') {
      return { success: false, error: 'Please enter a valid 5-character room code.' };
    }

    const roomId = roomIdInput.replace(/[^a-zA-Z0-9]/g, '').trim().toUpperCase();
    const room = this.rooms.get(roomId);

    if (!room) {
      return { success: false, error: `Room "${roomId}" was not found. Please verify the code or ask the host.` };
    }

    if (room.isLocked && (!hostToken || hostToken !== room.hostToken)) {
      return { success: false, error: 'This room is currently locked by the host.' };
    }

    if (room.pin && (!hostToken || hostToken !== room.hostToken)) {
      if (!pin || !pin.trim()) {
        return { success: false, error: 'This room is protected by a PIN. Please enter the PIN.' };
      }
      if (room.pin !== pin.trim()) {
        return { success: false, error: 'Incorrect PIN for this room.' };
      }
    }

    const isHostReconnecting = hostToken && hostToken === room.hostToken;
    const now = Date.now();
    room.lastActivity = now;

    if (isHostReconnecting) {
      // Host reconnected with new socketId
      const oldHostSocketId = room.hostSocketId;
      delete room.speakers[oldHostSocketId];
      this.socketToRoom.delete(oldHostSocketId);

      room.hostSocketId = socketId;
      room.speakers[socketId] = {
        id: socketId,
        socketId,
        name: deviceName || 'Host Controller',
        isHost: true,
        isMuted: false,
        volume: 1.0,
        latencyMs: 0,
        driftMs: 0,
        syncQuality: 'excellent',
        lastSeen: now,
        calibrationOffsetMs: 0,
        isAudioUnlocked: true,
        deviceType: 'desktop'
      };
      this.socketToRoom.set(socketId, roomId);
      return { success: true, room, isHost: true };
    }

    // New or reconnecting speaker
    const speaker: SpeakerDevice = {
      id: socketId,
      socketId,
      name: deviceName || `Speaker ${Object.keys(room.speakers).length + 1}`,
      isHost: false,
      isMuted: false,
      volume: 1.0,
      latencyMs: 0,
      driftMs: 0,
      syncQuality: 'excellent',
      batteryLevel: null,
      isCharging: null,
      lastSeen: now,
      calibrationOffsetMs: 0,
      isAudioUnlocked: false,
      deviceType: 'phone'
    };

    room.speakers[socketId] = speaker;
    this.socketToRoom.set(socketId, roomId);

    console.log(`[RoomManager] Speaker ${speaker.name} (${socketId}) joined room ${roomId}`);
    return { success: true, room, isHost: false };
  }

  public updateSpeakerMetrics(
    socketId: string,
    metrics: {
      latencyMs: number;
      driftMs: number;
      syncQuality: SpeakerDevice['syncQuality'];
      batteryLevel?: number | null;
      isCharging?: boolean | null;
      isAudioUnlocked?: boolean;
    }
  ): Room | undefined {
    const room = this.getRoomBySocketId(socketId);
    if (!room || !room.speakers[socketId]) return undefined;

    const speaker = room.speakers[socketId];
    speaker.latencyMs = metrics.latencyMs;
    speaker.driftMs = metrics.driftMs;
    speaker.syncQuality = metrics.syncQuality;
    speaker.lastSeen = Date.now();
    if (metrics.batteryLevel !== undefined) speaker.batteryLevel = metrics.batteryLevel;
    if (metrics.isCharging !== undefined) speaker.isCharging = metrics.isCharging;
    if (metrics.isAudioUnlocked !== undefined) speaker.isAudioUnlocked = metrics.isAudioUnlocked;

    room.lastActivity = Date.now();
    return room;
  }

  public updateSpeaker(
    roomId: string,
    speakerId: string,
    updates: Partial<SpeakerDevice>
  ): Room | undefined {
    const room = this.rooms.get(roomId);
    if (!room || !room.speakers[speakerId]) return undefined;

    Object.assign(room.speakers[speakerId], updates);
    room.lastActivity = Date.now();
    return room;
  }

  public removeSpeaker(roomId: string, speakerId: string): Room | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    delete room.speakers[speakerId];
    this.socketToRoom.delete(speakerId);
    room.lastActivity = Date.now();
    return room;
  }

  public updatePlayback(roomId: string, updates: Partial<PlaybackState>): Room | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    Object.assign(room.currentPlayback, updates);
    room.lastActivity = Date.now();
    return room;
  }

  public setRoomLock(roomId: string, isLocked: boolean): Room | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    room.isLocked = isLocked;
    room.lastActivity = Date.now();
    return room;
  }

  public removeSocket(socketId: string): { room?: Room; wasHost: boolean } {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) return { wasHost: false };

    this.socketToRoom.delete(socketId);
    const room = this.rooms.get(roomId);
    if (!room) return { wasHost: false };

    const wasHost = room.hostSocketId === socketId;
    delete room.speakers[socketId];
    room.lastActivity = Date.now();

    console.log(`[RoomManager] Socket ${socketId} left room ${roomId} (wasHost=${wasHost})`);
    return { room, wasHost };
  }

  public deleteRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    for (const socketId of Object.keys(room.speakers)) {
      this.socketToRoom.delete(socketId);
    }
    this.rooms.delete(roomId);
    console.log(`[RoomManager] Deleted room ${roomId}`);
  }

  private cleanupInactiveRooms(): void {
    const now = Date.now();
    const timeout = 30 * 60 * 1000; // 30 minutes

    for (const [roomId, room] of this.rooms.entries()) {
      const isHostPresent = !!room.speakers[room.hostSocketId];
      const speakerCount = Object.keys(room.speakers).length;

      if (!isHostPresent && (now - room.lastActivity > 10 * 60 * 1000 || speakerCount === 0)) {
        console.log(`[RoomManager] Auto-cleaning abandoned room ${roomId}`);
        this.deleteRoom(roomId);
      } else if (now - room.lastActivity > timeout) {
        console.log(`[RoomManager] Auto-cleaning timed out room ${roomId}`);
        this.deleteRoom(roomId);
      }
    }
  }
}
