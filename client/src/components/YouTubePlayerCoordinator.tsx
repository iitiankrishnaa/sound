import React, { useState, useEffect, useRef } from 'react';
import { Youtube, AlertTriangle, Play, Pause, RefreshCw, ExternalLink, ShieldCheck } from 'lucide-react';
import { socket } from '../services/socket.js';
import { PlaybackState } from '../../../shared/types.js';

interface Props {
  roomId: string;
  isHost: boolean;
  playback: PlaybackState;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export const YouTubePlayerCoordinator: React.FC<Props> = ({ roomId, isHost, playback }) => {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [videoId, setVideoId] = useState<string | null>(playback.track?.youtubeVideoId || 'jfKfPfyJRdk'); // default lofi hip hop
  const [isApiReady, setIsApiReady] = useState(false);
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Parse YouTube video ID from URL
  const extractVideoId = (url: string): string | null => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\\&v=)([^#\\&\\?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  };

  // Load YouTube IFrame API script
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      setIsApiReady(true);
      return;
    }

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
      setIsApiReady(true);
    };
  }, []);

  // Initialize or re-create YouTube Player
  useEffect(() => {
    if (!isApiReady || !videoId || !containerRef.current) return;

    if (playerRef.current) {
      playerRef.current.destroy();
    }

    playerRef.current = new window.YT.Player(containerRef.current, {
      height: '100%',
      width: '100%',
      videoId: videoId,
      playerVars: {
        autoplay: playback.isPlaying ? 1 : 0,
        controls: isHost ? 1 : 0,
        modestbranding: 1,
        rel: 0,
        playsinline: 1
      },
      events: {
        onReady: () => {
          if (playback.isPlaying) {
            playerRef.current?.seekTo(playback.position, true);
            playerRef.current?.playVideo();
          }
        },
        onStateChange: (event: any) => {
          // If host clicks play/pause in YouTube iframe, broadcast to room
          if (isHost) {
            if (event.data === window.YT.PlayerState.PLAYING) {
              const currentPos = playerRef.current?.getCurrentTime() || 0;
              socket.emit('HOST_PLAY', { roomId, position: currentPos });
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              const currentPos = playerRef.current?.getCurrentTime() || 0;
              socket.emit('HOST_PAUSE', { roomId, position: currentPos });
            }
          }
        }
      }
    });

    return () => {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {}
      }
    };
  }, [isApiReady, videoId]);

  // Sync state changes from server
  useEffect(() => {
    if (!playerRef.current || !playerRef.current.getPlayerState) return;

    if (playback.isPlaying) {
      const currentPos = playerRef.current.getCurrentTime() || 0;
      const expectedPos = playback.position;
      if (Math.abs(currentPos - expectedPos) > 1.5) {
        playerRef.current.seekTo(expectedPos, true);
      }
      playerRef.current.playVideo();
    } else {
      playerRef.current.pauseVideo();
    }
  }, [playback.isPlaying, playback.position]);

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = extractVideoId(youtubeUrl);
    if (id) {
      setVideoId(id);
      if (isHost) {
        socket.emit('HOST_CHANGE_TRACK', {
          roomId,
          track: {
            id: `yt-${id}`,
            title: `YouTube Video (${id})`,
            artist: 'YouTube Stream',
            duration: 300,
            url: `https://www.youtube.com/watch?v=${id}`,
            sourceType: 'youtube',
            youtubeVideoId: id
          }
        });
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Official YouTube Compliance & Browser Limitations Banner */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-xs text-amber-200">
        <div className="flex items-start gap-2.5">
          <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-amber-300 flex items-center gap-1.5">
              <span>Official YouTube IFrame Coordinated Mode</span>
              <ShieldCheck size={14} className="text-emerald-400" />
            </div>
            <p className="text-amber-200/80 leading-relaxed">
              Browser security (Same-Origin Policy & DRM sandbox) strictly prohibits web apps from tapping YouTube IFrame audio into the Web Audio API for sub-millisecond hardware clock scheduling.
            </p>
            <p className="text-amber-200/80 leading-relaxed">
              SyncBeat coordinates play, pause, and seek events across your devices. For <strong>zero-echo multi-device speaker party sound</strong>, switch to the <strong>High-Precision Engine</strong> (Studio Tracks or Upload MP3).
            </p>
          </div>
        </div>
      </div>

      {/* Host URL Input */}
      {isHost && (
        <form onSubmit={handleUrlSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Youtube size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-rose-500" />
            <input
              type="text"
              placeholder="Paste YouTube video URL (e.g., https://www.youtube.com/watch?v=...)"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500 transition"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-rose-600/20 transition active:scale-95"
          >
            Load Video
          </button>
        </form>
      )}

      {/* Embedded YouTube Iframe Container */}
      <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black border border-slate-800 shadow-2xl">
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  );
};
