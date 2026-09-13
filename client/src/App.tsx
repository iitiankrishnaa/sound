import React, { useState, useEffect } from 'react';
import { socket } from './services/socket.js';
import { syncEngine } from './services/syncEngine.js';
import { audioEngine } from './services/audioEngine.js';
import { Room, ServerNetworkInfo } from '../../shared/types.js';
import { LandingPage } from './components/LandingPage.js';
import { HostDashboard } from './components/HostDashboard.js';
import { SpeakerView } from './components/SpeakerView.js';
import { AlertCircle, X } from 'lucide-react';

export const App: React.FC = () => {
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [deviceId, setDeviceId] = useState<string>('');
  const [lanUrl, setLanUrl] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [initialJoinCode, setInitialJoinCode] = useState<string>('');

  useEffect(() => {
    let code = '';
    const params = new URLSearchParams(window.location.search);
    const joinParam = params.get('join');
    if (joinParam) {
      code = joinParam.toUpperCase();
    } else {
      const match = window.location.pathname.match(/\/join\/([a-zA-Z0-9]{4,6})/i);
      if (match && match[1]) {
        code = match[1].toUpperCase();
      }
    }

    if (code) {
      setInitialJoinCode(code);

      const autoJoin = () => {
        const ua = navigator.userAgent;
        let defaultName = 'Phone Speaker';
        if (/iPhone/i.test(ua)) defaultName = 'iPhone Speaker';
        else if (/iPad/i.test(ua)) defaultName = 'iPad Speaker';
        else if (/Android/i.test(ua)) defaultName = 'Android Speaker';
        else if (/Macintosh/i.test(ua)) defaultName = 'MacBook Speaker';

        const hostToken = localStorage.getItem(`syncbeat_host_token_${code}`) || undefined;
        socket.emit('ROOM_JOIN', {
          roomId: code,
          deviceName: defaultName,
          hostToken
        });
      };

      if (socket.connected) {
        autoJoin();
      } else {
        socket.once('connect', autoJoin);
      }
    }

    // 2. Fetch server network info (local IP on LAN)
    fetch('/api/network-info')
      .then((res) => res.json())
      .then((data: ServerNetworkInfo) => {
        if (data.lanUrl) {
          // If in dev (port 5173), adjust port for client join link
          const clientPort = window.location.port;
          const url = new URL(data.lanUrl);
          if (clientPort && clientPort !== url.port) {
            url.port = clientPort;
          }
          setLanUrl(url.origin);
        }
      })
      .catch(() => {
        setLanUrl(window.location.origin);
      });
  }, []);

  // 3. Socket event listeners
  useEffect(() => {
    socket.on('ROOM_CREATED', (data: { roomId: string; room: Room; hostToken: string }) => {
      setCurrentRoom(data.room);
      setIsHost(true);
      setDeviceId(socket.id || '');
      localStorage.setItem(`syncbeat_host_token_${data.roomId}`, data.hostToken);
      syncEngine.start();
      setErrorMessage(null);
    });

    socket.on('ROOM_JOINED', (data: { roomId: string; room: Room; deviceId: string; isHost: boolean }) => {
      setCurrentRoom(data.room);
      setIsHost(data.isHost);
      setDeviceId(data.deviceId);
      syncEngine.start();
      setErrorMessage(null);
    });

    socket.on('ROOM_UPDATED', (data: { room: Room }) => {
      setCurrentRoom(data.room);
    });

    socket.on('ROOM_ERROR', (data: { message: string }) => {
      setErrorMessage(data.message);
    });

    socket.on('SPEAKER_KICKED', (data: { reason: string }) => {
      audioEngine.stop();
      syncEngine.stop();
      setCurrentRoom(null);
      setErrorMessage(data.reason || 'You were removed from the room.');
    });

    socket.on('ROOM_CLOSED', (data: { reason: string }) => {
      audioEngine.stop();
      syncEngine.stop();
      setCurrentRoom(null);
      setErrorMessage(data.reason || 'The room was closed by the host.');
    });

    // Auto re-join on socket reconnection if room existed
    socket.on('connect', () => {
      if (currentRoom) {
        const hostToken = localStorage.getItem(`syncbeat_host_token_${currentRoom.id}`) || undefined;
        socket.emit('ROOM_JOIN', {
          roomId: currentRoom.id,
          deviceName: isHost ? 'Host Controller' : 'Reconnecting Speaker',
          hostToken
        });
      }
    });

    return () => {
      socket.off('ROOM_CREATED');
      socket.off('ROOM_JOINED');
      socket.off('ROOM_UPDATED');
      socket.off('ROOM_ERROR');
      socket.off('SPEAKER_KICKED');
      socket.off('ROOM_CLOSED');
    };
  }, [currentRoom, isHost]);

  const handleCreateRoom = (options: { hostName: string; pin?: string }) => {
    setErrorMessage(null);
    socket.emit('ROOM_CREATE', options);
  };

  const handleJoinRoom = (roomId: string, deviceName: string, pin?: string) => {
    setErrorMessage(null);
    const hostToken = localStorage.getItem(`syncbeat_host_token_${roomId}`) || undefined;
    socket.emit('ROOM_JOIN', {
      roomId,
      deviceName,
      pin,
      hostToken
    });
  };

  const handleLeaveRoom = () => {
    audioEngine.stop();
    syncEngine.stop();
    setCurrentRoom(null);
    setIsHost(false);
  };

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 selection:bg-sky-500 selection:text-white">
      {/* Toast Error Alert */}
      {errorMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4 animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between p-4 bg-rose-500/90 backdrop-blur-md text-white rounded-2xl shadow-2xl border border-rose-400/30">
            <div className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold">
              <AlertCircle size={18} className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="p-1 rounded-lg hover:bg-white/20 transition"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Main View Router */}
      {!currentRoom ? (
        <LandingPage
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          initialJoinCode={initialJoinCode}
        />
      ) : isHost ? (
        <HostDashboard
          room={currentRoom}
          lanUrl={lanUrl}
          onLeaveRoom={handleLeaveRoom}
        />
      ) : (
        <SpeakerView
          room={currentRoom}
          deviceId={deviceId}
          onLeaveRoom={handleLeaveRoom}
        />
      )}
    </div>
  );
};
