import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { X, Copy, Check, QrCode, Wifi, Smartphone, Globe, Info } from 'lucide-react';
import { copyTextToClipboard } from '../utils/clipboard.js';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  lanUrl?: string;
}

export const QrCodeModal: React.FC<Props> = ({ isOpen, onClose, roomId, lanUrl }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Compute join URL: prioritize LAN URL so phones on the same Wi-Fi connect instantly!
  const baseUrl = lanUrl || window.location.origin;
  const joinUrl = `${baseUrl}?join=${roomId}`;

  useEffect(() => {
    if (!isOpen) return;

    QRCode.toDataURL(joinUrl, {
      width: 320,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    })
      .then(url => setQrDataUrl(url))
      .catch(err => console.error('QR generation error:', err));
  }, [isOpen, joinUrl]);

  if (!isOpen) return null;

  const handleCopyJoinLink = async () => {
    const success = await copyTextToClipboard(joinUrl);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="glass-panel-glow w-full max-w-md rounded-3xl p-6 relative text-slate-100 shadow-2xl border border-sky-500/30 text-center max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition"
        >
          <X size={20} />
        </button>

        <div className="inline-flex items-center gap-2 px-3 py-1 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-full text-xs font-semibold mb-3">
          <Smartphone size={14} /> Scan to Join as Speaker
        </div>

        <h3 className="text-xl font-bold tracking-tight mb-1">Connect Speaker Device</h3>
        <p className="text-xs text-slate-400 mb-4">Point your phone camera here to join immediately</p>

        {/* QR Code Container */}
        <div className="bg-white p-3 rounded-2xl inline-block shadow-xl shadow-sky-500/10 mb-4 border-4 border-slate-900">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="SyncBeat Room QR Code" className="w-52 h-52 mx-auto rounded-lg" />
          ) : (
            <div className="w-52 h-52 flex items-center justify-center text-slate-800">
              <QrCode size={48} className="animate-pulse" />
            </div>
          )}
        </div>

        {/* Short Room Code */}
        <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-800 mb-4 flex items-center justify-between px-6">
          <div className="text-left">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Room Code</div>
            <div className="text-2xl font-black tracking-widest text-sky-400 font-mono">{roomId}</div>
          </div>
          <button
            onClick={handleCopyJoinLink}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-lg text-slate-200 border border-slate-700 flex items-center gap-1.5 transition"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy Code'}
          </button>
        </div>

        {/* Full URL Box with Copy Button */}
        <div className="space-y-1.5 mb-4 text-left">
          <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
            <Globe size={13} className="text-sky-400" /> Direct Join Link for Phone:
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={joinUrl}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs font-mono text-slate-200 select-all focus:outline-none focus:border-sky-400"
            />
            <button
              onClick={handleCopyJoinLink}
              className="px-4 py-2 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 active:scale-95 shadow-md shadow-sky-500/20"
            >
              {copied ? <Check size={15} className="text-emerald-300" /> : <Copy size={15} />}
              <span>{copied ? 'Copied!' : 'Copy Link'}</span>
            </button>
          </div>
        </div>

        {/* Helpful Tip about Typing on Mobile */}
        <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 text-left text-[11px] text-slate-400 space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-sky-300">
            <Info size={13} className="shrink-0" />
            <span>Why did typing without "http://" fail on phone?</span>
          </div>
          <p className="leading-relaxed">
            Mobile browsers (Chrome / Safari) treat bare IPs like <code className="text-slate-300 font-mono">{new URL(baseUrl).host}</code> as Google search terms or try HTTPS.
          </p>
          <p className="leading-relaxed text-slate-300">
            👉 When typing on phone, type the full address: <strong className="text-sky-300 font-mono">{joinUrl}</strong>, or open <strong className="text-sky-300 font-mono">{baseUrl}</strong> and enter code <strong className="text-emerald-400 font-mono">{roomId}</strong>.
          </p>
        </div>

        {lanUrl && (
          <div className="mt-3 flex items-center justify-center gap-1 text-[11px] text-emerald-400 font-medium">
            <Wifi size={13} /> Local Wi-Fi Host: {new URL(lanUrl).hostname}
          </div>
        )}
      </div>
    </div>
  );
};
