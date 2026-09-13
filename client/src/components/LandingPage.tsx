import React, { useState, useEffect } from 'react';
import { Radio, Laptop, Smartphone, Tablet, Volume2, Sparkles, Sliders, ShieldCheck, ArrowRight, Music, Zap } from 'lucide-react';

interface Props {
  onCreateRoom: (options: { hostName: string; pin?: string }) => void;
  onJoinRoom: (roomId: string, deviceName: string, pin?: string) => void;
  initialJoinCode?: string;
}

export const LandingPage: React.FC<Props> = ({ onCreateRoom, onJoinRoom, initialJoinCode = '' }) => {
  const [modalMode, setModalMode] = useState<'create' | 'join' | null>(initialJoinCode ? 'join' : null);
  const [hostName, setHostName] = useState('My PC Controller');
  const [pin, setPin] = useState('');
  const [roomId, setRoomId] = useState(initialJoinCode.toUpperCase());
  const [deviceName, setDeviceName] = useState(() => {
    // Generate default device name based on user agent
    const ua = navigator.userAgent;
    if (/iPhone/i.test(ua)) return "iPhone Speaker";
    if (/iPad/i.test(ua)) return "iPad Speaker";
    if (/Android/i.test(ua)) return "Android Phone";
    if (/Macintosh/i.test(ua)) return "MacBook Speaker";
    return "Living Room Speaker";
  });

  useEffect(() => {
    if (initialJoinCode) {
      setRoomId(initialJoinCode.toUpperCase());
      setModalMode('join');
    }
  }, [initialJoinCode]);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateRoom({ hostName, pin: pin || undefined });
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId.trim()) return;
    onJoinRoom(roomId.trim().toUpperCase(), deviceName, pin || undefined);
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#070b12] text-slate-100 flex flex-col justify-between">
      {/* Background Ambient Glows */}
      <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[800px] h-[450px] bg-gradient-to-tr from-sky-600/20 via-indigo-600/15 to-emerald-500/20 blur-[130px] rounded-full pointer-events-none -z-0" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[400px] bg-pink-600/10 blur-[120px] rounded-full pointer-events-none -z-0" />

      {/* Navigation Header */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-500 via-indigo-500 to-emerald-400 p-[1px] shadow-lg shadow-sky-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[15px] flex items-center justify-center">
              <Radio className="text-sky-400 animate-pulse" size={20} />
            </div>
          </div>
          <span className="text-2xl font-black tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-sky-400 via-indigo-300 to-emerald-400">
            SYNCBEAT
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setModalMode('join')}
            className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-300 hover:text-white bg-slate-900/80 hover:bg-slate-800 border border-slate-800 transition active:scale-95"
          >
            Enter Code
          </button>
          <button
            onClick={() => setModalMode('create')}
            className="px-4 py-2 text-xs font-bold rounded-xl text-white bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 shadow-md shadow-sky-500/20 transition active:scale-95"
          >
            Create Room
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 w-full max-w-6xl mx-auto px-6 pt-6 pb-16 flex flex-col items-center text-center">
        {/* Pill Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-medium mb-6">
          <Sparkles size={14} className="animate-spin-slow" />
          <span>Sub-Millisecond Multi-Device Audio Synchronizer</span>
        </div>

        {/* Hero Title */}
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight max-w-4xl text-white leading-[1.1] mb-6">
          Turn your devices into{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-indigo-400 to-emerald-400">
            one synchronized speaker.
          </span>
        </h1>

        <p className="text-base sm:text-xl text-slate-400 max-w-2xl mx-auto font-normal leading-relaxed mb-10">
          Use your phone, laptop, tablet, and PC together in perfect lockstep. No apps to install. No account required. Just scan and play.
        </p>

        {/* Hero Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-md mx-auto mb-6">
          <button
            onClick={() => setModalMode('create')}
            className="w-full sm:w-auto flex-1 py-4 px-8 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold text-base shadow-xl shadow-sky-500/30 flex items-center justify-center gap-2 transition duration-200 transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <Zap size={18} /> Create Room
          </button>

          <button
            onClick={() => setModalMode('join')}
            className="w-full sm:w-auto flex-1 py-4 px-8 rounded-2xl bg-slate-900/90 hover:bg-slate-800/90 text-slate-200 hover:text-white font-semibold text-base border border-slate-700/60 backdrop-blur-xl flex items-center justify-center gap-2 transition duration-200 transform hover:-translate-y-0.5 active:translate-y-0"
          >
            Join with Code <ArrowRight size={16} />
          </button>
        </div>

        {/* Quick Room Code Input Box for Direct Phone Access */}
        <div className="w-full max-w-md bg-slate-900/90 border border-slate-700/80 rounded-2xl p-4 shadow-2xl mb-14 text-left">
          <div className="text-xs font-bold text-slate-300 mb-2.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5"><Smartphone size={15} className="text-sky-400" /> Have a 5-letter Room Code?</span>
            <span className="text-[10px] text-emerald-400 font-mono font-semibold">Instant Join</span>
          </div>
          <form onSubmit={handleJoinSubmit} className="flex gap-2">
            <input
              type="text"
              maxLength={5}
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.toUpperCase())}
              placeholder="e.g. A7K92"
              className="flex-1 px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl font-mono text-base font-bold tracking-widest text-sky-400 uppercase text-center placeholder-slate-600 focus:outline-none focus:border-sky-400"
            />
            <button
              type="submit"
              className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-sky-600 hover:from-emerald-400 hover:to-sky-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-500/20 active:scale-95 transition flex items-center gap-1.5 shrink-0"
            >
              <span>Connect</span> <ArrowRight size={15} />
            </button>
          </form>
        </div>

        {/* Distributed Speaker System Graphic (PC -> Phones -> Soundwaves) */}
        <div className="w-full max-w-3xl glass-panel-glow rounded-3xl p-6 sm:p-8 border border-sky-500/20 shadow-2xl relative overflow-hidden mb-16">
          <div className="text-xs uppercase font-bold text-slate-400 tracking-wider mb-6 text-center">
            How SyncBeat Works
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative">
            {/* Host PC */}
            <div className="flex flex-col items-center bg-slate-900/90 border border-slate-800 rounded-2xl p-4 w-36 shadow-lg">
              <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl mb-2">
                <Laptop size={32} />
              </div>
              <span className="text-xs font-bold text-slate-200">Host PC</span>
              <span className="text-[10px] text-indigo-400 font-medium">Controller</span>
            </div>

            {/* Central Broadcast Arrow */}
            <div className="flex flex-col items-center justify-center">
              <div className="text-xs text-sky-400 font-mono font-bold mb-1">NTP Server Sync</div>
              <div className="flex items-center gap-1 text-slate-500">
                <div className="w-12 h-0.5 bg-gradient-to-r from-indigo-500 to-sky-400" />
                <ArrowRight size={16} className="text-sky-400" />
              </div>
              <div className="text-[10px] text-slate-400 mt-1">±4ms Precision</div>
            </div>

            {/* Speaker Devices */}
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-center bg-slate-900/90 border border-slate-800 rounded-2xl p-3 w-28 shadow-lg">
                <Smartphone size={24} className="text-sky-400 mb-1" />
                <span className="text-[11px] font-bold text-slate-200">Phone 1</span>
                <span className="text-[9px] text-emerald-400 font-semibold">Speaker 🔊</span>
              </div>
              <div className="flex flex-col items-center bg-slate-900/90 border border-slate-800 rounded-2xl p-3 w-28 shadow-lg">
                <Smartphone size={24} className="text-emerald-400 mb-1" />
                <span className="text-[11px] font-bold text-slate-200">Phone 2</span>
                <span className="text-[9px] text-emerald-400 font-semibold">Speaker 🔊</span>
              </div>
              <div className="flex flex-col items-center bg-slate-900/90 border border-slate-800 rounded-2xl p-3 w-28 shadow-lg">
                <Tablet size={24} className="text-pink-400 mb-1" />
                <span className="text-[11px] font-bold text-slate-200">Tablet</span>
                <span className="text-[9px] text-emerald-400 font-semibold">Speaker 🔊</span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-800/80 flex flex-wrap items-center justify-around text-xs text-slate-400">
            <span className="flex items-center gap-1.5"><ShieldCheck size={14} className="text-emerald-400" /> Zero Audio Lag Drift</span>
            <span className="flex items-center gap-1.5"><Sliders size={14} className="text-sky-400" /> Bluetooth Output Calibration</span>
            <span className="flex items-center gap-1.5"><Volume2 size={14} className="text-indigo-400" /> Web Audio API Hardware Scheduling</span>
          </div>
        </div>

        {/* 3 Pillars Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl text-left">
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 hover:border-sky-500/40 transition">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center mb-4">
              <Zap size={20} />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Zero-Friction Joining</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Show a large QR code on your host laptop. Anyone on the party Wi-Fi scans it with their phone camera and instantly joins as a speaker with no account or app downloads.
            </p>
          </div>

          <div className="glass-panel p-6 rounded-2xl border border-slate-800 hover:border-emerald-500/40 transition">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4">
              <Sliders size={20} />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Drift Compensation & Calibration</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Uses high-precision NTP network clock synchronization and imperceptible playback-rate micro-nudges to guarantee all devices play simultaneously without audible echo.
            </p>
          </div>

          <div className="glass-panel p-6 rounded-2xl border border-slate-800 hover:border-indigo-500/40 transition">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-4">
              <Music size={20} />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Universal Audio Sources</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Includes built-in studio tracks, synthesized instant metronome sync tests, drag-and-drop MP3/WAV uploads distributed to all phones, and YouTube coordination.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full border-t border-slate-800/80 py-6 text-center text-xs text-slate-500">
        SyncBeat • Production-Grade Distributed Multi-Device Audio System
      </footer>

      {/* Create Room Modal */}
      {modalMode === 'create' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="glass-panel-glow w-full max-w-md rounded-3xl p-6 relative border border-sky-500/30">
            <h3 className="text-xl font-bold mb-1">Create a SyncBeat Room</h3>
            <p className="text-xs text-slate-400 mb-6">You will be the Host controller for all connected speakers.</p>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Host Name / Device Label</label>
                <input
                  type="text"
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  placeholder="e.g., Krishna's PC"
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-400 transition"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Optional Room PIN (4 digits)</label>
                <input
                  type="password"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Leave empty for public party room"
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-400 transition font-mono tracking-widest"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-sm font-bold shadow-lg shadow-sky-500/25 transition active:scale-95"
                >
                  Launch Room
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join Room Modal */}
      {modalMode === 'join' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="glass-panel-glow w-full max-w-md rounded-3xl p-6 relative border border-sky-500/30">
            <h3 className="text-xl font-bold mb-1">Join as Speaker</h3>
            <p className="text-xs text-slate-400 mb-6">Connect your phone or tablet to play synchronized audio.</p>

            <form onSubmit={handleJoinSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">5-Character Room Code</label>
                <input
                  type="text"
                  maxLength={5}
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  placeholder="e.g. A7K92"
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-lg font-mono font-bold tracking-widest text-sky-400 placeholder-slate-600 uppercase focus:outline-none focus:border-sky-400 transition text-center"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Speaker / Device Name</label>
                <input
                  type="text"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder="e.g. Living Room Phone"
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-400 transition"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Room PIN (if required)</label>
                <input
                  type="password"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Only if host set a PIN"
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-400 transition font-mono tracking-widest"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-sky-600 hover:from-emerald-400 hover:to-sky-500 text-white text-sm font-bold shadow-lg shadow-emerald-500/25 transition active:scale-95"
                >
                  Join Speaker
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
