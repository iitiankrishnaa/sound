import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  QrCode,
  Copy,
  Check,
  Lock,
  Unlock,
  RefreshCw,
  Users,
  Smartphone,
  Laptop,
  Tablet,
  Music,
  Radio,
  Sliders,
  Upload,
  Youtube,
  Trash2,
  Battery,
  BatteryCharging,
  Zap,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { Room, SpeakerDevice, TrackInfo, PlaybackState } from '../../../shared/types.js';
import { socket } from '../services/socket.js';
import { audioEngine } from '../services/audioEngine.js';
import { syncEngine } from '../services/syncEngine.js';
import { QrCodeModal } from './QrCodeModal.js';
import { AudioCalibrationModal } from './AudioCalibrationModal.js';
import { YouTubePlayerCoordinator } from './YouTubePlayerCoordinator.js';
import { BeatVisualizer } from './BeatVisualizer.js';
import confetti from 'canvas-confetti';
import { copyTextToClipboard } from '../utils/clipboard.js';

interface Props {
  room: Room;
  lanUrl?: string;
  onLeaveRoom: () => void;
}

export const HostDashboard: React.FC<Props> = ({ room, lanUrl, onLeaveRoom }) => {
  const [copied, setCopied] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showCalibrateModal, setShowCalibrateModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'studio' | 'synth' | 'upload' | 'youtube'>('studio');
  const [studioTracks, setStudioTracks] = useState<TrackInfo[]>([]);
  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isHostAudioEnabled, setIsHostAudioEnabled] = useState(true);
  const [hostVolume, setHostVolume] = useState(1.0);
  const [hostMuted, setHostMuted] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [trackDuration, setTrackDuration] = useState(180);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch available default tracks from server
  useEffect(() => {
    fetch('/api/tracks')
      .then((res) => res.json())
      .then((data) => {
        if (data.tracks) {
          setStudioTracks(data.tracks);
        }
      })
      .catch((err) => console.error('Failed to load tracks:', err));
  }, []);

  // Update track progress
  useEffect(() => {
    const unsub = audioEngine.onTrackProgress((cur, dur) => {
      setCurrentPosition(cur);
      if (dur > 0) setTrackDuration(dur);
    });
    return () => {
      unsub();
    };
  }, []);

  // Synchronize Host's local audio if Host Speaker playback is enabled
  useEffect(() => {
    if (isHostAudioEnabled && room.currentPlayback) {
      audioEngine.schedulePlayback(room.currentPlayback, room.id);
    } else {
      audioEngine.stop();
    }
  }, [room.currentPlayback, isHostAudioEnabled]);

  const copyJoinLink = async () => {
    const baseUrl = lanUrl || window.location.origin;
    const url = `${baseUrl}?join=${room.id}`;
    const success = await copyTextToClipboard(url);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handlePlayPause = async () => {
    await audioEngine.unlock();
    if (room.currentPlayback.isPlaying) {
      socket.emit('HOST_PAUSE', { roomId: room.id, position: currentPosition });
    } else {
      socket.emit('HOST_PLAY', { roomId: room.id, position: currentPosition, targetDelayMs: 600 });
    }
  };

  const handleSeek = (newSec: number) => {
    setCurrentPosition(newSec);
    socket.emit('HOST_SEEK', { roomId: room.id, position: newSec, targetDelayMs: 450 });
  };

  const handleChangeTrack = (track: TrackInfo) => {
    socket.emit('HOST_CHANGE_TRACK', { roomId: room.id, track });
    setCurrentPosition(0);
  };

  const handleResyncAll = () => {
    socket.emit('HOST_RESYNC_ALL', { roomId: room.id });
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.8 }
    });
  };

  const toggleRoomLock = () => {
    socket.emit('HOST_LOCK_ROOM', { roomId: room.id, isLocked: !room.isLocked });
  };

  const handleRemoveSpeaker = (speakerId: string) => {
    socket.emit('HOST_REMOVE_SPEAKER', { roomId: room.id, speakerId });
  };

  const handleSpeakerRename = (speakerId: string) => {
    if (editingName.trim()) {
      socket.emit('HOST_UPDATE_SPEAKER', {
        roomId: room.id,
        speakerId,
        updates: { name: editingName.trim() }
      });
    }
    setEditingSpeakerId(null);
  };

  const handleSpeakerVolume = (speakerId: string, volume: number) => {
    socket.emit('HOST_UPDATE_SPEAKER', {
      roomId: room.id,
      speakerId,
      updates: { volume }
    });
  };

  const handleSpeakerMuteToggle = (speakerId: string, currentMuted: boolean) => {
    socket.emit('HOST_UPDATE_SPEAKER', {
      roomId: room.id,
      speakerId,
      updates: { isMuted: !currentMuted }
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('audio', file);

    try {
      const res = await fetch('/api/upload-track', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success && data.track) {
        setStudioTracks((prev) => [data.track, ...prev]);
        handleChangeTrack(data.track);
      }
    } catch (err) {
      console.error('File upload error:', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const speakersList = Object.values(room.speakers);
  const clientSpeakers = speakersList.filter((s) => !s.isHost);
  const currentTrack = room.currentPlayback.track;

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 flex flex-col">
      {/* Top Header / Room Controls */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-30 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 p-[1px] shadow-md shadow-sky-500/20">
                <div className="w-full h-full bg-slate-950 rounded-[11px] flex items-center justify-center">
                  <Radio size={18} className="text-sky-400" />
                </div>
              </div>
              <span className="text-xl font-black tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-sky-400 to-indigo-300">
                SYNCBEAT
              </span>
            </div>

            {/* Room Code Badge */}
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 shadow-inner">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Room:</span>
              <span className="font-mono font-black text-sky-400 tracking-widest text-sm">{room.id}</span>
              {room.isLocked && <Lock size={12} className="text-amber-400" />}
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* QR Code Button */}
            <button
              onClick={() => setShowQrModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-400 rounded-xl text-xs font-bold transition active:scale-95"
            >
              <QrCode size={15} />
              <span className="hidden sm:inline">Show QR Code</span>
            </button>

            {/* Copy Link Button */}
            <button
              onClick={copyJoinLink}
              className="flex items-center gap-2 px-3.5 py-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition active:scale-95"
            >
              {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
              <span className="hidden sm:inline">{copied ? 'Copied Link' : 'Copy Join Link'}</span>
            </button>

            {/* Lock/Unlock Toggle */}
            <button
              onClick={toggleRoomLock}
              title={room.isLocked ? 'Room is locked to new joiners' : 'Room is open to join'}
              className={`p-2 rounded-xl border transition ${
                room.isLocked
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              {room.isLocked ? <Lock size={16} /> : <Unlock size={16} />}
            </button>

            {/* RESYNC ALL Button */}
            <button
              onClick={handleResyncAll}
              className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-500/20 transition active:scale-95"
            >
              <RefreshCw size={14} className="animate-spin-slow" />
              <span>RESYNC ALL</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Host Grid */}
      <main className="max-w-7xl mx-auto p-6 flex-1 w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Audio Player & Source Selector (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Now Playing Player Card */}
          <div className="glass-panel-glow rounded-3xl p-6 sm:p-8 border border-sky-500/20 relative overflow-hidden shadow-2xl">
            <div className="flex flex-col sm:flex-row items-center gap-6 mb-6">
              {/* Album Art / Beat Visualizer */}
              <div className="relative w-36 h-36 rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 shrink-0 shadow-lg flex items-center justify-center">
                {currentTrack?.artwork ? (
                  <img
                    src={currentTrack.artwork}
                    alt="Album Artwork"
                    className={`w-full h-full object-cover transition duration-500 ${
                      room.currentPlayback.isPlaying ? 'scale-105' : 'scale-100 opacity-80'
                    }`}
                  />
                ) : (
                  <Music size={40} className="text-slate-600" />
                )}

                {/* Overlay visualizer */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <BeatVisualizer
                    isPlaying={room.currentPlayback.isPlaying}
                    mode="circle"
                    size={144}
                    accentColor="#38bdf8"
                  />
                </div>
              </div>

              {/* Track Metadata */}
              <div className="flex-1 text-center sm:text-left">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-sky-500/10 text-sky-400 text-[10px] font-bold uppercase tracking-wider mb-2 border border-sky-500/20">
                  <Radio size={10} className="animate-pulse" />
                  {currentTrack?.sourceType === 'synth'
                    ? 'Calibration Metronome'
                    : currentTrack?.sourceType === 'upload'
                    ? 'Custom Upload'
                    : currentTrack?.sourceType === 'youtube'
                    ? 'YouTube Coordinated'
                    : 'Studio Track'}
                </div>
                <h2 className="text-2xl font-black text-white tracking-tight leading-tight line-clamp-1">
                  {currentTrack?.title || 'No Track Selected'}
                </h2>
                <p className="text-sm font-medium text-slate-400 mt-1">
                  {currentTrack?.artist || 'SyncBeat Engine'}
                </p>

                {/* Connected Speakers Pill */}
                <div className="mt-3 flex items-center justify-center sm:justify-start gap-2 text-xs text-slate-400">
                  <Users size={14} className="text-emerald-400" />
                  <span>
                    <strong className="text-white">{speakersList.length}</strong> active device{speakersList.length === 1 ? '' : 's'} connected
                  </span>
                </div>
              </div>
            </div>

            {/* YouTube Coordinator if active */}
            {activeTab === 'youtube' ? (
              <YouTubePlayerCoordinator roomId={room.id} isHost={true} playback={room.currentPlayback} />
            ) : (
              <>
                {/* Timeline Seek Bar */}
                <div className="space-y-2 mb-6">
                  <input
                    type="range"
                    min={0}
                    max={trackDuration || 180}
                    step={0.5}
                    value={currentPosition}
                    onChange={(e) => handleSeek(parseFloat(e.target.value))}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
                  />
                  <div className="flex justify-between text-xs font-mono text-slate-400">
                    <span>{formatTime(currentPosition)}</span>
                    <span>{formatTime(trackDuration)}</span>
                  </div>
                </div>

                {/* Primary Player Controls */}
                <div className="flex items-center justify-center gap-6 mb-6">
                  <button
                    onClick={() => handleSeek(Math.max(0, currentPosition - 10))}
                    className="p-3 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-2xl transition active:scale-95"
                    title="Rewind 10s"
                  >
                    <SkipBack size={22} />
                  </button>

                  <button
                    onClick={handlePlayPause}
                    className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-sky-400 via-sky-500 to-indigo-600 hover:from-sky-300 hover:to-indigo-500 text-slate-950 font-bold shadow-xl shadow-sky-500/30 flex items-center justify-center transition active:scale-95 transform"
                  >
                    {room.currentPlayback.isPlaying ? (
                      <Pause size={28} className="fill-slate-950" />
                    ) : (
                      <Play size={28} className="fill-slate-950 translate-x-0.5" />
                    )}
                  </button>

                  <button
                    onClick={() => handleSeek(Math.min(trackDuration, currentPosition + 10))}
                    className="p-3 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-2xl transition active:scale-95"
                    title="Forward 10s"
                  >
                    <SkipForward size={22} />
                  </button>
                </div>
              </>
            )}

            {/* Host Machine Local Speaker Toggle & Volume */}
            <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="hostAudioToggle"
                  checked={isHostAudioEnabled}
                  onChange={(e) => setIsHostAudioEnabled(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="hostAudioToggle" className="cursor-pointer text-slate-300 font-medium select-none">
                  Play audio on this Host PC too
                </label>
              </div>

              {isHostAudioEnabled && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      const nextMute = !hostMuted;
                      setHostMuted(nextMute);
                      audioEngine.setMute(nextMute);
                    }}
                    className="text-slate-400 hover:text-white"
                  >
                    {hostMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={hostMuted ? 0 : hostVolume}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setHostVolume(v);
                      setHostMuted(false);
                      audioEngine.setVolume(v);
                    }}
                    className="w-24 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
                  />
                  <button
                    onClick={() => setShowCalibrateModal(true)}
                    className="p-1 text-slate-400 hover:text-sky-400 transition"
                    title="Calibrate PC Audio Latency"
                  >
                    <Sliders size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Audio Source Selector Tabs */}
          <div className="glass-panel rounded-3xl p-6 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Music size={18} className="text-sky-400" /> Select Audio Source
              </h3>
              <div className="flex gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs">
                <button
                  onClick={() => setActiveTab('studio')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition ${
                    activeTab === 'studio' ? 'bg-sky-500 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Studio Tracks
                </button>
                <button
                  onClick={() => setActiveTab('synth')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition ${
                    activeTab === 'synth' ? 'bg-sky-500 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Sync Pulse
                </button>
                <button
                  onClick={() => setActiveTab('upload')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition ${
                    activeTab === 'upload' ? 'bg-sky-500 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Upload File
                </button>
                <button
                  onClick={() => setActiveTab('youtube')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition ${
                    activeTab === 'youtube' ? 'bg-rose-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  YouTube
                </button>
              </div>
            </div>

            {/* TAB: Studio Tracks */}
            {activeTab === 'studio' && (
              <div className="space-y-2">
                {studioTracks
                  .filter((t) => t.sourceType === 'studio' || t.sourceType === 'upload')
                  .map((track) => (
                    <div
                      key={track.id}
                      onClick={() => handleChangeTrack(track)}
                      className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition ${
                        currentTrack?.id === track.id
                          ? 'bg-sky-500/10 border-sky-500/40 text-white shadow-md'
                          : 'bg-slate-900/50 hover:bg-slate-800/60 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={track.artwork || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100'}
                          alt=""
                          className="w-10 h-10 rounded-xl object-cover"
                        />
                        <div>
                          <div className="font-semibold text-sm line-clamp-1">{track.title}</div>
                          <div className="text-xs text-slate-400">{track.artist}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {currentTrack?.id === track.id && room.currentPlayback.isPlaying && (
                          <span className="text-[10px] font-bold text-sky-400 uppercase tracking-widest animate-pulse">
                            Playing
                          </span>
                        )}
                        <span className="text-xs font-mono text-slate-500">{formatTime(track.duration)}</span>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* TAB: Synthetic Metronome Pulse */}
            {activeTab === 'synth' && (
              <div className="space-y-4 text-center p-4">
                <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 max-w-md mx-auto">
                  <div className="font-bold text-emerald-400 text-base mb-1">Instant Metronome Pulse (120 BPM)</div>
                  <p className="text-xs text-slate-400 mb-4">
                    100% synthesized in Web Audio API. Zero network downloads. Perfect for verifying zero-echo millisecond sync across multiple phones!
                  </p>
                  <button
                    onClick={() => {
                      const synthTrack = studioTracks.find((t) => t.sourceType === 'synth') || {
                        id: 'track-sync-pulse',
                        title: 'Sync Metronome Pulse (120 BPM)',
                        artist: 'SyncBeat Calibration Test',
                        duration: 300,
                        url: '/audio/test-pulse.wav',
                        sourceType: 'synth' as const,
                        bpm: 120
                      };
                      handleChangeTrack(synthTrack);
                    }}
                    className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold rounded-xl text-xs shadow-lg shadow-emerald-500/20 transition active:scale-95"
                  >
                    Activate 120-BPM Sync Pulse
                  </button>
                </div>
              </div>
            )}

            {/* TAB: Upload Custom Audio File */}
            {activeTab === 'upload' && (
              <div className="space-y-4">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-700 hover:border-sky-500/50 rounded-2xl p-8 text-center cursor-pointer bg-slate-900/40 hover:bg-slate-900/80 transition"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-400 flex items-center justify-center mx-auto mb-3">
                    <Upload size={24} className={isUploading ? 'animate-bounce' : ''} />
                  </div>
                  <div className="font-bold text-sm text-slate-200">
                    {isUploading ? 'Distributing Audio to All Devices...' : 'Click to Upload Audio File (MP3, WAV, FLAC)'}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Uploaded file will be instantly decoded and played across every phone in your room.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Connected Devices & Sync Monitor (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Connected Speakers List */}
          <div className="glass-panel rounded-3xl p-6 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Smartphone size={18} className="text-emerald-400" /> Connected Speakers ({clientSpeakers.length})
              </h3>
              <button
                onClick={() => setShowQrModal(true)}
                className="text-xs font-semibold text-sky-400 hover:text-sky-300 flex items-center gap-1"
              >
                + Add Phone
              </button>
            </div>

            {clientSpeakers.length === 0 ? (
              <div className="py-8 text-center space-y-3 bg-slate-900/40 rounded-2xl border border-slate-800/80">
                <Smartphone size={32} className="mx-auto text-slate-600 animate-pulse" />
                <div className="text-sm font-semibold text-slate-300">No phones connected yet</div>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  Click <strong>Show QR Code</strong> and scan with your phone camera to start your synchronized party!
                </p>
                <button
                  onClick={() => setShowQrModal(true)}
                  className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-xl text-xs transition"
                >
                  Show QR Code
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {clientSpeakers.map((speaker) => {
                  const isExcellent = speaker.syncQuality === 'excellent';
                  const isGood = speaker.syncQuality === 'good';

                  return (
                    <div
                      key={speaker.id}
                      className="bg-slate-900/80 rounded-2xl p-4 border border-slate-800 space-y-3 hover:border-slate-700 transition"
                    >
                      {/* Top Bar: Device Name & Status */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
                              speaker.isAudioUnlocked ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]' : 'bg-amber-400'
                            }`}
                          />
                          {editingSpeakerId === speaker.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                className="px-2 py-1 text-xs bg-slate-800 border border-slate-700 rounded-lg text-white font-semibold"
                                autoFocus
                              />
                              <button
                                onClick={() => handleSpeakerRename(speaker.id)}
                                className="p-1 text-emerald-400 hover:bg-slate-800 rounded"
                              >
                                <Check size={14} />
                              </button>
                            </div>
                          ) : (
                            <span
                              onClick={() => {
                                setEditingSpeakerId(speaker.id);
                                setEditingName(speaker.name);
                              }}
                              className="font-bold text-sm text-slate-200 cursor-pointer hover:underline"
                              title="Click to rename"
                            >
                              {speaker.name}
                            </span>
                          )}
                        </div>

                        {/* Remove / Kick button */}
                        <button
                          onClick={() => handleRemoveSpeaker(speaker.id)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                          title="Remove speaker"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {/* Sync Metrics Badges */}
                      <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                        <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-800/80">
                          <div className="text-[9px] text-slate-500 uppercase tracking-wider font-sans">Latency RTT</div>
                          <div className="font-bold text-sky-400">{speaker.latencyMs * 2} ms</div>
                        </div>
                        <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-800/80">
                          <div className="text-[9px] text-slate-500 uppercase tracking-wider font-sans">Drift</div>
                          <div
                            className={`font-bold ${
                              Math.abs(speaker.driftMs) < 15 ? 'text-emerald-400' : 'text-amber-400'
                            }`}
                          >
                            {speaker.driftMs > 0 ? `+${speaker.driftMs}` : speaker.driftMs} ms
                          </div>
                        </div>
                        <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-800/80">
                          <div className="text-[9px] text-slate-500 uppercase tracking-wider font-sans">Sync State</div>
                          <div
                            className={`font-bold uppercase text-[10px] ${
                              isExcellent ? 'text-emerald-400' : isGood ? 'text-sky-400' : 'text-amber-400'
                            }`}
                          >
                            {speaker.syncQuality}
                          </div>
                        </div>
                      </div>

                      {/* Volume Slider & Mute */}
                      <div className="flex items-center gap-3 pt-1">
                        <button
                          onClick={() => handleSpeakerMuteToggle(speaker.id, speaker.isMuted)}
                          className="text-slate-400 hover:text-white"
                        >
                          {speaker.isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                        </button>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={speaker.isMuted ? 0 : speaker.volume}
                          onChange={(e) => handleSpeakerVolume(speaker.id, parseFloat(e.target.value))}
                          className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                        />
                        <span className="text-[10px] font-mono text-slate-400 w-8 text-right">
                          {Math.round((speaker.isMuted ? 0 : speaker.volume) * 100)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sync Monitor & Diagnostics Center */}
          <div className="glass-panel rounded-3xl p-6 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Zap size={18} className="text-sky-400" /> Precision Sync Diagnostics
              </h3>
              <span className="text-[11px] font-mono text-emerald-400">NTP Active</span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-800/60 text-slate-400">
                <span>Reference Clock</span>
                <span className="font-mono text-slate-200">Server UTC High-Res</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/60 text-slate-400">
                <span>Clock Sync Algorithm</span>
                <span className="font-mono text-slate-200">Cristian's + Outlier Rejection</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/60 text-slate-400">
                <span>Drift Correction Method</span>
                <span className="font-mono text-slate-200">0.5% Smooth Micro-Nudge</span>
              </div>
              <div className="flex justify-between py-1.5 text-slate-400">
                <span>Target Start Lead Time</span>
                <span className="font-mono text-slate-200">500 ms Buffer Window</span>
              </div>
            </div>

            <button
              onClick={handleResyncAll}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 border border-slate-700 transition active:scale-95"
            >
              <RefreshCw size={14} /> Force Re-align All Timers
            </button>
          </div>
        </div>
      </main>

      {/* QR Code Modal */}
      <QrCodeModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        roomId={room.id}
        lanUrl={lanUrl}
      />

      {/* Calibration Modal */}
      <AudioCalibrationModal
        isOpen={showCalibrateModal}
        onClose={() => setShowCalibrateModal(false)}
        roomId={room.id}
      />
    </div>
  );
};
