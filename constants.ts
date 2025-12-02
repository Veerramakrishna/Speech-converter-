import { VoiceName, VoiceOption } from './types';

export const VOICES: VoiceOption[] = [
  { 
    id: VoiceName.Kore, 
    label: 'Kore', 
    description: 'Calm and composed (Female)', 
    gender: 'Female' 
  },
  { 
    id: VoiceName.Puck, 
    label: 'Puck', 
    description: 'Energetic and playful (Male)', 
    gender: 'Male' 
  },
  { 
    id: VoiceName.Charon, 
    label: 'Charon', 
    description: 'Deep and resonant (Male)', 
    gender: 'Male' 
  },
  { 
    id: VoiceName.Fenrir, 
    label: 'Fenrir', 
    description: 'Strong and authoritative (Male)', 
    gender: 'Male' 
  },
  { 
    id: VoiceName.Zephyr, 
    label: 'Zephyr', 
    description: 'Soft and gentle (Female)', 
    gender: 'Female' 
  },
  { 
    id: VoiceName.Aoede, 
    label: 'Aoede', 
    description: 'Sophisticated and clear (Female)', 
    gender: 'Female' 
  },
];

export const MAX_CHAR_COUNT = 1000000;
