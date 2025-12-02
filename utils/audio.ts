/**
 * Decodes a base64 string into a Uint8Array.
 */
export const base64ToUint8Array = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

/**
 * Adds a WAV header to raw PCM data.
 * Gemini TTS output is typically 24kHz, 16-bit, Mono (1 channel).
 */
export const addWavHeader = (samples: Uint8Array, sampleRate: number = 24000, numChannels: number = 1): ArrayBuffer => {
  const buffer = new ArrayBuffer(44 + samples.length);
  const view = new DataView(buffer);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // file length
  view.setUint32(4, 36 + samples.length, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // format chunk identifier
  writeString(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw)
  view.setUint16(20, 1, true);
  // channel count
  view.setUint16(22, numChannels, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sampleRate * blockAlign)
  view.setUint32(28, sampleRate * numChannels * 2, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, numChannels * 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, samples.length, true);

  // Write the PCM samples
  const uint8View = new Uint8Array(buffer);
  uint8View.set(samples, 44);

  return buffer;
};

const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

/**
 * Converts PCM data (Int16) to MP3 using lamejs.
 * Requires lamejs to be loaded in global scope.
 */
export const convertToMp3 = (pcmData: Uint8Array, sampleRate: number = 24000, numChannels: number = 1): Blob => {
  // @ts-ignore
  if (typeof lamejs === 'undefined') {
    console.warn("lamejs not found. Returning WAV blob instead.");
    return new Blob([addWavHeader(pcmData, sampleRate, numChannels)], { type: 'audio/wav' });
  }

  // Convert Uint8Array bytes to Int16Array samples
  const samples = new Int16Array(pcmData.buffer);

  // @ts-ignore
  const mp3encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, 128); // 128kbps
  const mp3Data = [];
  
  // Encode
  const blockSize = 1152;
  for (let i = 0; i < samples.length; i += blockSize) {
    const sampleChunk = samples.subarray(i, i + blockSize);
    const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }
  }
  
  const mp3buf = mp3encoder.flush();
  if (mp3buf.length > 0) {
    mp3Data.push(mp3buf);
  }

  return new Blob(mp3Data, { type: 'audio/mp3' });
};

/**
 * Mixes speech audio with background music.
 * Loops music if speech is longer.
 */
export const mixAudio = async (speechBlob: Blob, musicBlob: Blob, musicVolume: number): Promise<Blob> => {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioContextClass();
  
  const speechBuffer = await ctx.decodeAudioData(await speechBlob.arrayBuffer());
  const musicBuffer = await ctx.decodeAudioData(await musicBlob.arrayBuffer());
  
  // Use speech duration for the final clip
  const duration = speechBuffer.duration;
  const sampleRate = 24000; // Standardize to 24kHz like Gemini output or ctx.sampleRate
  
  // Create offline context for rendering
  const offlineCtx = new OfflineAudioContext(1, sampleRate * duration, sampleRate);
  
  // Setup Speech Source
  const speechSource = offlineCtx.createBufferSource();
  speechSource.buffer = speechBuffer;
  speechSource.connect(offlineCtx.destination);
  speechSource.start();
  
  // Setup Music Source
  const musicSource = offlineCtx.createBufferSource();
  musicSource.buffer = musicBuffer;
  musicSource.loop = true;
  
  const musicGain = offlineCtx.createGain();
  musicGain.gain.value = musicVolume;
  
  musicSource.connect(musicGain);
  musicGain.connect(offlineCtx.destination);
  musicSource.start();
  
  const renderedBuffer = await offlineCtx.startRendering();
  
  // Convert AudioBuffer to WAV
  const data = renderedBuffer.getChannelData(0);
  // Float32 to Int16
  const pcmLength = data.length;
  const pcmData = new Int16Array(pcmLength);
  for (let i = 0; i < pcmLength; i++) {
    let s = Math.max(-1, Math.min(1, data[i]));
    pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  
  const wavBuffer = addWavHeader(new Uint8Array(pcmData.buffer), sampleRate, 1);
  return new Blob([wavBuffer], { type: 'audio/wav' });
};

/**
 * Generates a synthesized background track blob programmatically.
 * Used for the "Music Library" to avoid external asset dependencies.
 */
export const generateSynthesizedTrack = async (type: 'ambient' | 'upbeat' | 'lofi'): Promise<Blob> => {
  const sampleRate = 44100;
  const duration = 10; // 10 seconds loop
  const offlineCtx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);
  
  const t = offlineCtx.currentTime;

  if (type === 'ambient') {
    // Generate simple drone
    const osc1 = offlineCtx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 110; // A2
    
    const osc2 = offlineCtx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = 164.81; // E3
    
    const gain = offlineCtx.createGain();
    gain.gain.value = 0.1;

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(offlineCtx.destination);
    
    osc1.start();
    osc2.start();
  } else if (type === 'lofi') {
     // Pink noise-ish + chord
     const bufferSize = sampleRate * duration;
     const buffer = offlineCtx.createBuffer(2, bufferSize, sampleRate);
     const data = buffer.getChannelData(0);
     for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = data[i];
        data[i] *= 0.05; // Quiet vinyl crackle
     }
     const noiseSrc = offlineCtx.createBufferSource();
     noiseSrc.buffer = buffer;
     noiseSrc.connect(offlineCtx.destination);
     noiseSrc.start();

     const osc = offlineCtx.createOscillator();
     osc.type = 'sine';
     osc.frequency.value = 261.6; // C4
     const lfo = offlineCtx.createOscillator();
     lfo.frequency.value = 2; // Wobble
     const lfoGain = offlineCtx.createGain();
     lfoGain.gain.value = 5;
     lfo.connect(lfoGain);
     lfoGain.connect(osc.frequency);
     
     const master = offlineCtx.createGain();
     master.gain.value = 0.15;
     osc.connect(master);
     master.connect(offlineCtx.destination);
     
     osc.start();
     lfo.start();
  } else {
    // Upbeat - Simple Arp
    const osc = offlineCtx.createOscillator();
    osc.type = 'square';
    const gain = offlineCtx.createGain();
    gain.gain.value = 0.05;
    
    osc.connect(gain);
    gain.connect(offlineCtx.destination);
    osc.start();

    // Frequency modulation to simulate notes
    const now = 0;
    const notes = [440, 554, 659, 880]; // A Major
    for(let i=0; i< duration * 4; i++) {
       osc.frequency.setValueAtTime(notes[i % 4], now + i * 0.25);
    }
  }

  const renderedBuffer = await offlineCtx.startRendering();
  
  // Encode to WAV
  const length = renderedBuffer.length * 2; // 2 bytes per sample
  const view = new DataView(new ArrayBuffer(44 + length));
  // Standard WAV Header for 16bit mono (simplify render to mono for file size if needed, but we did stereo)
  // Actually, helper only supports mono mix currently in other functions.
  // Let's grab just channel 0 for simplicity.
  const data = renderedBuffer.getChannelData(0);
  const pcmData = new Int16Array(data.length);
  for (let i = 0; i < data.length; i++) {
    let s = Math.max(-1, Math.min(1, data[i]));
    pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  
  const wavBytes = addWavHeader(new Uint8Array(pcmData.buffer), sampleRate, 1);
  return new Blob([wavBytes], { type: 'audio/wav' });
};

let lastOut = 0;
