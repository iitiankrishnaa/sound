import fs from 'fs';
import path from 'path';

// Helper to write a 16-bit PCM WAV file
function createWavBuffer(
  sampleRate: number,
  channels: number,
  samples: Float32Array[]
): Buffer {
  const numSamples = samples[0].length;
  const byteRate = sampleRate * channels * 2;
  const blockAlign = channels * 2;
  const dataSize = numSamples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF identifier
  buffer.write('RIFF', 0);
  // file length minus RIFF identifier & length = 36 + dataSize
  buffer.writeUInt32LE(36 + dataSize, 4);
  // RIFF type
  buffer.write('WAVE', 8);
  // format chunk identifier
  buffer.write('fmt ', 12);
  // format chunk length
  buffer.writeUInt32LE(16, 16);
  // sample format (1 = PCM)
  buffer.writeUInt16LE(1, 20);
  // channel count
  buffer.writeUInt16LE(channels, 22);
  // sample rate
  buffer.writeUInt32LE(sampleRate, 24);
  // byte rate
  buffer.writeUInt32LE(byteRate, 28);
  // block align
  buffer.writeUInt16LE(blockAlign, 32);
  // bits per sample
  buffer.writeUInt16LE(16, 34);
  // data chunk identifier
  buffer.write('data', 36);
  // data chunk length
  buffer.writeUInt32LE(dataSize, 40);

  // Write interleaved PCM samples
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < channels; ch++) {
      let sample = samples[ch][i];
      // Clamping
      sample = Math.max(-1, Math.min(1, sample));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      buffer.writeInt16LE(Math.floor(intSample), offset);
      offset += 2;
    }
  }

  return buffer;
}

