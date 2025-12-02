import React from 'react';
import { VideoResult } from '../types';

interface VideoCardProps {
  result: VideoResult;
}

const VideoCard: React.FC<VideoCardProps> = ({ result }) => {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-sm transition-all hover:border-slate-600">
      <div className="p-5">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">
                VEO 3.1
              </span>
              <span className="text-slate-500 text-xs">•</span>
              <span className="text-xs text-slate-500">
                {new Date(result.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p className="text-slate-300 text-sm line-clamp-2 italic border-l-2 border-purple-600 pl-3">
              "{result.prompt}"
            </p>
          </div>
        </div>

        <div className="rounded-lg overflow-hidden bg-black aspect-video mb-4 relative group">
           <video 
             src={result.videoUrl} 
             controls 
             className="w-full h-full object-cover"
             loop
             muted
             autoPlay
           />
        </div>

        <div className="flex justify-end">
          <a
            href={result.videoUrl}
            download={`gemini-video-${result.id}.mp4`}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 hover:text-white rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download MP4
          </a>
        </div>
      </div>
    </div>
  );
};

export default VideoCard;
