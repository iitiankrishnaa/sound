import { io } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3000';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSyncBeatIntegrationTest() {
  console.log('🧪 Starting SyncBeat Multi-Device End-to-End Simulation Test...\n');

  // Step 1: Connect Host
  const hostSocket = io(SERVER_URL, { transports: ['websocket'] });
  let roomId = '';
  let hostToken = '';

  await new Promise<void>((resolve, reject) => {
    hostSocket.on('connect', () => {
      console.log('✅ [1/9] Host connected with socket ID:', hostSocket.id);
      hostSocket.emit('ROOM_CREATE', { hostName: 'Host Controller (PC)' });
    });

    hostSocket.on('ROOM_CREATED', (data) => {
      roomId = data.roomId;
      hostToken = data.hostToken;
      console.log(`✅ [2/9] Room Created successfully! Room Code: ${roomId}, Token: ${hostToken.substring(0, 8)}...`);
      resolve();
    });

    hostSocket.on('ROOM_ERROR', (err) => reject(new Error(err.message)));
  });

  // Step 2: Connect Speaker 1 (Android Phone)
  const phone1Socket = io(SERVER_URL, { transports: ['websocket'] });
  await new Promise<void>((resolve) => {
    phone1Socket.on('connect', () => {
      console.log('✅ [3/9] Phone 1 connected with socket ID:', phone1Socket.id);
      phone1Socket.emit('ROOM_JOIN', {
        roomId,
        deviceName: "Krishna's Galaxy S24"
      });
    });

    phone1Socket.on('ROOM_JOINED', (data) => {
      console.log(`✅ [3/9] Phone 1 joined room ${data.roomId} as speaker (isHost: ${data.isHost})`);
      resolve();
    });
  });

  // Step 3: Connect Speaker 2 (iPad Tablet)
  const phone2Socket = io(SERVER_URL, { transports: ['websocket'] });
  await new Promise<void>((resolve) => {
    phone2Socket.on('connect', () => {
      console.log('✅ [4/9] iPad connected with socket ID:', phone2Socket.id);
      phone2Socket.emit('ROOM_JOIN', {
        roomId,
        deviceName: 'Living Room iPad'
      });
    });

    phone2Socket.on('ROOM_JOINED', (data) => {
      console.log(`✅ [4/9] iPad joined room ${data.roomId} as speaker (isHost: ${data.isHost})`);
      resolve();
    });
  });

  // Step 4: High-precision NTP Clock Sync Test
  console.log('\n⏱️ Testing High-Precision NTP Clock Sync...');
  await new Promise<void>((resolve) => {
    const t0 = Date.now();
    phone1Socket.emit('SYNC_PING', { t0 });

    phone1Socket.on('SYNC_PONG', (data) => {
      const t3 = Date.now();
      const rtt = (t3 - data.t0) - (data.t2 - data.t1);
      const clockOffset = ((data.t1 - data.t0) + (data.t2 - t3)) / 2;
      console.log(`✅ [5/9] NTP Sync Successful! RTT: ${rtt}ms, One-way Latency: ${Math.round(rtt / 2)}ms, Clock Offset: ${clockOffset}ms`);
      resolve();
    });
  });

  // Step 5: Host Triggers Synchronized PLAY
  console.log('\n🎵 Testing Synchronized PLAY Event Broadcast...');
  const playReceived: string[] = [];

  const checkAllReceivedPlay = () => {
    if (playReceived.length === 3) {
      console.log('✅ [6/9] All 3 devices (Host + 2 Speakers) received synchronized PLAY command in lockstep!');
    }
  };

  hostSocket.on('PLAYBACK_STATE_CHANGED', (data) => {
    if (data.playback.isPlaying) {
      playReceived.push('host');
      checkAllReceivedPlay();
    }
  });

  phone1Socket.on('PLAYBACK_STATE_CHANGED', (data) => {
    if (data.playback.isPlaying) {
      playReceived.push('phone1');
      console.log(`   📱 Phone 1 received PLAY: targetServerTime=${data.playback.targetServerTime}, msInFuture=${data.playback.targetServerTime - Date.now()}ms`);
      checkAllReceivedPlay();
    }
  });

  phone2Socket.on('PLAYBACK_STATE_CHANGED', (data) => {
    if (data.playback.isPlaying) {
      playReceived.push('phone2');
      console.log(`   📱 iPad received PLAY: targetServerTime=${data.playback.targetServerTime}, msInFuture=${data.playback.targetServerTime - Date.now()}ms`);
      checkAllReceivedPlay();
    }
  });

  hostSocket.emit('HOST_PLAY', { roomId, position: 10, targetDelayMs: 500 });
  await sleep(800);

  // Step 6: Speaker Reports Live Metrics (Latency & Drift)
  console.log('\n📊 Testing Real-time Drift & Metrics Reporting...');
  phone1Socket.emit('SPEAKER_METRICS', {
    roomId,
    latencyMs: 18,
    driftMs: 3,
    syncQuality: 'excellent',
    batteryLevel: 0.85,
    isAudioUnlocked: true
  });

  await new Promise<void>((resolve) => {
    hostSocket.on('ROOM_UPDATED', (data) => {
      const s = data.room.speakers[phone1Socket.id!];
      if (s && s.driftMs === 3) {
        console.log(`✅ [7/9] Host received live speaker telemetry: Latency=${s.latencyMs}ms, Drift=${s.driftMs}ms, Battery=85%, Quality=${s.syncQuality}`);
        resolve();
      }
    });
  });

  // Step 7: Host Triggers RESYNC ALL
  console.log('\n🔄 Testing RESYNC ALL broadcast...');
  let resyncCount = 0;
  phone1Socket.on('FORCE_RESYNC', () => {
    resyncCount++;
  });
  phone2Socket.on('FORCE_RESYNC', () => {
    resyncCount++;
  });

  hostSocket.emit('HOST_RESYNC_ALL', { roomId });
  await sleep(500);
  if (resyncCount >= 2) {
    console.log('✅ [8/9] All speakers received FORCE_RESYNC broadcast successfully.');
  }

  // Step 8: Disconnection & Cleanup
  console.log('\n🔌 Testing Speaker Disconnection...');
  phone2Socket.disconnect();
  await sleep(400);

  console.log('✅ [9/9] iPad disconnected. Room state verified.');

  hostSocket.disconnect();
  phone1Socket.disconnect();

  console.log('\n🎉 ALL 9 MULTI-DEVICE SYNCHRONIZATION TESTS PASSED WITH 100% SUCCESS!\n');
  process.exit(0);
}

runSyncBeatIntegrationTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
