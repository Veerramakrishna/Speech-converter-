import React from 'react';
import { VoiceName } from '../types';
import { VOICES } from '../constants';

interface VoiceSelectorProps {
  selectedVoice: VoiceName;
  onSelect: (voice: VoiceName) => void;
  disabled?: boolean;
}

const VoiceSelector: React.FC<VoiceSelectorProps> = ({ selectedVoice, onSelect, disabled }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {VOICES.map((voice) => {
        const isSelected = selectedVoice === voice.id;
        return (
          <button
            key={voice.id}
            onClick={() => onSelect(voice.id)}
            disabled={disabled}
            type="button"
            className={`
              relative flex flex-col items-start p-4 rounded-xl border text-left transition-all duration-200
              ${isSelected 
                ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500' 
                : 'border-slate-700 bg-slate-800 hover:border-slate-600 hover:bg-slate-750'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            <div className="flex items-center justify-between w-full mb-1">
              <span className={`font-semibold ${isSelected ? 'text-indigo-400' : 'text-slate-200'}`}>
                {voice.label}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${isSelected ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-700 text-slate-400'}`}>
                {voice.gender}
              </span>
            </div>
            <p className="text-sm text-slate-400">
              {voice.description}
            </p>
          </button>
        );
      })}
    </div>
  );
};

export default VoiceSelector;
