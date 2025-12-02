import React, { useRef, useState, useEffect } from 'react';
import { AudioResult } from '../types';
import { convertToMp3 } from '../utils/audio';

interface AudioCardProps {
  result: AudioResult;
}

const AudioCard: React.FC<AudioCardProps> = ({ result }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [mp3Url, setMp3Url] = useState<string | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => {
      setProgress(audio.currentTime);
    };
    const updateDuration = () => {
      setDuration(audio.duration);
    };
    const onEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      audio.currentTime = 0;
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  // Generate MP3 link on mount if PCM data exists
  useEffect(() => {
    if (result.pcmData && !mp3Url) {
      // Small delay to not block UI immediately
      setTimeout(() => {
         const mp3Blob = convertToMp3(result.pcmData!, 24000, 1);
         setMp3Url(URL.createObjectURL(mp3Blob));
      }, 100);
    }
  }, [result.pcmData, mp3Url]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const time = Number(e.target.value);
    audioRef.current.currentTime = time;
    setProgress(time);
  };

  const isRecording = result.type === 'recording';
  const defaultExtension = isRecording ? 'webm' : 'wav';
  const defaultName = `gemini-vox-${result.id}.${defaultExtension}`;
  const mp3Name = `gemini-vox-${result.id}.mp3`;

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-sm transition-all hover:border-slate-600">
      <div className="p-5">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {isRecording ? (
                <span className="flex items-center gap-1 text-xs font-bold text-red-400 uppercase tracking-wider">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" /></svg>
                  Recording
                </span>
              ) : (
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                  {result.voice}
                </span>
              )}
              <span className="text-slate-500 text-xs">•</span>
              <span className="text-xs text-slate-500">
                {new Date(result.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p className={`text-sm line-clamp-2 ${isRecording ? 'text-slate-400 italic' : 'text-slate-300 italic border-l-2 border-slate-600 pl-3'}`}>
              "{result.text}"
            </p>
          </div>
        </div>

        {/* Audio Controls */}
        <div className="flex flex-col gap-3 bg-slate-900/50 p-3 rounded-lg">
          <div className="flex items-center gap-4">
            <button
              onClick={togglePlay}
              className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full text-white transition-colors ${isRecording ? 'bg-red-600 hover:bg-red-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}
            >
              {isPlaying ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg className="w-4 h-4 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            
            <div className="flex-grow flex flex-col justify-center gap-1">
               <input
                type="range"
                min="0"
                max={duration || 100}
                value={progress}
                onChange={handleSeek}
                className={`w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full ${isRecording ? '[&::-webkit-slider-thumb]:bg-red-400' : '[&::-webkit-slider-thumb]:bg-indigo-400'}`}
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>{formatTime(progress)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          </div>
          
          {/* Volume Slider */}
          <div className="flex items-center gap-2 px-1">
            <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
            <input 
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={handleVolumeChange}
              className="w-24 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-slate-400"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
           {/* MP3 Download Option (only if converted) */}
           {mp3Url && (
             <a
              href={mp3Url}
              download={mp3Name}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 hover:text-white rounded-lg transition-colors"
             >
               <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
               </svg>
               MP3
             </a>
           )}

          <a
            href={result.blobUrl}
            download={defaultName}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 hover:text-white rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {defaultExtension.toUpperCase()}
          </a>
        </div>
      </div>
      
      {/* Hidden Native Audio Element */}
      <audio ref={audioRef} src={result.blobUrl} preload="metadata" />
    </div>
  );
};

export default AudioCard;