export function ensureDefaultAudioFiles(outputDir: string) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const sampleRate = 44100;

  // 1. Sync Metronome Pulse (120 BPM = 2 beats per second = 0.5s per beat, 60 seconds loop)
  const pulsePath = path.join(outputDir, 'test-pulse.wav');
  if (!fs.existsSync(pulsePath)) {
    const durationSec = 60;
    const totalSamples = sampleRate * durationSec;
    const left = new Float32Array(totalSamples);
    const right = new Float32Array(totalSamples);

    const beatIntervalSamples = Math.floor(sampleRate * 0.5); // 120 BPM
    for (let beat = 0; beat < durationSec * 2; beat++) {
      const beatStart = beat * beatIntervalSamples;
      const isBar = beat % 4 === 0;
      const freq = isBar ? 1200 : 800; // Higher pitch on bar start
      const clickDuration = Math.floor(sampleRate * 0.04); // 40ms click

      for (let j = 0; j < clickDuration; j++) {
        const idx = beatStart + j;
        if (idx < totalSamples) {
          const t = j / sampleRate;
          const envelope = Math.exp(-j / (sampleRate * 0.008)); // sharp decay
          const val = Math.sin(2 * Math.PI * freq * t) * envelope * 0.7;
          left[idx] = val;
          right[idx] = val;
        }
      }
    }
    fs.writeFileSync(pulsePath, createWavBuffer(sampleRate, 2, [left, right]));
    console.log('[AudioGenerator] Generated test-pulse.wav');
  }

  // 2. Neon Horizon (Upbeat Synthwave Groove, 60s)
  const neonPath = path.join(outputDir, 'neon-horizon.mp3'); // saved as wav buffer with mp3 extension or wav
  const neonWavPath = path.join(outputDir, 'neon-horizon.wav');
  if (!fs.existsSync(neonWavPath)) {
    const durationSec = 45;
    const totalSamples = sampleRate * durationSec;
    const left = new Float32Array(totalSamples);
    const right = new Float32Array(totalSamples);

    // BPM = 124 -> beat = 60/124 = 0.4838s
    const beatSamples = Math.floor(sampleRate * (60 / 124));
    // Chord progression: Am - F - C - G
    const chords = [
      [220, 261.63, 329.63, 440], // Am
      [174.61, 220, 261.63, 349.23], // F
      [261.63, 329.63, 392, 523.25], // C
      [196, 246.94, 293.66, 392] // G
    ];

    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const currentBeat = Math.floor(i / beatSamples);
      const currentBar = Math.floor(currentBeat / 4);
      const chord = chords[currentBar % chords.length];
      const arpStep = Math.floor((i % beatSamples) / (beatSamples / 4));
      const noteFreq = chord[arpStep % chord.length];

      // Arpeggio synth note with saw-like harmonics
      const noteT = (i % (beatSamples / 4)) / sampleRate;
      const synthEnv = Math.max(0, 1 - noteT * 6);
      const synthVal =
        (Math.sin(2 * Math.PI * noteFreq * t) * 0.4 +
          Math.sin(2 * Math.PI * noteFreq * 2 * t) * 0.2 +
          Math.sin(2 * Math.PI * (noteFreq * 1.005) * t) * 0.2) *
        synthEnv *
        0.35;

      // Bass note
      const bassFreq = chord[0] / 2;
      const bassEnv = Math.max(0, 1 - ((i % (beatSamples / 2)) / sampleRate) * 4);
      const bassVal = Math.sin(2 * Math.PI * bassFreq * t) * bassEnv * 0.25;

      // Drum kick on every beat
      const kickT = (i % beatSamples) / sampleRate;
      const kickFreq = Math.max(45, 130 - kickT * 400);
      const kickEnv = Math.exp(-kickT * 18);
      const kickVal = Math.sin(2 * Math.PI * kickFreq * kickT) * kickEnv * 0.45;

      // Snare on beats 2 and 4
      let snareVal = 0;
      if (currentBeat % 2 === 1) {
        const snareT = (i % beatSamples) / sampleRate;
        const snareEnv = Math.exp(-snareT * 22);
        snareVal = (Math.random() * 2 - 1) * snareEnv * 0.25;
      }

      const totalVal = (synthVal + bassVal + kickVal + snareVal) * 0.75;
      left[i] = totalVal * 0.95;
      right[i] = totalVal * 1.05;
    }

    const wavBuf = createWavBuffer(sampleRate, 2, [left, right]);
    fs.writeFileSync(neonWavPath, wavBuf);
    fs.writeFileSync(neonPath, wavBuf); // compatible wav
    console.log('[AudioGenerator] Generated neon-horizon.wav');
  }

  // 3. Midnight Coffee Lofi (Warm chill chords, 45s)
  const lofiPath = path.join(outputDir, 'lofi-chill.mp3');
  const lofiWavPath = path.join(outputDir, 'lofi-chill.wav');
  if (!fs.existsSync(lofiWavPath)) {
    const durationSec = 45;
    const totalSamples = sampleRate * durationSec;
    const left = new Float32Array(totalSamples);
    const right = new Float32Array(totalSamples);

    // BPM 85 -> beat = 60/85 = 0.7058s
    const beatSamples = Math.floor(sampleRate * (60 / 85));
    // Dm9 - G13 - Cmaj9 - A7
    const chords = [
      [146.83, 220, 261.63, 311.13, 369.99],
      [196, 246.94, 293.66, 329.63, 440],
      [130.81, 196, 246.94, 293.66, 392],
      [110, 164.81, 220, 277.18, 329.63]
    ];

    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const currentBeat = Math.floor(i / beatSamples);
      const currentBar = Math.floor(currentBeat / 4);
      const chord = chords[currentBar % chords.length];

      // Soft electric piano vibrato
      let pianoVal = 0;
      const chordT = (i % (beatSamples * 2)) / sampleRate;
      const chordEnv = Math.exp(-chordT * 1.8);
      const vibrato = 1 + 0.003 * Math.sin(2 * Math.PI * 4.5 * t);
      for (const freq of chord) {
        pianoVal += Math.sin(2 * Math.PI * freq * vibrato * t) * 0.12;
      }
      pianoVal *= chordEnv;

      // Gentle lofi kick & rimshot
      const kickT = (i % (beatSamples * 2)) / sampleRate;
      const kickVal = Math.sin(2 * Math.PI * 55 * kickT) * Math.exp(-kickT * 15) * 0.3;

      // Soft crackle
      const crackle = (Math.random() * 2 - 1) * 0.012;

      left[i] = (pianoVal + kickVal + crackle) * 0.6;
      right[i] = (pianoVal + kickVal + crackle) * 0.6;
    }

    const wavBuf = createWavBuffer(sampleRate, 2, [left, right]);
    fs.writeFileSync(lofiWavPath, wavBuf);
    fs.writeFileSync(lofiPath, wavBuf);
    console.log('[AudioGenerator] Generated lofi-chill.wav');
  }

  // 4. Acoustic Breeze (Warm plucked acoustic chords, 45s)
  const acousticPath = path.join(outputDir, 'acoustic-breeze.mp3');
  const acousticWavPath = path.join(outputDir, 'acoustic-breeze.wav');
  if (!fs.existsSync(acousticWavPath)) {
    const durationSec = 45;
    const totalSamples = sampleRate * durationSec;
    const left = new Float32Array(totalSamples);
    const right = new Float32Array(totalSamples);

    // BPM 96 -> beat = 0.625s
    const beatSamples = Math.floor(sampleRate * 0.625);
    const chords = [
      [196, 246.94, 293.66, 392], // G
      [164.81, 196, 246.94, 329.63], // Em
      [130.81, 164.81, 196, 261.63], // C
      [146.83, 220, 293.66, 369.99] // D
    ];

    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const currentBeat = Math.floor(i / beatSamples);
      const currentBar = Math.floor(currentBeat / 4);
      const chord = chords[currentBar % chords.length];
      const stringIdx = Math.floor((i % beatSamples) / (beatSamples / 4));
      const noteFreq = chord[stringIdx % chord.length];

      const noteT = (i % (beatSamples / 4)) / sampleRate;
      const pluckEnv = Math.exp(-noteT * 6);
      const guitarVal =
        (Math.sin(2 * Math.PI * noteFreq * t) * 0.5 +
          Math.sin(2 * Math.PI * noteFreq * 2 * t) * 0.25 +
          Math.sin(2 * Math.PI * noteFreq * 3 * t) * 0.1) *
        pluckEnv *
        0.4;

      left[i] = guitarVal * 0.7;
      right[i] = guitarVal * 0.7;
    }

    const wavBuf = createWavBuffer(sampleRate, 2, [left, right]);
    fs.writeFileSync(acousticWavPath, wavBuf);
    fs.writeFileSync(acousticPath, wavBuf);
    console.log('[AudioGenerator] Generated acoustic-breeze.wav');
  }
}
