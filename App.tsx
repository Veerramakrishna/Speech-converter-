import React, { useState, useRef, useEffect } from 'react';
import { generateSpeech, extractTextFromDocument, generateVideo, transcribeAudio, explainPresentation, generateScript, translateText } from './services/gemini';
import { VoiceName, AudioResult, VideoResult, VoicePreset, Language } from './types';
import { MAX_CHAR_COUNT } from './constants';
import { mixAudio, generateSynthesizedTrack } from './utils/audio';
import VoiceSelector from './components/VoiceSelector';
import AudioCard from './components/AudioCard';
import VideoCard from './components/VideoCard';
import AudioRecorder from './components/AudioRecorder';

type Tab = 'tts' | 'batch' | 'record' | 'video_results';

const LANGUAGES: Language[] = ['English', 'Hindi', 'Kannada', 'Telugu', 'Tamil', 'Malayalam'];

const LANGUAGE_CODES: Record<Language, string> = {
  'English': 'en-US',
  'Hindi': 'hi-IN',
  'Kannada': 'kn-IN',
  'Telugu': 'te-IN',
  'Tamil': 'ta-IN',
  'Malayalam': 'ml-IN'
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('tts');
  const [text, setText] = useState('');
  const [batchText, setBatchText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<VoiceName>(VoiceName.Kore);
  
  // Translation State
  const [targetLanguage, setTargetLanguage] = useState<Language>('English');

  // Processing States
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [progress, setProgress] = useState(0); // 0-100

  // Writer State
  const [showWriter, setShowWriter] = useState(false);
  const [writerTopic, setWriterTopic] = useState('');
  const [writerTone, setWriterTone] = useState('Neutral');

  // Voice Input State
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Music State
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicVolume, setMusicVolume] = useState<number>(0.2);
  const [libraryLoading, setLibraryLoading] = useState(false);

  // Preset State
  const [presets, setPresets] = useState<VoicePreset[]>([]);
  const [newPresetName, setNewPresetName] = useState('');

  const [audioResults, setAudioResults] = useState<AudioResult[]>([]);
  const [videoResults, setVideoResults] = useState<VideoResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pptxInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);

  // Load Presets on Mount
  useEffect(() => {
    const saved = localStorage.getItem('gemini-vox-presets');
    if (saved) {
      try {
        setPresets(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load presets", e);
      }
    }
  }, []);

  // Clean up speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const savePreset = () => {
    if (!newPresetName.trim()) return;
    const newPreset: VoicePreset = {
      id: Date.now().toString(),
      name: newPresetName.trim(),
      voice: selectedVoice,
      musicVolume,
    };
    const updated = [...presets, newPreset];
    setPresets(updated);
    localStorage.setItem('gemini-vox-presets', JSON.stringify(updated));
    setNewPresetName('');
  };

  const loadPreset = (presetId: string) => {
    const preset = presets.find(p => p.id === presetId);
    if (preset) {
      setSelectedVoice(preset.voice);
      setMusicVolume(preset.musicVolume);
    }
  };

  // --- Handlers ---

  const handleVoiceInput = () => {
    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = LANGUAGE_CODES[targetLanguage]; // Use selected language for better accuracy
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }

      if (finalTranscript) {
        const targetSetter = activeTab === 'batch' ? setBatchText : setText;
        targetSetter(prev => {
          const separator = prev.length > 0 && !prev.endsWith('\n') ? ' ' : '';
          return prev + separator + finalTranscript;
        });
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
      if (event.error !== 'no-speech') {
        setError(`Voice input error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleTranslate = async () => {
    const currentText = activeTab === 'batch' ? batchText : text;
    if (!currentText.trim()) return;
    
    setIsGenerating(true);
    setStatusMessage(`Translating to ${targetLanguage}...`);
    setError(null);

    try {
      const translated = await translateText(currentText, targetLanguage);
      if (activeTab === 'batch') {
        setBatchText(translated);
      } else {
        setText(translated);
      }
    } catch (err: any) {
      setError(err.message || "Translation failed.");
    } finally {
      setIsGenerating(false);
      setStatusMessage('');
    }
  };

  const processTTS = async (prompt: string, type: 'tts' | 'batch' = 'tts') => {
    // 1. Generate Speech
    const result = await generateSpeech(prompt, selectedVoice);
    let finalBlobUrl = result.blobUrl;
    let finalPcm = result.pcmData;

    // 2. Mix Music if exists
    if (musicFile) {
      try {
        const speechBlob = await fetch(result.blobUrl).then(r => r.blob());
        const mixedBlob = await mixAudio(speechBlob, musicFile, musicVolume);
        finalBlobUrl = URL.createObjectURL(mixedBlob);
        finalPcm = undefined; 
      } catch (mixErr) {
        console.error("Mixing failed, falling back to speech only", mixErr);
      }
    }

    return {
      id: Date.now().toString() + Math.random().toString().slice(2,6),
      text: prompt,
      voice: selectedVoice,
      blobUrl: finalBlobUrl,
      timestamp: Date.now(),
      type: type,
      pcmData: finalPcm
    };
  };

  const handleGenerateTTS = async () => {
    if (!text.trim()) return;
    
    setIsGenerating(true);
    setStatusMessage('Generating Speech...');
    setError(null);
    setProgress(0);

    try {
      const newResult = await processTTS(text.trim(), 'tts');
      setAudioResults((prev) => [newResult, ...prev]);
    } catch (err: any) {
      setError(err.message || "Failed to generate speech.");
      console.error(err);
    } finally {
      setIsGenerating(false);
      setStatusMessage('');
      setProgress(0);
    }
  };

  const handleBatchGenerate = async () => {
    if (!batchText.trim()) return;
    const lines = batchText.split('\n').filter(l => l.trim().length > 0);
    if (lines.length === 0) return;

    setIsGenerating(true);
    setError(null);
    setProgress(0);

    let completed = 0;
    
    for (const line of lines) {
      setStatusMessage(`Processing ${completed + 1} of ${lines.length}`);
      try {
        const newResult = await processTTS(line.trim(), 'batch');
        setAudioResults((prev) => [newResult, ...prev]);
        completed++;
      } catch (err) {
        console.error("Batch line failed", line, err);
      }
      setProgress(Math.round((completed / lines.length) * 100));
      // Small delay to be nice to API
      await new Promise(r => setTimeout(r, 500));
    }

    setIsGenerating(false);
    setStatusMessage('');
    setProgress(0);
  };

  const handleRecordingComplete = (blobUrl: string, blob: Blob) => {
    const newResult: AudioResult = {
      id: Date.now().toString(),
      text: "Audio Recording",
      voice: "Microphone",
      blobUrl,
      timestamp: Date.now(),
      type: 'recording',
    };
    setAudioResults((prev) => [newResult, ...prev]);
  };

  const handleSpeechToVideo = async (audioBlob: Blob) => {
    setIsGenerating(true);
    setStatusMessage('Transcribing audio...');
    setError(null);

    try {
      const transcript = await transcribeAudio(audioBlob);
      if (!transcript) throw new Error("Could not transcribe audio.");
      
      setStatusMessage('Generating Video from speech...');
      
      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      if (!hasKey) await (window as any).aistudio.openSelectKey();

      const videoUrl = await generateVideo(transcript);
      
      const newVideo: VideoResult = {
        id: Date.now().toString(),
        prompt: transcript,
        videoUrl,
        timestamp: Date.now()
      };
      setVideoResults((prev) => [newVideo, ...prev]);
      setActiveTab('video_results');

    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("API Key Error")) {
         await (window as any).aistudio.openSelectKey();
         setError("The selected API key was not valid for Veo. Please select a valid paid project key and try again.");
      } else {
         setError(err.message || "Failed to convert speech to video.");
      }
    } finally {
      setIsGenerating(false);
      setStatusMessage('');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    setIsExtracting(true);
    setError(null);
    setStatusMessage('Reading Document...');

    try {
      const extractedText = await extractTextFromDocument(file);
      const targetSetter = activeTab === 'batch' ? setBatchText : setText;
      targetSetter(prev => {
        const newText = prev + (prev ? '\n\n' : '') + extractedText;
        return newText.slice(0, MAX_CHAR_COUNT);
      });
    } catch (err: any) {
      setError(err.message || "Failed to extract text. Please try a different file.");
    } finally {
      setIsExtracting(false);
      setStatusMessage('');
    }
  };

  const handlePptxSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (pptxInputRef.current) pptxInputRef.current.value = '';

    setIsExtracting(true);
    setError(null);
    setStatusMessage('Analyzing Presentation...');

    try {
      const explanation = await explainPresentation(file);
      const targetSetter = activeTab === 'batch' ? setBatchText : setText;
      targetSetter(prev => {
        const newText = prev + (prev ? '\n\n--- Presentation Explanation ---\n\n' : '') + explanation;
        return newText.slice(0, MAX_CHAR_COUNT);
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to explain presentation.");
    } finally {
      setIsExtracting(false);
      setStatusMessage('');
    }
  };

  const handleMusicLibrarySelect = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (!val) return;
    
    if (val === 'upload') {
      musicInputRef.current?.click();
      // Reset select to default
      e.target.value = "";
      return;
    }

    setLibraryLoading(true);
    try {
       const blob = await generateSynthesizedTrack(val as any);
       const file = new File([blob], `${val}-music.wav`, { type: 'audio/wav' });
       setMusicFile(file);
    } catch(err) {
       console.error("Failed to load library track", err);
       setError("Could not load library track.");
    } finally {
       setLibraryLoading(false);
       // Reset select
       e.target.value = "";
    }
  };

  const handleMusicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setMusicFile(file);
  };

  const handleGenerateScript = async () => {
    if (!writerTopic.trim()) return;
    setIsGenerating(true);
    setStatusMessage("Writing Script...");
    setError(null);
    try {
      const script = await generateScript(writerTopic, writerTone);
      setText(script);
      setShowWriter(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
      setStatusMessage("");
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 selection:bg-indigo-500/30">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
              Gemini Vox
            </h1>
          </div>
          <div className="flex gap-2">
             <div className="hidden sm:block text-xs font-mono text-slate-500 border border-slate-800 rounded px-2 py-1">
               gemini-2.5-flash
             </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Controls */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Tab Switcher */}
            <div className="flex p-1 bg-slate-800 rounded-xl border border-slate-700 overflow-x-auto">
              <button
                onClick={() => setActiveTab('tts')}
                className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                  activeTab === 'tts' 
                    ? 'bg-indigo-600 text-white shadow-md' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Text to Speech
              </button>
              <button
                onClick={() => setActiveTab('batch')}
                className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                  activeTab === 'batch' 
                    ? 'bg-indigo-600 text-white shadow-md' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Batch
              </button>
              <button
                onClick={() => setActiveTab('record')}
                className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                  activeTab === 'record' 
                    ? 'bg-indigo-600 text-white shadow-md' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Recorder
              </button>
            </div>

            {/* Content Area */}
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6 space-y-6 min-h-[400px]">
              
              {/* --- PRESETS SECTION (Common to TTS and Batch) --- */}
              {(activeTab === 'tts' || activeTab === 'batch') && (
                <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 flex flex-wrap items-center justify-between gap-3">
                   <div className="flex items-center gap-2 flex-grow">
                     <label className="text-xs text-slate-500 font-bold uppercase tracking-wider">Presets:</label>
                     <select 
                       onChange={(e) => loadPreset(e.target.value)}
                       className="bg-slate-900 border border-slate-700 text-sm rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-300"
                       defaultValue=""
                     >
                       <option value="" disabled>Load Preset...</option>
                       {presets.map(p => (
                         <option key={p.id} value={p.id}>{p.name}</option>
                       ))}
                     </select>
                   </div>
                   <div className="flex items-center gap-2">
                     <input 
                       type="text" 
                       placeholder="New preset name" 
                       value={newPresetName}
                       onChange={e => setNewPresetName(e.target.value)}
                       className="bg-slate-900 border border-slate-700 text-sm rounded-lg px-2 py-1.5 w-32 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-white"
                     />
                     <button 
                       onClick={savePreset}
                       disabled={!newPresetName.trim()}
                       className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                     >
                       Save
                     </button>
                   </div>
                </div>
              )}

              {/* --- TTS & BATCH COMMON INPUT --- */}
              {(activeTab === 'tts' || activeTab === 'batch') && (
                <>
                  <div>
                    <div className="flex flex-col gap-2 mb-2">
                      <div className="flex justify-between items-end">
                        <label className="block text-sm font-medium text-slate-300">
                          {activeTab === 'batch' ? 'Batch Prompts (One per line)' : 'Text Prompt'}
                        </label>
                        
                        <div className="flex items-center gap-2">
                           {/* Content Gen Toggle (Only TTS) */}
                           {activeTab === 'tts' && (
                             <button 
                               onClick={() => setShowWriter(!showWriter)}
                               className="flex items-center gap-1.5 text-xs font-medium text-pink-400 hover:text-pink-300 transition-colors bg-pink-500/10 px-2.5 py-1.5 rounded-lg border border-pink-500/20"
                             >
                               <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                               </svg>
                               Magic Writer
                             </button>
                           )}

                           <input 
                              type="file" 
                              accept=".txt,.pdf"
                              ref={fileInputRef}
                              className="hidden"
                              onChange={handleFileSelect}
                           />
                           <input 
                              type="file" 
                              accept=".pptx,.pdf" 
                              ref={pptxInputRef}
                              className="hidden"
                              onChange={handlePptxSelect}
                           />
                           <button 
                             onClick={() => pptxInputRef.current?.click()}
                             disabled={isExtracting || isGenerating}
                             className="flex items-center gap-1.5 text-xs font-medium text-purple-400 hover:text-purple-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-purple-500/10 px-2.5 py-1.5 rounded-lg border border-purple-500/20"
                           >
                             {isExtracting && statusMessage.includes('Analyzing') ? 'Analyzing...' : 'Explain PPTX'}
                           </button>
                           <button 
                             onClick={() => fileInputRef.current?.click()}
                             disabled={isExtracting || isGenerating}
                             className="flex items-center gap-1.5 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-indigo-500/10 px-2.5 py-1.5 rounded-lg border border-indigo-500/20"
                           >
                             {isExtracting && !statusMessage.includes('Analyzing') ? 'Reading...' : 'Import Doc'}
                           </button>
                        </div>
                      </div>
                      
                      {/* Translation Controls */}
                      <div className="flex flex-wrap items-center gap-2 bg-slate-800/50 p-2 rounded-lg border border-slate-700">
                         <span className="text-xs text-slate-500 font-medium px-1">Language:</span>
                         <select 
                           value={targetLanguage}
                           onChange={(e) => setTargetLanguage(e.target.value as Language)}
                           className="bg-slate-900 border border-slate-700 text-xs rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-300"
                         >
                           {LANGUAGES.map(lang => (
                             <option key={lang} value={lang}>{lang}</option>
                           ))}
                         </select>
                         
                         {/* Microphone Button - Linked to Language Selection */}
                         <button
                            onClick={handleVoiceInput}
                            title={`Dictate in ${targetLanguage}`}
                            className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors border ${isListening ? 'bg-red-500/20 text-red-400 border-red-500/40 animate-pulse' : 'bg-slate-700 hover:bg-slate-600 text-slate-300 border-transparent'}`}
                         >
                           {isListening ? (
                              <>
                                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"/>
                                Listening...
                              </>
                           ) : (
                              <>
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                </svg>
                                Dictate
                              </>
                           )}
                         </button>

                         <button 
                           onClick={handleTranslate}
                           disabled={isGenerating}
                           className="ml-auto text-xs bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 px-3 py-1 rounded transition-colors disabled:opacity-50"
                         >
                           Translate To {targetLanguage}
                         </button>
                      </div>
                    </div>

                    {/* Magic Writer Panel */}
                    {showWriter && (
                      <div className="mb-4 bg-slate-900 border border-pink-500/20 rounded-xl p-3 animate-in fade-in slide-in-from-top-2">
                        <div className="flex gap-2 mb-2">
                          <input 
                             type="text" 
                             placeholder="What should I write about?" 
                             value={writerTopic}
                             onChange={(e) => setWriterTopic(e.target.value)}
                             className="flex-grow bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-pink-500 outline-none"
                          />
                          <select 
                            value={writerTone} 
                            onChange={(e) => setWriterTone(e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none"
                          >
                             <option>Neutral</option>
                             <option>Happy</option>
                             <option>Professional</option>
                             <option>Dramatic</option>
                             <option>Funny</option>
                          </select>
                        </div>
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setShowWriter(false)} className="text-xs text-slate-500 hover:text-slate-300">Cancel</button>
                          <button 
                            onClick={handleGenerateScript}
                            disabled={!writerTopic.trim() || isGenerating}
                            className="bg-pink-600 hover:bg-pink-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
                          >
                            Generate Script
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="relative">
                      <textarea
                        value={activeTab === 'batch' ? batchText : text}
                        onChange={(e) => activeTab === 'batch' ? setBatchText(e.target.value) : setText(e.target.value)}
                        disabled={isGenerating || isExtracting}
                        placeholder={isListening ? "Listening..." : (activeTab === 'batch' ? "Line 1: Hello world\nLine 2: Another prompt..." : "Enter text to speak...")}
                        className={`w-full min-h-[160px] bg-slate-900 border border-slate-700 rounded-xl p-4 text-base focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all resize-none placeholder:text-slate-600 disabled:opacity-50 font-mono text-sm leading-relaxed ${isListening ? 'ring-2 ring-red-500/50 border-red-500/50' : ''}`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-3">
                      Select Voice
                    </label>
                    <VoiceSelector 
                      selectedVoice={selectedVoice} 
                      onSelect={setSelectedVoice} 
                      disabled={isGenerating || isExtracting}
                    />
                  </div>

                  {/* BACKGROUND MUSIC */}
                  <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Background Music
                    </label>
                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                       <input 
                         type="file" 
                         accept="audio/*" 
                         ref={musicInputRef}
                         onChange={handleMusicUpload}
                         className="hidden"
                       />
                       
                       {/* Music Library Dropdown */}
                       <div className="relative">
                         <select 
                           onChange={handleMusicLibrarySelect}
                           disabled={libraryLoading}
                           className={`appearance-none pl-9 pr-8 py-2 rounded-lg text-sm border transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500 ${musicFile ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                           value=""
                         >
                            <option value="" disabled>{libraryLoading ? 'Loading...' : (musicFile ? musicFile.name : 'Select Music...')}</option>
                            <optgroup label="Library">
                               <option value="ambient">Ambient Drone</option>
                               <option value="lofi">Lo-Fi Chill</option>
                               <option value="upbeat">Upbeat Arp</option>
                            </optgroup>
                            <optgroup label="Custom">
                               <option value="upload">Upload File...</option>
                            </optgroup>
                         </select>
                         <div className="absolute left-2.5 top-2.5 pointer-events-none text-current opacity-70">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                            </svg>
                         </div>
                       </div>

                       <div className="flex items-center gap-2 flex-grow w-full sm:w-auto">
                         <span className="text-xs text-slate-500 w-12">Volume</span>
                         <input 
                           type="range" 
                           min="0" max="1" step="0.05" 
                           value={musicVolume}
                           onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                           className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-400"
                         />
                         <span className="text-xs text-slate-500 w-8">{Math.round(musicVolume * 100)}%</span>
                       </div>
                       {musicFile && (
                         <button onClick={() => setMusicFile(null)} className="text-xs text-red-400 hover:text-red-300">
                           Clear
                         </button>
                       )}
                    </div>
                  </div>

                  {/* Progress Bar (Visible when active) */}
                  {(isGenerating || isExtracting) && (
                    <div className="w-full bg-slate-700 rounded-full h-1.5 mt-2 overflow-hidden">
                      <div 
                        className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300 ease-out relative overflow-hidden" 
                        style={{ width: `${progress > 0 ? progress : 100}%` }}
                      >
                         {/* Animated Shimmer for indeterminate state */}
                         {progress === 0 && (
                            <div className="absolute inset-0 bg-white/20 animate-[shimmer_1s_infinite] skew-x-12"></div>
                         )}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={activeTab === 'batch' ? handleBatchGenerate : handleGenerateTTS}
                    disabled={(activeTab === 'batch' ? !batchText.trim() : !text.trim()) || isGenerating || isExtracting}
                    className={`
                      w-full py-3.5 px-6 rounded-xl font-semibold text-white shadow-lg shadow-indigo-500/20
                      flex items-center justify-center gap-2 transition-all transform active:scale-[0.98]
                      ${(activeTab === 'batch' ? !batchText.trim() : !text.trim()) || isGenerating || isExtracting
                        ? 'bg-slate-700 cursor-not-allowed text-slate-400 shadow-none' 
                        : 'bg-indigo-600 hover:bg-indigo-500 hover:shadow-indigo-500/30'
                      }
                    `}
                  >
                    {isGenerating || isExtracting ? (
                       <span className="flex items-center gap-2">
                         <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                         </svg>
                         {statusMessage}
                       </span>
                    ) : (activeTab === 'batch' ? 'Generate Batch' : 'Generate Speech')}
                  </button>
                </>
              )}

              {/* --- RECORDER TAB --- */}
              {activeTab === 'record' && (
                <div className="h-full flex flex-col justify-center">
                   <div className="text-center mb-4">
                     <h3 className="text-lg font-medium text-slate-200">Voice Recorder</h3>
                     <p className="text-sm text-slate-500">Record audio to download or convert to video.</p>
                   </div>
                   <AudioRecorder 
                      onRecordingComplete={handleRecordingComplete} 
                      onGenerateVideo={handleSpeechToVideo}
                   />
                   {isGenerating && (
                     <div className="mt-4 text-center text-sm text-purple-400 animate-pulse">
                       {statusMessage}
                     </div>
                   )}
                </div>
              )}

              {error && (
                <div className="bg-red-900/20 border border-red-500/20 rounded-lg p-3 flex items-start gap-3 text-red-400 text-sm animate-in fade-in slide-in-from-top-1">
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <span className="font-bold">Error:</span> {error}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Results */}
          <div className="lg:col-span-5">
            <div className="sticky top-24 space-y-4">
              <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                History & Results
              </h2>
              
              <div className="space-y-4 min-h-[300px]">
                {/* Mix of Video and Audio results could be sorted by timestamp, but simpler to stack for now */}
                
                {/* Display Videos First */}
                {videoResults.map((result) => (
                  <VideoCard key={result.id} result={result} />
                ))}

                {/* Display Audio */}
                {audioResults.map((result) => (
                  <AudioCard key={result.id} result={result} />
                ))}

                {audioResults.length === 0 && videoResults.length === 0 && (
                  <div className="h-64 rounded-2xl border-2 border-dashed border-slate-800 flex flex-col items-center justify-center text-slate-600 p-8 text-center">
                    <svg className="w-12 h-12 mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <p className="font-medium">No content yet</p>
                    <p className="text-sm mt-1">Create audio or video to see results.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
};

export default App;
