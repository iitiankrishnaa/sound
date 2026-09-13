import { TrackInfo, PlaybackState, SyncQuality } from '../../../shared/types.js';
import { syncEngine } from './syncEngine.js';
import { socket } from './socket.js';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private bufferCache: Map<string, AudioBuffer> = new Map();
  private isPreloadingTrackId: string | null = null;
  private consecutiveHighDriftCount = 0;

  private isUnlocked = false;
  private isPlaying = false;
  private currentTrack: TrackInfo | null = null;
  private scheduledAudioStartTime = 0; // AudioContext.currentTime when track began/resumed
  private scheduledTrackOffset = 0; // Offset in seconds within the audio buffer
  private currentPlaybackState: PlaybackState | null = null;

  private driftCheckInterval: any = null;
  private isNudging = false;
  private softwareVolume = 1.0;
  private isMuted = false;

  private onDriftCallbacks: Set<(driftMs: number, quality: SyncQuality) => void> = new Set();
  private onTrackProgressCallbacks: Set<(currentSec: number, durationSec: number) => void> = new Set();

  constructor() {
    // AudioContext will be initialized on first user interaction
  }

  public hasBuffer(trackId: string): boolean {
    return this.bufferCache.has(trackId);
  }

  public setCachedBuffer(trackId: string, buffer: AudioBuffer): void {
    this.bufferCache.set(trackId, buffer);
  }

  public async preloadTrack(track: TrackInfo): Promise<AudioBuffer | null> {
    if (this.bufferCache.has(track.id)) {
      return this.bufferCache.get(track.id)!;
    }
    if (this.isPreloadingTrackId === track.id) {
      return null;
    }
    this.isPreloadingTrackId = track.id;
    try {
      const buffer = await this.loadBuffer(track);
      return buffer;
    } catch (err) {
      console.warn('[AudioEngine] Track preloading failed for:', track.id, err);
      return null;
    } finally {
      this.isPreloadingTrackId = null;
    }
  }

  // Mobile Autoplay unlock
  public async unlock(): Promise<boolean> {
    try {
      if (!this.ctx) {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        this.ctx = new AudioCtxClass({ latencyHint: 'interactive' });
      }

      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      // Initialize audio routing graph
      if (!this.gainNode) {
        this.gainNode = this.ctx.createGain();
        this.analyserNode = this.ctx.createAnalyser();
        this.analyserNode.fftSize = 128;
        this.analyserNode.smoothingTimeConstant = 0.8;

        this.gainNode.connect(this.analyserNode);
        this.analyserNode.connect(this.ctx.destination);
        this.applyVolume();
      }

      // Play short silent buffer to satisfy mobile browser autoplay unlock
      const silentBuffer = this.ctx.createBuffer(1, 1, 22050);
      const source = this.ctx.createBufferSource();
      source.buffer = silentBuffer;
      source.connect(this.ctx.destination);
      source.start();

      this.isUnlocked = true;
      console.log('[AudioEngine] AudioContext successfully unlocked');

      // Acquire screen wake lock if available to prevent device sleep
      this.acquireWakeLock();

      return true;
    } catch (err) {
      console.error('[AudioEngine] Failed to unlock audio context:', err);
      return false;
    }
  }

  public getIsUnlocked(): boolean {
    return this.isUnlocked;
  }

  // Preload and decode audio buffer
  public async loadBuffer(track: TrackInfo): Promise<AudioBuffer> {
    if (this.bufferCache.has(track.id)) {
      return this.bufferCache.get(track.id)!;
    }

    if (!this.ctx) {
      await this.unlock();
    }
    const ctx = this.ctx!;

    // 1. Synthetic test pulse (0 network download, instant generation)
    if (track.sourceType === 'synth') {
      const synthBuffer = this.generateSyncPulseBuffer(ctx, track.bpm || 120, track.duration || 300);
      this.bufferCache.set(track.id, synthBuffer);
      return synthBuffer;
    }

    // 2. Fetch and decode external audio file
    const response = await fetch(track.url);
    if (!response.ok) {
      throw new Error(`Failed to load audio file: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    this.bufferCache.set(track.id, audioBuffer);
    return audioBuffer;
  }

  // Pure Web Audio API synthesized 120 BPM sync metronome buffer
  private generateSyncPulseBuffer(ctx: AudioContext, bpm: number, durationSec: number): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const numSamples = Math.floor(sampleRate * durationSec);
    const buffer = ctx.createBuffer(2, numSamples, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    const beatIntervalSec = 60 / bpm;
    const beatIntervalSamples = Math.floor(sampleRate * beatIntervalSec);
    const totalBeats = Math.floor(durationSec / beatIntervalSec);

    for (let beat = 0; beat < totalBeats; beat++) {
      const beatStart = beat * beatIntervalSamples;
      const isDownbeat = beat % 4 === 0;
      const freq = isDownbeat ? 1200 : 800;
      const clickDuration = Math.floor(sampleRate * 0.035); // 35ms crisp tick

      for (let j = 0; j < clickDuration; j++) {
        const idx = beatStart + j;
        if (idx < numSamples) {
          const t = j / sampleRate;
          const envelope = Math.exp(-j / (sampleRate * 0.007));
          const val = Math.sin(2 * Math.PI * freq * t) * envelope * 0.8;
          left[idx] = val;
          right[idx] = val;
        }
      }
    }

    return buffer;
  }

  // Schedule synchronized playback
  public async schedulePlayback(playback: PlaybackState, roomId?: string) {
    this.currentPlaybackState = playback;

    if (!playback.isPlaying || !playback.track) {
      this.stop();
      return;
    }

    if (!this.isUnlocked) {
      return;
    }

    try {
      const buffer = await this.loadBuffer(playback.track);
      this.currentTrack = playback.track;

      // Stop previous source if playing
      this.stopCurrentSource();

      const ctx = this.ctx!;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // Compute exact local AudioContext scheduling time
      const targetLocalTime = syncEngine.serverToLocalTime(playback.targetServerTime);
      const msUntilStart = targetLocalTime - Date.now();
      const calibrationSec = syncEngine.getCalibrationOffset() / 1000;
      const targetAudioContextTime = ctx.currentTime + (msUntilStart / 1000) + calibrationSec;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = playback.playbackRate || 1.0;
      source.connect(this.gainNode!);

      if (targetAudioContextTime > ctx.currentTime) {
        // Scheduled cleanly in the future (crystal-clear sub-millisecond hardware clock synchronization)
        source.start(targetAudioContextTime, playback.position);
        this.scheduledAudioStartTime = targetAudioContextTime;
        this.scheduledTrackOffset = playback.position;
      } else {
        // Target was in the past (late joiner or network delayed packet)
        const elapsedSec = ctx.currentTime - targetAudioContextTime;
        const currentPos = playback.position + elapsedSec;

        if (currentPos < buffer.duration) {
          // Provide 50ms lead-in for the audio hardware thread to queue without stuttering
          const leadInSec = 0.05;
          source.start(ctx.currentTime + leadInSec, currentPos + leadInSec);
          this.scheduledAudioStartTime = (ctx.currentTime + leadInSec) - (currentPos + leadInSec - playback.position);
          this.scheduledTrackOffset = playback.position;
        } else {
          console.log('[AudioEngine] Track has already ended');
          return;
        }
      }

      this.currentSource = source;
      this.isPlaying = true;
      this.consecutiveHighDriftCount = 0;

      // Start continuous drift monitoring
      this.startDriftMonitoring(roomId);

      source.onended = () => {
        if (this.currentSource === source) {
          this.isPlaying = false;
          this.currentSource = null;
        }
      };
    } catch (err) {
      console.error('[AudioEngine] Playback error:', err);
    }
  }

  // Continuous drift detection & gentle micro-nudging
  private startDriftMonitoring(roomId?: string) {
    if (this.driftCheckInterval) {
      clearInterval(this.driftCheckInterval);
    }

    this.driftCheckInterval = setInterval(() => {
      if (!this.isPlaying || !this.ctx || !this.currentPlaybackState || !this.currentSource) {
        return;
      }

      const currentSec = this.getCurrentPosition();
      const durationSec = this.currentTrack?.duration || 0;
      this.onTrackProgressCallbacks.forEach(cb => cb(currentSec, durationSec));

      // Calculate theoretical position based on synchronized server clock
      const elapsedServerSec = (syncEngine.getEstimatedServerTime() - this.currentPlaybackState.targetServerTime) / 1000;
      const expectedPos = this.currentPlaybackState.position + elapsedServerSec;

      const driftMs = (currentSec - expectedPos) * 1000;
      const quality = syncEngine.evaluateQuality(driftMs);

      this.onDriftCallbacks.forEach(cb => cb(Math.round(driftMs), quality));

      // Report metrics back to host
      if (roomId && socket.connected) {
        socket.emit('SPEAKER_METRICS', {
          roomId,
          latencyMs: syncEngine.getLatency(),
          driftMs: Math.round(driftMs),
          syncQuality: quality,
          isAudioUnlocked: this.isUnlocked
        });
      }

      // Micro-drift correction:
      // If drift is between 12ms and 150ms, gently nudge playbackRate proportionally
      // This eliminates echo without perceptible pitch shifts or audible clicks!
      if (!this.isNudging && Math.abs(driftMs) >= 12 && Math.abs(driftMs) <= 150) {
        this.isNudging = true;
        const nudgeMagnitude = Math.min(0.012, 0.004 + (Math.abs(driftMs) / 12000));
        const nudgeRate = driftMs > 0 ? (1.0 - nudgeMagnitude) : (1.0 + nudgeMagnitude); // ahead -> slow down, behind -> speed up
        this.currentSource.playbackRate.setValueAtTime(nudgeRate, this.ctx.currentTime);

        setTimeout(() => {
          if (this.currentSource && this.isPlaying && this.ctx) {
            this.currentSource.playbackRate.setValueAtTime(1.0, this.ctx.currentTime);
          }
          this.isNudging = false;
        }, 400);
      } else if (Math.abs(driftMs) > 150) {
        // Require 3 consecutive high drift readings before hard resyncing, avoiding transient network spikes
        this.consecutiveHighDriftCount++;
        if (this.consecutiveHighDriftCount >= 3) {
          console.warn(`[AudioEngine] Sustained large drift detected (${Math.round(driftMs)}ms over 3 intervals). Smoothly rescheduling...`);
          this.consecutiveHighDriftCount = 0;
          this.schedulePlayback(this.currentPlaybackState, roomId);
        }
      } else {
        this.consecutiveHighDriftCount = 0;
      }
    }, 500);
  }

  public getCurrentPosition(): number {
    if (!this.ctx || !this.isPlaying) {
      return this.currentPlaybackState?.position || 0;
    }
    const elapsedSinceStart = this.ctx.currentTime - this.scheduledAudioStartTime;
    return Math.max(0, this.scheduledTrackOffset + elapsedSinceStart);
  }

  public stop() {
    this.stopCurrentSource();
    this.isPlaying = false;
    if (this.driftCheckInterval) {
      clearInterval(this.driftCheckInterval);
      this.driftCheckInterval = null;
    }
  }

  private stopCurrentSource() {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch {}
      this.currentSource = null;
    }
  }

  public setVolume(volume: number) {
    this.softwareVolume = Math.max(0, Math.min(1, volume));
    this.applyVolume();
  }

  public setMute(isMuted: boolean) {
    this.isMuted = isMuted;
    this.applyVolume();
  }

  private applyVolume() {
    if (this.gainNode && this.ctx) {
      const targetGain = this.isMuted ? 0 : this.softwareVolume;
      this.gainNode.gain.setValueAtTime(targetGain, this.ctx.currentTime);
    }
  }

  public getFrequencyData(dataArray: Uint8Array) {
    if (this.analyserNode) {
      this.analyserNode.getByteFrequencyData(dataArray as any);
    }
  }

  public getAverageVolume(): number {
    if (!this.analyserNode || !this.isPlaying) return 0;
    const array = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteFrequencyData(array as any);
    let sum = 0;
    for (let i = 0; i < array.length; i++) {
      sum += array[i];
    }
    return sum / (array.length * 255);
  }

  public onDrift(callback: (driftMs: number, quality: SyncQuality) => void) {
    this.onDriftCallbacks.add(callback);
    return () => this.onDriftCallbacks.delete(callback);
  }

  public onTrackProgress(callback: (currentSec: number, durationSec: number) => void) {
    this.onTrackProgressCallbacks.add(callback);
    return () => this.onTrackProgressCallbacks.delete(callback);
  }

  // Screen WakeLock to prevent phone display sleep
  private wakeLock: any = null;
  private async acquireWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await (navigator as any).wakeLock.request('screen');
        console.log('[AudioEngine] Screen WakeLock acquired');
      } catch (err) {
        console.log('[AudioEngine] WakeLock not allowed:', err);
      }
    }
  }
}

export const audioEngine = new AudioEngine();
