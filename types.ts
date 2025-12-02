export enum VoiceName {
  Kore = 'Kore',
  Puck = 'Puck',
  Charon = 'Charon',
  Fenrir = 'Fenrir',
  Zephyr = 'Zephyr',
  Aoede = 'Aoede'
}

export type AudioSourceType = 'tts' | 'recording' | 'batch';

export interface AudioResult {
  id: string;
  text: string;
  voice: string;
  blobUrl: string;
  timestamp: number;
  duration?: string; 
  type: AudioSourceType;
  // Raw PCM data needed for MP3 conversion if available, else we rely on blob
  pcmData?: Uint8Array; 
}

export interface VideoResult {
  id: string;
  prompt: string;
  videoUrl: string;
  timestamp: number;
}

export interface VoiceOption {
  id: VoiceName;
  label: string;
  description: string;
  gender: 'Male' | 'Female' | 'Neutral';
}

export interface VoicePreset {
  id: string;
  name: string;
  voice: VoiceName;
  musicVolume: number;
}

export type Language = 'English' | 'Hindi' | 'Kannada' | 'Telugu' | 'Tamil' | 'Malayalam';
