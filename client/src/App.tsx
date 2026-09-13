import React, { useState, useEffect, useRef } from 'react';
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
  const [isJoining, setIsJoining] = useState(false);

  const currentRoomRef = useRef<Room | null>(null);
  const isHostRef = useRef<boolean>(false);
  currentRoomRef.current = currentRoom;
  isHostRef.current = isHost;

  // 1. Socket event listeners registered ONCE on mount
  useEffect(() => {
    const onRoomCreated = (data: { roomId: string; room: Room; hostToken: string }) => {
      setCurrentRoom(data.room);
      setIsHost(true);
      setDeviceId(socket.id || '');
      setIsJoining(false);
      setErrorMessage(null);
      localStorage.setItem(`syncbeat_host_token_${data.roomId}`, data.hostToken);
      sessionStorage.setItem('syncbeat_active_session', JSON.stringify({
        roomId: data.roomId,
        isHost: true,
        deviceName: 'Host Controller'
      }));
      syncEngine.start();
    };

    const onRoomJoined = (data: { roomId: string; room: Room; deviceId: string; isHost: boolean }) => {
      setCurrentRoom(data.room);
      setIsHost(data.isHost);
      setDeviceId(data.deviceId);
      setIsJoining(false);
      setErrorMessage(null);
      sessionStorage.setItem('syncbeat_active_session', JSON.stringify({
        roomId: data.roomId,
        isHost: data.isHost,
        deviceName: data.room.speakers[data.deviceId]?.name || 'Speaker Device'
      }));
      syncEngine.start();
    };

    const onRoomUpdated = (data: { room: Room }) => {
      setCurrentRoom(data.room);
    };

    const onRoomError = (data: { message: string }) => {
      setErrorMessage(data.message);
      setIsJoining(false);
    };

    const onSpeakerKicked = (data: { reason: string }) => {
      audioEngine.stop();
      syncEngine.stop();
      setCurrentRoom(null);
      setIsJoining(false);
      sessionStorage.removeItem('syncbeat_active_session');
      setErrorMessage(data.reason || 'You were removed from the room.');
    };

    const onRoomClosed = (data: { reason: string }) => {
      audioEngine.stop();
      syncEngine.stop();
      setCurrentRoom(null);
      setIsJoining(false);
      sessionStorage.removeItem('syncbeat_active_session');
      setErrorMessage(data.reason || 'The room was closed by the host.');
    };

    const onConnect = () => {
      const activeRoom = currentRoomRef.current;
      if (activeRoom) {
        const hostToken = localStorage.getItem(`syncbeat_host_token_${activeRoom.id}`) || undefined;
        socket.emit('ROOM_JOIN', {
          roomId: activeRoom.id,
          deviceName: isHostRef.current ? 'Host Controller' : 'Reconnecting Speaker',
          hostToken
        });
      }
    };

    socket.on('ROOM_CREATED', onRoomCreated);
    socket.on('ROOM_JOINED', onRoomJoined);
    socket.on('ROOM_UPDATED', onRoomUpdated);
    socket.on('ROOM_ERROR', onRoomError);
    socket.on('SPEAKER_KICKED', onSpeakerKicked);
    socket.on('ROOM_CLOSED', onRoomClosed);
    socket.on('connect', onConnect);

    return () => {
      socket.off('ROOM_CREATED', onRoomCreated);
      socket.off('ROOM_JOINED', onRoomJoined);
      socket.off('ROOM_UPDATED', onRoomUpdated);
      socket.off('ROOM_ERROR', onRoomError);
      socket.off('SPEAKER_KICKED', onSpeakerKicked);
      socket.off('ROOM_CLOSED', onRoomClosed);
      socket.off('connect', onConnect);
    };
  }, []);

  // 2. Handle initial join from URL, QR code, or saved session
  useEffect(() => {
    let code = '';
    const params = new URLSearchParams(window.location.search);
    const joinParam = params.get('join');
    if (joinParam) {
      code = joinParam.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    } else {
      const match = window.location.pathname.match(/\/join\/([a-zA-Z0-9]{4,6})/i);
      if (match && match[1]) {
        code = match[1].replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      }
    }

    // Check active session from refresh if no code in URL
    if (!code) {
      try {
        const saved = sessionStorage.getItem('syncbeat_active_session');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.roomId) {
            code = parsed.roomId;
          }
        }
      } catch {}
    }

    if (code) {
      setInitialJoinCode(code);
      setIsJoining(true);

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

    // Fetch server network info (local IP on LAN)
    fetch('/api/network-info')
      .then((res) => res.json())
      .then((data: ServerNetworkInfo) => {
        if (data.lanUrl) {
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

  const handleCreateRoom = (options: { hostName: string; pin?: string }) => {
    setErrorMessage(null);
    setIsJoining(true);
    socket.emit('ROOM_CREATE', options);
  };

  const handleJoinRoom = (roomId: string, deviceName: string, pin?: string) => {
    setErrorMessage(null);
    setIsJoining(true);
    const cleanRoomId = roomId.replace(/[^a-zA-Z0-9]/g, '').trim().toUpperCase();
    const hostToken = localStorage.getItem(`syncbeat_host_token_${cleanRoomId}`) || undefined;
    socket.emit('ROOM_JOIN', {
      roomId: cleanRoomId,
      deviceName,
      pin,
      hostToken
    });
  };

  const handleLeaveRoom = () => {
    audioEngine.stop();
    syncEngine.stop();
    sessionStorage.removeItem('syncbeat_active_session');
    setCurrentRoom(null);
    setIsHost(false);
    setIsJoining(false);
    if (window.location.search) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  };

  // Determine effective base URL for QR codes and invite links:
  // On Render / cloud, window.location.origin is always the reachable public HTTPS address.
  const isPublicDomain = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && !window.location.hostname.startsWith('192.168.') && !window.location.hostname.startsWith('10.');
  const effectiveBaseUrl = isPublicDomain ? window.location.origin : (lanUrl || window.location.origin);

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
          isJoining={isJoining}
        />
      ) : isHost ? (
        <HostDashboard
          room={currentRoom}
          lanUrl={effectiveBaseUrl}
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
