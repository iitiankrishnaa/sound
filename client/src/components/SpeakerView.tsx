import React, { useState, useEffect } from 'react';
import {
  Radio,
  Volume2,
  VolumeX,
  Sliders,
  Wifi,
  WifiOff,
  Battery,
  BatteryCharging,
  Sparkles,
  ShieldCheck,
  Zap,
  Info,
  Smartphone
} from 'lucide-react';
import { Room, SpeakerDevice, PlaybackState, SyncQuality } from '../../../shared/types.js';
import { socket } from '../services/socket.js';
import { audioEngine } from '../services/audioEngine.js';
import { syncEngine } from '../services/syncEngine.js';
import { BeatVisualizer } from './BeatVisualizer.js';
import { AudioCalibrationModal } from './AudioCalibrationModal.js';
import confetti from 'canvas-confetti';

interface Props {
  room: Room;
  deviceId: string;
  onLeaveRoom: () => void;
}

export const SpeakerView: React.FC<Props> = ({ room, deviceId, onLeaveRoom }) => {
  const [isUnlocked, setIsUnlocked] = useState<boolean>(audioEngine.getIsUnlocked());
  const [showCalibration, setShowCalibration] = useState(false);
  const [softwareVolume, setSoftwareVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [latency, setLatency] = useState(syncEngine.getLatency());
  const [drift, setDrift] = useState(0);
  const [syncQuality, setSyncQuality] = useState<SyncQuality>('excellent');
  const [calibrationOffset, setCalibrationOffset] = useState(syncEngine.getCalibrationOffset());
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState<boolean | null>(null);
  const [isConnected, setIsConnected] = useState(socket.connected);

  const [isTrackCached, setIsTrackCached] = useState<boolean>(() => {
    return playback.track ? audioEngine.hasBuffer(playback.track.id) : false;
  });

  const thisSpeaker: SpeakerDevice | undefined = room.speakers[deviceId];
  const playback: PlaybackState = room.currentPlayback;

  // Preload and decode track immediately when room track changes or when joined
  useEffect(() => {
    if (playback?.track) {
      if (audioEngine.hasBuffer(playback.track.id)) {
        setIsTrackCached(true);
      } else {
        setIsTrackCached(false);
        audioEngine.preloadTrack(playback.track).then((buf) => {
          if (buf) {
            setIsTrackCached(true);
          }
        });
      }
    }
  }, [playback?.track?.id, playback?.track?.url]);

  // Listen to Battery Status API if available
  useEffect(() => {
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        setBatteryLevel(battery.level);
        setIsCharging(battery.charging);

        battery.addEventListener('levelchange', () => setBatteryLevel(battery.level));
        battery.addEventListener('chargingchange', () => setIsCharging(battery.charging));
      });
    }
  }, []);

  // Sync engine subscription
  useEffect(() => {
    const unsub = syncEngine.subscribe((info) => {
      setLatency(info.latency);
      setSyncQuality(info.quality);
      setCalibrationOffset(info.calibrationOffset);
    });
    return () => {
      unsub();
    };
  }, []);

  // Drift callback from audioEngine
  useEffect(() => {
    const unsub = audioEngine.onDrift((driftMs, quality) => {
      setDrift(driftMs);
      setSyncQuality(quality);
    });
    return () => {
      unsub();
    };
  }, []);

  // Connection state monitoring
  useEffect(() => {
    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  // When room playback changes, schedule audio playback
  useEffect(() => {
    if (isUnlocked && playback) {
      audioEngine.schedulePlayback(playback, room.id);
    }
  }, [playback, isUnlocked]);

  // Activate speaker (user gesture required for mobile audio unlock)
  const handleActivateSpeaker = async () => {
    const success = await audioEngine.unlock();
    if (success) {
      setIsUnlocked(true);
      if (playback?.track) {
        audioEngine.preloadTrack(playback.track);
      }
      if (playback) {
        audioEngine.schedulePlayback(playback, room.id);
      }
      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.7 }
      });
    }
  };

  const handleVolumeChange = (vol: number) => {
    setSoftwareVolume(vol);
    setIsMuted(false);
    audioEngine.setVolume(vol);
    socket.emit('SPEAKER_VOLUME_UPDATE', { roomId: room.id, volume: vol, isMuted: false });
  };

  const handleMuteToggle = () => {
    const next = !isMuted;
    setIsMuted(next);
    audioEngine.setMute(next);
    socket.emit('SPEAKER_VOLUME_UPDATE', { roomId: room.id, volume: softwareVolume, isMuted: next });
  };

  return (
    <div className="min-h-screen bg-[#060a12] text-slate-100 flex flex-col justify-between p-6 select-none relative overflow-hidden">
      {/* Subtle Background Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] h-[340px] bg-sky-500/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Top Header */}
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 p-[1px] shadow-sm">
            <div className="w-full h-full bg-slate-950 rounded-[11px] flex items-center justify-center">
              <Radio size={16} className="text-sky-400" />
            </div>
          </div>
          <span className="font-black text-lg tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-sky-400 to-indigo-300">
            SYNCBEAT
          </span>
        </div>

        {/* Network & Battery Badges */}
        <div className="flex items-center gap-3 text-xs">
          {isConnected ? (
            <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
              <Wifi size={14} /> Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-400 font-medium animate-pulse">
              <WifiOff size={14} /> Reconnecting...
            </span>
          )}

          {batteryLevel !== null && (
            <span className="inline-flex items-center gap-1 text-slate-400 font-mono">
              {isCharging ? <BatteryCharging size={14} className="text-emerald-400" /> : <Battery size={14} />}
              {Math.round(batteryLevel * 100)}%
            </span>
          )}
        </div>
      </div>

      {/* Center Display */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center my-8 text-center max-w-sm mx-auto w-full">
        {/* Device Name Banner */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-slate-300 text-xs font-semibold mb-6 shadow-inner">
          <Smartphone size={14} className="text-sky-400" />
          <span>{thisSpeaker?.name || 'Speaker Device'}</span>
          <span className="text-slate-500">•</span>
          <span className="font-mono text-sky-400">{room.id}</span>
        </div>

        {/* Dynamic Beat Visualizer */}
        <div className="relative my-4 flex items-center justify-center">
          <BeatVisualizer
            isPlaying={playback.isPlaying && isUnlocked}
            mode="circle"
            size={220}
            accentColor="#10b981"
          />

          {/* Central Speaker Icon or Status */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className={`p-4 rounded-3xl ${playback.isPlaying && isUnlocked ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-900/80 text-slate-500'}`}>
              <Volume2 size={36} className={playback.isPlaying && isUnlocked ? 'animate-pulse' : ''} />
            </div>
          </div>
        </div>

        {/* Playback Status Pill */}
        <div className="mt-4 mb-6">
          <div className="text-xs uppercase font-extrabold tracking-widest text-slate-500 mb-1">
            Playback Status
          </div>
          <div className="text-xl font-black text-white tracking-tight">
            {playback.isPlaying ? (
              <span className="text-emerald-400 flex items-center justify-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                PLAYING SYNCHRONIZED
              </span>
            ) : (
              <span className="text-slate-400">STANDBY / PAUSED</span>
            )}
          </div>
          {playback.track && (
            <div className="flex flex-col items-center gap-1.5 mt-2">
              <div className="text-xs text-slate-300 font-semibold line-clamp-1 max-w-[280px]">
                {playback.track.title}
              </div>
              <span className={`text-[10px] font-bold tracking-wider px-2.5 py-0.5 rounded-full ${
                isTrackCached
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse'
              }`}>
                {isTrackCached ? '✓ Buffer Cached in RAM' : '⏳ Caching audio buffer...'}
              </span>
            </div>
          )}
        </div>

        {/* Sync Status Cards */}
        <div className="w-full grid grid-cols-3 gap-2.5 mb-6 text-center font-mono">
          <div className="glass-panel p-3 rounded-2xl border border-slate-800">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-sans font-bold">Sync Quality</div>
            <div className="text-sm font-extrabold text-emerald-400 uppercase mt-0.5">
              {syncQuality}
            </div>
          </div>

          <div className="glass-panel p-3 rounded-2xl border border-slate-800">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-sans font-bold">Latency</div>
            <div className="text-sm font-extrabold text-sky-400 mt-0.5">
              {latency} <span className="text-[10px] text-slate-500">ms</span>
            </div>
          </div>

          <div className="glass-panel p-3 rounded-2xl border border-slate-800">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-sans font-bold">Offset</div>
            <div className="text-sm font-extrabold text-slate-200 mt-0.5">
              {calibrationOffset > 0 ? `+${calibrationOffset}` : calibrationOffset} <span className="text-[10px] text-slate-500">ms</span>
            </div>
          </div>
        </div>

        {/* Software Volume Slider */}
        <div className="w-full glass-panel p-4 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold text-slate-300">Speaker Volume</span>
            <span className="font-mono text-slate-300">{Math.round((isMuted ? 0 : softwareVolume) * 100)}%</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleMuteToggle} className="text-slate-400 hover:text-white">
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={isMuted ? 0 : softwareVolume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="flex-1 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
            />
          </div>
        </div>

        {/* Calibration Button */}
        <div className="w-full mt-3">
          <button
            onClick={() => setShowCalibration(true)}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold border border-slate-800 flex items-center justify-center gap-2 transition active:scale-98"
          >
            <Sliders size={14} className="text-sky-400" />
            Calibrate Speaker Delay (Bluetooth / Echo)
          </button>
        </div>
      </div>

      {/* Bottom Guidance Footer */}
      <div className="relative z-10 text-center space-y-1 text-slate-500 text-xs">
        <p className="flex items-center justify-center gap-1.5 font-medium text-slate-400">
          <Zap size={14} className="text-amber-400" /> Keep this tab open for synchronized playback.
        </p>
        <p className="text-[11px] text-slate-500">
          Use your phone's physical volume buttons for maximum loudness.
        </p>
      </div>

      {/* Activation Overlay (Handles mobile browser autoplay unlock) */}
      {!isUnlocked && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-black/90 backdrop-blur-xl text-center animate-in fade-in">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-emerald-400 via-teal-500 to-sky-500 p-[2px] mb-6 shadow-2xl shadow-emerald-500/30 animate-bounce">
            <div className="w-full h-full bg-slate-950 rounded-[22px] flex items-center justify-center text-emerald-400">
              <Volume2 size={40} />
            </div>
          </div>

          <h2 className="text-2xl font-black text-white mb-2">Activate Speaker</h2>
          <p className="text-sm text-slate-400 max-w-xs mb-8">
            Mobile browsers require one user tap to permit high-resolution hardware audio playback.
          </p>

          <button
            onClick={handleActivateSpeaker}
            className="w-full max-w-xs py-4 px-8 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 hover:from-emerald-400 hover:to-sky-400 text-slate-950 font-black text-base shadow-xl shadow-emerald-500/30 transition transform active:scale-95 flex items-center justify-center gap-2"
          >
            <Zap size={20} className="fill-slate-950" />
            ACTIVATE SPEAKER
          </button>
        </div>
      )}

      {/* Calibration Modal */}
      <AudioCalibrationModal
        isOpen={showCalibration}
        onClose={() => setShowCalibration(false)}
        roomId={room.id}
      />
    </div>
  );
};
