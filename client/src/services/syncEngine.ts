import { socket } from './socket.js';
import { SyncPingPayload, SyncPongPayload, SyncQuality } from '../../../shared/types.js';

interface SyncSample {
  rtt: number;
  offset: number;
  timestamp: number;
}

export class SyncEngine {
  private samples: SyncSample[] = [];
  private maxSamples = 15;
  private currentOffset = 0; // serverTime = localTime + currentOffset
  private currentRtt = 0;
  private calibrationOffsetMs = 0;
  private syncIntervalId: any = null;
  private onSyncUpdateCallbacks: Set<(info: {
    offset: number;
    rtt: number;
    latency: number;
    quality: SyncQuality;
    calibrationOffset: number;
  }) => void> = new Set();

  constructor() {
    // Load calibration offset from localStorage
    const saved = localStorage.getItem('syncbeat_calibration_offset');
    if (saved !== null) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed)) {
        this.calibrationOffsetMs = parsed;
      }
    }

    this.setupListeners();
  }

  private setupListeners() {
    socket.on('SYNC_PONG', (payload: SyncPongPayload) => {
      const t3 = Date.now();
      const t0 = payload.t0;
      const t1 = payload.t1;
      const t2 = payload.t2;

      // Cristian's Algorithm / NTP
      const rtt = Math.max(1, (t3 - t0) - (t2 - t1));
      const offset = ((t1 - t0) + (t2 - t3)) / 2;

      this.addSample({ rtt, offset, timestamp: t3 });
    });

    // When returning to tab, burst re-synchronize immediately
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.burstSync(4);
      }
    });
  }

  public start() {
    if (this.syncIntervalId) return;
    // Initial burst to quickly converge
    this.burstSync(8);
    // Ongoing maintenance ping every 3 seconds
    this.syncIntervalId = setInterval(() => {
      this.ping();
    }, 3000);
  }

  public stop() {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
  }

  public ping() {
    if (socket.connected) {
      const t0 = Date.now();
      socket.emit('SYNC_PING', { t0 } as SyncPingPayload);
    }
  }

  public burstSync(count = 6) {
    let fired = 0;
    const interval = setInterval(() => {
      this.ping();
      fired++;
      if (fired >= count) {
        clearInterval(interval);
      }
    }, 150);
  }

  private addSample(sample: SyncSample) {
    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }

    // Filter samples: pick the 50% with lowest RTT (least network delay jitter)
    const sortedByRtt = [...this.samples].sort((a, b) => a.rtt - b.rtt);
    const bestCount = Math.max(1, Math.ceil(sortedByRtt.length / 2));
    const bestSamples = sortedByRtt.slice(0, bestCount);

    // Median offset among best samples
    const offsets = bestSamples.map(s => s.offset).sort((a, b) => a - b);
    const medianOffset = offsets[Math.floor(offsets.length / 2)];

    // Average RTT among best samples
    const avgRtt = bestSamples.reduce((sum, s) => sum + s.rtt, 0) / bestSamples.length;

    this.currentOffset = medianOffset;
    this.currentRtt = avgRtt;

    this.notifyUpdate();
  }

  // Convert server timestamp to local client Date.now() timestamp
  public serverToLocalTime(serverTimestamp: number): number {
    return serverTimestamp - this.currentOffset;
  }

  // Get current estimated server timestamp
  public getEstimatedServerTime(): number {
    return Date.now() + this.currentOffset;
  }

  public getLatency(): number {
    return Math.round(this.currentRtt / 2);
  }

  public getRtt(): number {
    return Math.round(this.currentRtt);
  }

  public getOffset(): number {
    return Math.round(this.currentOffset);
  }

  public getCalibrationOffset(): number {
    return this.calibrationOffsetMs;
  }

  public setCalibrationOffset(offsetMs: number) {
    this.calibrationOffsetMs = Math.max(-1000, Math.min(1000, offsetMs));
    localStorage.setItem('syncbeat_calibration_offset', this.calibrationOffsetMs.toString());
    this.notifyUpdate();
  }

  public evaluateQuality(driftMs: number): SyncQuality {
    const latency = this.getLatency();
    const absDrift = Math.abs(driftMs);

    if (latency <= 50 && absDrift <= 20) return 'excellent';
    if (latency <= 100 && absDrift <= 50) return 'good';
    if (latency <= 200 && absDrift <= 100) return 'fair';
    return 'poor';
  }

  public subscribe(callback: (info: {
    offset: number;
    rtt: number;
    latency: number;
    quality: SyncQuality;
    calibrationOffset: number;
  }) => void) {
    this.onSyncUpdateCallbacks.add(callback);
    // Initial emission
    callback({
      offset: this.getOffset(),
      rtt: this.getRtt(),
      latency: this.getLatency(),
      quality: this.evaluateQuality(0),
      calibrationOffset: this.calibrationOffsetMs
    });
    return () => {
      this.onSyncUpdateCallbacks.delete(callback);
    };
  }

  private notifyUpdate() {
    const info = {
      offset: this.getOffset(),
      rtt: this.getRtt(),
      latency: this.getLatency(),
      quality: this.evaluateQuality(0),
      calibrationOffset: this.calibrationOffsetMs
    };
    this.onSyncUpdateCallbacks.forEach(cb => cb(info));
  }
}

export const syncEngine = new SyncEngine();
