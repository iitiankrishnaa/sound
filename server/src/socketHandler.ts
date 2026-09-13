import { Server, Socket } from 'socket.io';
import { RoomManager } from './roomManager.js';
import { TrackInfo, SyncPingPayload, SyncPongPayload } from '../../shared/types.js';

export function setupSocketHandlers(io: Server, roomManager: RoomManager) {
  io.on('connection', (socket: Socket) => {
    // 1. High-precision NTP Clock Synchronization
    socket.on('SYNC_PING', (payload: SyncPingPayload) => {
      const t1 = Date.now();
      // Emitting immediately
      const t2 = Date.now();
      socket.emit('SYNC_PONG', {
        t0: payload.t0,
        t1,
        t2
      } as SyncPongPayload);
    });

    // 2. Room Creation
    socket.on('ROOM_CREATE', (data: { pin?: string; hostName?: string }) => {
      try {
        const room = roomManager.createRoom(socket.id, data);
        socket.join(room.id);
        socket.emit('ROOM_CREATED', {
          roomId: room.id,
          room,
          hostToken: room.hostToken
        });
      } catch (err: any) {
        socket.emit('ROOM_ERROR', { message: err.message || 'Failed to create room' });
      }
    });

    // 3. Room Joining
    socket.on('ROOM_JOIN', (data?: {
      roomId?: string;
      deviceName?: string;
      pin?: string;
      hostToken?: string;
    }) => {
      if (!data || !data.roomId) {
        socket.emit('ROOM_ERROR', { message: 'Please enter a 5-character room code.' });
        return;
      }

      const cleanRoomId = String(data.roomId).replace(/[^a-zA-Z0-9]/g, '').trim().toUpperCase();
      if (!cleanRoomId) {
        socket.emit('ROOM_ERROR', { message: 'Invalid room code.' });
        return;
      }

      const result = roomManager.joinRoom(
        cleanRoomId,
        socket.id,
        data.deviceName || 'Speaker Device',
        data.pin,
        data.hostToken
      );

      if (!result.success || !result.room) {
        socket.emit('ROOM_ERROR', { message: result.error || 'Failed to join room.' });
        return;
      }

      const roomId = result.room.id;
      socket.join(roomId);

      socket.emit('ROOM_JOINED', {
        roomId,
        room: result.room,
        deviceId: socket.id,
        isHost: !!result.isHost
      });

      // Broadcast room update to everyone in the room
      io.to(roomId).emit('ROOM_UPDATED', { room: result.room });
    });

    // 4. Host Playback: PLAY
    socket.on('HOST_PLAY', (data: { roomId: string; position: number; targetDelayMs?: number }) => {
      const room = roomManager.getRoom(data.roomId);
      if (!room || room.hostSocketId !== socket.id) return;

      // Allow 1000ms by default for cloud network propagation, buffer prep, and precise hardware audio scheduling
      const delay = data.targetDelayMs ? Math.max(600, data.targetDelayMs) : 1000;
      const targetServerTime = Date.now() + delay;

      const updated = roomManager.updatePlayback(room.id, {
        isPlaying: true,
        position: data.position,
        targetServerTime,
        playbackRate: 1.0
      });

      if (updated) {
        io.to(room.id).emit('PLAYBACK_STATE_CHANGED', {
          playback: updated.currentPlayback,
          serverTimestamp: Date.now()
        });
        io.to(room.id).emit('ROOM_UPDATED', { room: updated });
      }
    });

    // 5. Host Playback: PAUSE
    socket.on('HOST_PAUSE', (data: { roomId: string; position: number }) => {
      const room = roomManager.getRoom(data.roomId);
      if (!room || room.hostSocketId !== socket.id) return;

      const now = Date.now();
      let currentPos = data.position;
      if (room.currentPlayback.isPlaying) {
        const elapsedSec = (now - room.currentPlayback.targetServerTime) / 1000;
        currentPos = Math.max(0, room.currentPlayback.position + elapsedSec);
      }

      const updated = roomManager.updatePlayback(room.id, {
        isPlaying: false,
        position: currentPos,
        targetServerTime: now
      });

      if (updated) {
        io.to(room.id).emit('PLAYBACK_STATE_CHANGED', {
          playback: updated.currentPlayback,
          serverTimestamp: now
        });
        io.to(room.id).emit('ROOM_UPDATED', { room: updated });
      }
    });

    // 6. Host Playback: SEEK
    socket.on('HOST_SEEK', (data: { roomId: string; position: number; targetDelayMs?: number }) => {
      const room = roomManager.getRoom(data.roomId);
      if (!room || room.hostSocketId !== socket.id) return;

      const delay = data.targetDelayMs ? Math.max(500, data.targetDelayMs) : 800;
      const targetServerTime = Date.now() + delay;

      const updated = roomManager.updatePlayback(room.id, {
        position: data.position,
        targetServerTime
      });

      if (updated) {
        io.to(room.id).emit('PLAYBACK_STATE_CHANGED', {
          playback: updated.currentPlayback,
          serverTimestamp: Date.now()
        });
        io.to(room.id).emit('ROOM_UPDATED', { room: updated });
      }
    });

    // 7. Host Playback: CHANGE TRACK
    socket.on('HOST_CHANGE_TRACK', (data: { roomId: string; track: TrackInfo }) => {
      const room = roomManager.getRoom(data.roomId);
      if (!room || room.hostSocketId !== socket.id) return;

      const now = Date.now();
      const updated = roomManager.updatePlayback(room.id, {
        track: data.track,
        position: 0,
        isPlaying: false,
        targetServerTime: now,
        sourceType: data.track.sourceType
      });

      if (updated) {
        io.to(room.id).emit('PLAYBACK_STATE_CHANGED', {
          playback: updated.currentPlayback,
          serverTimestamp: now
        });
        io.to(room.id).emit('ROOM_UPDATED', { room: updated });
      }
    });

    // 8. Host Command: RESYNC ALL
    socket.on('HOST_RESYNC_ALL', (data: { roomId: string }) => {
      const room = roomManager.getRoom(data.roomId);
      if (!room || room.hostSocketId !== socket.id) return;

      const now = Date.now();
      let currentPos = room.currentPlayback.position;
      if (room.currentPlayback.isPlaying) {
        const elapsedSec = (now - room.currentPlayback.targetServerTime) / 1000;
        currentPos = Math.max(0, room.currentPlayback.position + elapsedSec);
      }

      const targetServerTime = now + 1000;
      const updated = roomManager.updatePlayback(room.id, {
        position: currentPos,
        targetServerTime
      });

      io.to(room.id).emit('FORCE_RESYNC', {
        targetServerTime,
        position: currentPos
      });
      if (updated) {
        io.to(room.id).emit('ROOM_UPDATED', { room: updated });
      }
    });

    // 9. Host Room Settings (Lock/Unlock)
    socket.on('HOST_LOCK_ROOM', (data: { roomId: string; isLocked: boolean }) => {
      const room = roomManager.getRoom(data.roomId);
      if (!room || room.hostSocketId !== socket.id) return;

      const updated = roomManager.setRoomLock(room.id, data.isLocked);
      if (updated) {
        io.to(room.id).emit('ROOM_UPDATED', { room: updated });
      }
    });

    // 10. Host Speaker Management: Update Name / Volume / Mute
    socket.on('HOST_UPDATE_SPEAKER', (data: {
      roomId: string;
      speakerId: string;
      updates: { name?: string; volume?: number; isMuted?: boolean };
    }) => {
      const room = roomManager.getRoom(data.roomId);
      if (!room || room.hostSocketId !== socket.id) return;

      const updated = roomManager.updateSpeaker(room.id, data.speakerId, data.updates);
      if (updated) {
        io.to(room.id).emit('ROOM_UPDATED', { room: updated });
      }
    });

    // 11. Host Speaker Management: Remove / Kick Speaker
    socket.on('HOST_REMOVE_SPEAKER', (data: { roomId: string; speakerId: string }) => {
      const room = roomManager.getRoom(data.roomId);
      if (!room || room.hostSocketId !== socket.id) return;

      io.to(data.speakerId).emit('SPEAKER_KICKED', { reason: 'Removed by host' });
      const targetSocket = io.sockets.sockets.get(data.speakerId);
      if (targetSocket) {
        targetSocket.leave(room.id);
      }

      const updated = roomManager.removeSpeaker(room.id, data.speakerId);
      if (updated) {
        io.to(room.id).emit('ROOM_UPDATED', { room: updated });
      }
    });

    // 12. Speaker Metrics & Drift Reporting
    socket.on('SPEAKER_METRICS', (data: {
      roomId: string;
      latencyMs: number;
      driftMs: number;
      syncQuality: any;
      batteryLevel?: number | null;
      isCharging?: boolean | null;
      isAudioUnlocked?: boolean;
    }) => {
      const updated = roomManager.updateSpeakerMetrics(socket.id, data);
      if (updated) {
        // Send throttled updates to room so host monitor stays refreshed
        io.to(updated.id).emit('ROOM_UPDATED', { room: updated });
      }
    });

    // 13. Speaker Calibration Offset Update
    socket.on('SPEAKER_CALIBRATION_UPDATE', (data: { roomId: string; offsetMs: number }) => {
      const updated = roomManager.updateSpeaker(data.roomId, socket.id, {
        calibrationOffsetMs: data.offsetMs
      });
      if (updated) {
        io.to(updated.id).emit('ROOM_UPDATED', { room: updated });
      }
    });

    // 14. Speaker Local Software Volume Update
    socket.on('SPEAKER_VOLUME_UPDATE', (data: { roomId: string; volume: number; isMuted?: boolean }) => {
      const updated = roomManager.updateSpeaker(data.roomId, socket.id, {
        volume: data.volume,
        ...(data.isMuted !== undefined ? { isMuted: data.isMuted } : {})
      });
      if (updated) {
        io.to(updated.id).emit('ROOM_UPDATED', { room: updated });
      }
    });

    // 15. Disconnection
    socket.on('disconnect', () => {
      const { room, wasHost } = roomManager.removeSocket(socket.id);
      if (room) {
        if (wasHost) {
          // Notify room that host disconnected
          io.to(room.id).emit('HOST_DISCONNECTED', {
            message: 'Host has temporarily disconnected. Playback state preserved.'
          });
        }
        io.to(room.id).emit('ROOM_UPDATED', { room });
      }
    });
  });
}
