import React, { useState, useRef, useEffect } from 'react';

interface AudioRecorderProps {
  onRecordingComplete: (blobUrl: string, blob: Blob) => void;
  onGenerateVideo?: (blob: Blob) => void;
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({ onRecordingComplete, onGenerateVideo }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [maxDuration, setMaxDuration] = useState<number | ''>(''); 
  const [lastBlob, setLastBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Monitor recording time for auto-stop
  useEffect(() => {
    if (isRecording && maxDuration && recordingTime >= maxDuration) {
      stopRecording();
    }
  }, [recordingTime, isRecording, maxDuration]);

  const startRecording = async () => {
    try {
      setLastBlob(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setLastBlob(blob);
        onRecordingComplete(url, blob);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Could not access microphone. Please ensure permissions are granted.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-700 rounded-2xl bg-slate-800/30 transition-all hover:border-slate-600">
      <div className="mb-6 text-center">
         <div className={`text-4xl font-mono font-bold mb-2 transition-colors duration-300 ${isRecording ? 'text-red-500' : 'text-slate-400'}`}>
            {formatTime(recordingTime)}
         </div>
         <p className="text-sm text-slate-500 mb-2">
           {isRecording ? 'Recording in progress...' : 'Ready to record'}
         </p>
         
         {!isRecording && (
           <div className="flex items-center justify-center gap-2">
             <span className="text-xs text-slate-500">Max Duration (sec):</span>
             <input 
               type="number" 
               min="1"
               placeholder="Optional"
               value={maxDuration}
               onChange={(e) => setMaxDuration(e.target.value ? parseInt(e.target.value) : '')}
               className="w-20 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-center focus:ring-1 focus:ring-indigo-500 outline-none"
             />
           </div>
         )}
      </div>

      <div className="flex gap-4 items-center">
        {!isRecording ? (
          <button
            onClick={startRecording}
            className="group relative flex items-center justify-center w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 transition-all shadow-lg hover:shadow-red-500/30 hover:scale-105"
            title="Start Recording"
          >
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="group relative flex items-center justify-center w-16 h-16 rounded-full bg-slate-700 hover:bg-slate-600 transition-all shadow-lg hover:scale-105"
            title="Stop Recording"
          >
            <div className="absolute inset-0 rounded-full border-4 border-red-500/30 animate-ping"></div>
            <div className="relative w-6 h-6 bg-red-500 rounded-sm animate-pulse"></div>
          </button>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-2 items-center">
         <p className="text-slate-500 text-sm italic">
          {isRecording ? 'Recording your voice...' : 'Tap microphone to start'}
        </p>
        
        {lastBlob && !isRecording && onGenerateVideo && (
           <div className="mt-2 flex flex-col items-center gap-1">
             <button
               onClick={() => onGenerateVideo(lastBlob)}
               className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg transition-all"
             >
               <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
               </svg>
               Speech to Video
             </button>
             <span className="text-[10px] text-slate-500 opacity-70">
               *Requires paid project API key
             </span>
           </div>
        )}
      </div>
    </div>
  );
};

export default AudioRecorder;
