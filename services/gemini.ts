import { GoogleGenAI, Modality } from "@google/genai";
import { VoiceName } from '../types';
import { base64ToUint8Array, addWavHeader } from '../utils/audio';

// Helper to get AI client. 
// For Veo (Video), we might need to re-instantiate if the key updates via the UI picker.
const getAiClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

const handleGeminiError = (error: any): never => {
  console.error("Gemini API Error:", error);
  const msg = error.message || error.toString();
  
  if (msg.includes("429") || msg.includes("quota")) {
    throw new Error("Quota exceeded. Please wait a moment or check your API limits.");
  }
  if (msg.includes("401") || msg.includes("403") || msg.includes("API key")) {
    throw new Error("API Key Error. Please ensure your key is valid and has permissions.");
  }
  if (msg.includes("404") || msg.includes("not found")) {
    throw new Error("Model or Resource not found. (404)");
  }
  if (msg.includes("503") || msg.includes("overloaded")) {
    throw new Error("Service overloaded. Please try again in a few seconds.");
  }

  throw new Error(`API Error: ${msg}`);
};

export const generateSpeech = async (text: string, voice: VoiceName): Promise<{ blobUrl: string, pcmData: Uint8Array }> => {
  const ai = getAiClient();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) {
      throw new Error("No audio data returned from Gemini API");
    }

    const pcmData = base64ToUint8Array(base64Audio);
    const wavBuffer = addWavHeader(pcmData, 24000, 1); 
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    
    return {
      blobUrl: URL.createObjectURL(blob),
      pcmData
    };
  } catch (error) {
    handleGeminiError(error);
  }
};

/**
 * Generates creative text content (scripts, stories, etc.)
 */
export const generateScript = async (topic: string, tone: string = 'neutral'): Promise<string> => {
  const ai = getAiClient();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [{ 
          text: `Write a short, engaging text-to-speech script about: "${topic}". 
                 Tone: ${tone}. 
                 Keep it concise (under 1000 characters) and optimized for spoken audio.
                 Do not include scene directions like [Intro Music], just the spoken text.`
        }]
      }
    });
    return response.text || "";
  } catch (error) {
    handleGeminiError(error);
  }
};

export const translateText = async (text: string, targetLanguage: string): Promise<string> => {
  const ai = getAiClient();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [{ 
          text: `Translate the following text to ${targetLanguage}. Return only the translated text, do not include any preamble or explanation.
          
          Text: "${text}"`
        }]
      }
    });
    return response.text || "";
  } catch (error) {
    handleGeminiError(error);
  }
};

export const extractTextFromDocument = async (file: File): Promise<string> => {
  const ai = getAiClient();
  if (file.type === 'text/plain') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string || '');
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  }

  try {
    const base64Data = await fileToBase64(file);
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: file.type,
              data: base64Data
            }
          },
          {
            text: "You are a text extraction tool. Extract all readable text from the provided document strictly verbatim. Do not summarize. Return only the extracted text."
          }
        ]
      }
    });

    return response.text || "";
  } catch (error) {
    handleGeminiError(error);
  }
};

/**
 * Explains a presentation (PPTX or PDF).
 * If PPTX, extracts text client-side first to ensure compatibility.
 */
export const explainPresentation = async (file: File): Promise<string> => {
  const ai = getAiClient();
  let contentPart: any;

  try {
    // Handle PPTX: Extract text via JSZip because Gemini API inlineData prefers PDF/Images
    if (file.name.endsWith('.pptx') || file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
      const pptxText = await extractTextFromPptx(file);
      contentPart = { text: `Here is the raw text content extracted from a PowerPoint presentation, organized by slide:\n\n${pptxText}` };
    } else {
      // Handle PDF: Use inline data
      const base64Data = await fileToBase64(file);
      contentPart = {
        inlineData: {
          mimeType: file.type,
          data: base64Data
        }
      };
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          contentPart,
          {
            text: "Analyze this presentation content. Create a natural, engaging audio script that explains the content of the slides. Narrate the story of the presentation as if you are a speaker presenting it. Do not just list bullet points. Separate sections clearly."
          }
        ]
      }
    });

    return response.text || "";
  } catch (error) {
    handleGeminiError(error);
  }
};

// Transcribe Audio (Speech to Text)
export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
  const ai = getAiClient();
  try {
    const base64Data = await blobToBase64(audioBlob);
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: audioBlob.type || 'audio/webm',
              data: base64Data
            }
          },
          {
             text: "Transcribe this audio exactly as spoken."
          }
        ]
      }
    });
    return response.text || "";
  } catch (error) {
    handleGeminiError(error);
  }
}

// Generate Video (Text to Video)
export const generateVideo = async (prompt: string): Promise<string> => {
  // IMPORTANT: Re-instantiate to catch the latest API key from the picker
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY }); 

  try {
    console.log("Starting video generation...");
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: prompt,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: '16:9'
      }
    });

    console.log("Video operation started:", operation);

    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5s
      operation = await ai.operations.getVideosOperation({operation: operation});
      console.log("Polling video status...");
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) throw new Error("No video URI returned");

    // Fetch the actual video bytes using the key
    const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
    const videoBlob = await response.blob();
    return URL.createObjectURL(videoBlob);

  } catch (error: any) {
    console.error("Video Generation Error:", error);
    
    // Check for 404 Not Found (API Key Issue) in various possible error structures
    const isNotFound = 
      error.message?.includes("Requested entity was not found") ||
      error.message?.includes("404") ||
      error.status === 404 ||
      error.code === 404 ||
      JSON.stringify(error).includes("Requested entity was not found");

    if (isNotFound) {
      throw new Error("API Key Error: Please re-select your paid API key.");
    }
    handleGeminiError(error);
  }
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
       const result = reader.result as string;
       const base64 = result.split(',')[1];
       resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// Client-side PPTX Text Extraction
const extractTextFromPptx = async (file: File): Promise<string> => {
  // @ts-ignore
  if (typeof JSZip === 'undefined') {
    throw new Error("JSZip not loaded. Cannot parse PPTX.");
  }
  // @ts-ignore
  const zip = await new JSZip().loadAsync(file);
  const slideFiles = Object.keys(zip.files).filter(name => name.startsWith('ppt/slides/slide') && name.endsWith('.xml'));
  
  // Sort slides numerically
  slideFiles.sort((a, b) => {
    const numA = parseInt(a.match(/slide(\d+)\.xml/)?.[1] || '0');
    const numB = parseInt(b.match(/slide(\d+)\.xml/)?.[1] || '0');
    return numA - numB;
  });

  let fullText = "";
  
  for (const filename of slideFiles) {
    const content = await zip.files[filename].async('string');
    // Simple regex to extract text from <a:t> tags (OpenXML format for text)
    const slideText = content.match(/<a:t>([^<]+)<\/a:t>/g)?.map((t: string) => t.replace(/<\/?a:t>/g, '')).join(' ') || "";
    if (slideText.trim()) {
      fullText += `[Slide ${filename.replace('ppt/slides/', '')}]: ${slideText}\n\n`;
    }
  }
  return fullText;
}
