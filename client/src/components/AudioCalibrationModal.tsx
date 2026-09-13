import React, { useState, useEffect } from 'react';
import { Sliders, Volume2, RotateCcw, Check, X, Info } from 'lucide-react';
import { syncEngine } from '../services/syncEngine.js';
import { audioEngine } from '../services/audioEngine.js';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  roomId?: string;
}

export const AudioCalibrationModal: React.FC<Props> = ({ isOpen, onClose, roomId }) => {
  const [offset, setOffset] = useState<number>(syncEngine.getCalibrationOffset());
  const [isTestingTone, setIsTestingTone] = useState(false);

  useEffect(() => {
    setOffset(syncEngine.getCalibrationOffset());
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOffsetChange = (newOffset: number) => {
    const clamped = Math.max(-1000, Math.min(1000, newOffset));
    setOffset(clamped);
    syncEngine.setCalibrationOffset(clamped);
  };

  const playTestTick = async () => {
    await audioEngine.unlock();
    setIsTestingTone(true);

    // Play 3 calibration click pulses
    const ctxClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new ctxClass();
    const now = ctx.currentTime;

    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(i === 0 ? 1200 : 800, now + i * 0.4);
      gain.gain.setValueAtTime(0.7, now + i * 0.4);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.4 + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.4);
      osc.stop(now + i * 0.4 + 0.06);
    }

    setTimeout(() => {
      setIsTestingTone(false);
    }, 1700);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="glass-panel-glow w-full max-w-md rounded-2xl p-6 relative text-slate-100 shadow-2xl border border-sky-500/30">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-sky-500/10 text-sky-400 rounded-xl border border-sky-500/20">
            <Sliders size={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold tracking-tight">Audio Latency Calibration</h3>
            <p className="text-xs text-slate-400">Compensate for hardware DAC or Bluetooth speaker delay</p>
          </div>
        </div>

        {/* Current Offset Badge */}
        <div className="my-6 text-center bg-slate-900/80 rounded-xl p-5 border border-slate-800">
          <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">
            Output Delay Offset
          </div>
          <div className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-emerald-400 to-indigo-400 font-mono">
            {offset > 0 ? `+${offset}` : offset} <span className="text-xl text-slate-500 font-sans">ms</span>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            {offset === 0
              ? 'Zero hardware compensation (standard device speakers)'
              : offset > 0
              ? `Plays ${offset}ms earlier to compensate for laggy speaker`
              : `Delays playback by ${Math.abs(offset)}ms`}
          </p>
        </div>

        {/* Slider */}
        <div className="mb-6 space-y-2">
          <div className="flex justify-between text-xs font-mono text-slate-400">
            <span>-1000 ms</span>
            <span className="text-sky-400 font-bold">0 ms</span>
            <span>+1000 ms</span>
          </div>
          <input
            type="range"
            min={-1000}
            max={1000}
            step={1}
            value={offset}
            onChange={(e) => handleOffsetChange(parseInt(e.target.value, 10))}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
          />
        </div>

        {/* Fine Adjustment Stepper Buttons */}
        <div className="grid grid-cols-5 gap-2 mb-6">
          <button
            onClick={() => handleOffsetChange(offset - 10)}
            className="py-2 px-1 bg-slate-800/80 hover:bg-slate-700 text-xs font-mono font-semibold rounded-lg border border-slate-700 transition active:scale-95"
          >
            -10ms
          </button>
          <button
            onClick={() => handleOffsetChange(offset - 1)}
            className="py-2 px-1 bg-slate-800/80 hover:bg-slate-700 text-xs font-mono font-semibold rounded-lg border border-slate-700 transition active:scale-95"
          >
            -1ms
          </button>
          <button
            onClick={() => handleOffsetChange(0)}
            className="py-2 px-1 bg-slate-800/80 hover:bg-slate-700 text-xs font-semibold text-slate-300 rounded-lg border border-slate-700 transition flex items-center justify-center gap-1 active:scale-95"
            title="Reset to 0ms"
          >
            <RotateCcw size={12} /> 0
          </button>
          <button
            onClick={() => handleOffsetChange(offset + 1)}
            className="py-2 px-1 bg-slate-800/80 hover:bg-slate-700 text-xs font-mono font-semibold rounded-lg border border-slate-700 transition active:scale-95"
          >
            +1ms
          </button>
          <button
            onClick={() => handleOffsetChange(offset + 10)}
            className="py-2 px-1 bg-slate-800/80 hover:bg-slate-700 text-xs font-mono font-semibold rounded-lg border border-slate-700 transition active:scale-95"
          >
            +10ms
          </button>
        </div>

        {/* Test Signal & Confirm */}
        <div className="space-y-3">
          <button
            onClick={playTestTick}
            disabled={isTestingTone}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm font-semibold flex items-center justify-center gap-2 transition text-sky-400 active:scale-[0.98]"
          >
            <Volume2 size={16} className={isTestingTone ? 'animate-bounce text-emerald-400' : ''} />
            {isTestingTone ? 'Playing Calibration Ticks...' : 'Test Speaker Signal'}
          </button>

          <button
            onClick={onClose}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-semibold text-sm shadow-lg shadow-sky-500/25 flex items-center justify-center gap-2 transition active:scale-[0.98]"
          >
            <Check size={16} /> Save & Close
          </button>
        </div>

        <div className="mt-4 flex items-start gap-2 text-[11px] text-slate-400 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
          <Info size={14} className="text-sky-400 shrink-0 mt-0.5" />
          <span>
            If this phone is connected to a Bluetooth speaker, Bluetooth usually adds <strong>+60ms to +150ms</strong> of delay. Slide towards positive values until the echo disappears.
          </span>
        </div>
      </div>
    </div>
  );
};
