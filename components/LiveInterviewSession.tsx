import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, type Blob } from '@google/genai';
import { Mic, MicOff, X, PhoneOff, Activity, Volume2 } from 'lucide-react';
import { Settings } from '../types';
import { connectAzureRealtimeSession } from '../services/azureRealtimeService';

interface Props {
  onComplete: (transcript: string, duration: number) => void;
  onCancel: () => void;
  settings: Settings;
}

// Audio Utils
function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  
  // The Gemini Live API expects raw PCM in the defined MIME type.
  let binary = '';
  const bytes = new Uint8Array(int16.buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  return {
    data: base64,
    mimeType: 'audio/pcm;rate=16000',
  };
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export const LiveInterviewSession: React.FC<Props> = ({ onComplete, onCancel, settings }) => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [diagnostics, setDiagnostics] = useState({
    key: 'unknown',
    mic: 'unknown',
    network: 'unknown',
    session: 'connecting',
    message: 'Starting connection checks...'
  });
  
  const transcriptRef = useRef<string[]>([]);
  const durationRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Audio Refs
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const sessionRef = useRef<any>(null); // To hold the active session
  const connectTimeoutRef = useRef<number | null>(null);
  const azureAiBufferRef = useRef<string>('');

  const classifyError = (error: unknown) => {
    const text = `${(error as any)?.message || error || ''}`.toLowerCase();
    if (text.includes('api key') || text.includes('key') || text.includes('auth') || text.includes('permission denied')) {
      return { key: 'fail', mic: diagnostics.mic, network: diagnostics.network, session: 'error', message: 'API key rejected or missing. Update key in settings.' };
    }
    if (text.includes('microphone') || text.includes('permission') || text.includes('notallowederror') || text.includes('notfounderror')) {
      return { key: diagnostics.key, mic: 'fail', network: diagnostics.network, session: 'error', message: 'Microphone access blocked or unavailable.' };
    }
    return { key: diagnostics.key, mic: diagnostics.mic, network: 'fail', session: 'error', message: 'Network/session link failed. Check connection and retry.' };
  };

  useEffect(() => {
    let mounted = true;
    
    const startSession = async () => {
      try {
        const provider = settings.voiceProvider || 'GEMINI';
        if (provider === 'AZURE_OPENAI_REALTIME') {
          setDiagnostics({
            key: 'checking',
            mic: 'checking',
            network: 'checking',
            session: 'connecting',
            message: 'Requesting Azure Realtime session...'
          });
          connectTimeoutRef.current = window.setTimeout(() => {
            if (mounted) setStatus('error');
            setDiagnostics((prev) => ({
              ...prev,
              network: 'fail',
              session: 'error',
              message: 'Azure Realtime connection timed out.'
            }));
          }, 15000);

          const isUK = settings.accent === 'UK';
          const isAdvanced = settings.interviewMode === 'ADVANCED';
          const isSensitive = settings.increasedSensitivityMode;
          const systemInstruction = `
            You are an expert Micro-phenomenology Interviewer.
            Use ${settings.spelling === 'UK' ? 'British' : 'American'} spelling.
            Interview mode: ${isAdvanced ? 'ADVANCED' : 'BEGINNER'}.
            Accent context: ${isUK ? 'UK' : 'US'}.
            ${isSensitive ? 'Use increased sensitivity pacing and gentler probes.' : 'Use standard ethical pacing.'}
            Focus strictly on concrete experiential process ("how"), not theory ("why").
          `;

          sessionRef.current = await connectAzureRealtimeSession(
            systemInstruction,
            settings.accent === 'UK' ? 'alloy' : 'verse',
            {
              onOpen: () => {
                if (connectTimeoutRef.current) {
                  window.clearTimeout(connectTimeoutRef.current);
                  connectTimeoutRef.current = null;
                }
                if (mounted) setStatus('connected');
                setIsActive(true);
                setDiagnostics({
                  key: 'ok',
                  mic: 'ok',
                  network: 'ok',
                  session: 'live',
                  message: 'Azure Realtime session connected.'
                });
              },
              onClose: () => {
                setIsActive(false);
                setDiagnostics((prev) => prev.session === 'error'
                  ? prev
                  : { ...prev, session: 'closed', message: 'Session closed.' });
              },
              onError: (message) => {
                if (mounted) setStatus('error');
                const lowered = message.toLowerCase();
                if (lowered.includes('configured') || lowered.includes('token') || lowered.includes('key')) {
                  setDiagnostics((prev) => ({ ...prev, key: 'fail', session: 'error', message }));
                } else if (lowered.includes('microphone') || lowered.includes('permission') || lowered.includes('notallowederror')) {
                  setDiagnostics((prev) => ({ ...prev, mic: 'fail', session: 'error', message }));
                } else {
                  setDiagnostics((prev) => ({ ...prev, network: 'fail', session: 'error', message }));
                }
              },
              onAiTranscriptDelta: (delta) => {
                azureAiBufferRef.current += delta;
              },
              onAiTurnDone: () => {
                const text = azureAiBufferRef.current.trim();
                if (text.length > 0) transcriptRef.current.push(`AI: ${text}`);
                azureAiBufferRef.current = '';
              },
              onUserTurn: (text) => {
                if (text.trim()) transcriptRef.current.push(`Interviewee: ${text.trim()}`);
              }
            }
          );

          timerRef.current = setInterval(() => {
            setDuration(d => {
              durationRef.current = d + 1;
              return d + 1;
            });
          }, 1000);
          return;
        }

        if (!settings.apiKey || !settings.apiKey.trim()) {
          throw new Error("Missing Gemini API key. Set it in Settings.");
        }
        setDiagnostics({
          key: 'ok',
          mic: 'checking',
          network: 'checking',
          session: 'connecting',
          message: 'API key found. Requesting microphone access...'
        });
        const ai = new GoogleGenAI({ apiKey: settings.apiKey });
        
        // Setup Audio Contexts
        const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 16000});
        const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
        const outputNode = outputAudioContext.createGain();
        outputNode.connect(outputAudioContext.destination);
        
        inputContextRef.current = inputAudioContext;
        outputContextRef.current = outputAudioContext;

        // Microphone Stream
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setDiagnostics({
          key: 'ok',
          mic: 'ok',
          network: 'checking',
          session: 'connecting',
          message: 'Microphone ready. Opening live model connection...'
        });
        const source = inputAudioContext.createMediaStreamSource(stream);
        const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
        
        // Visualizer logic (simple volume meter)
        const analyser = inputAudioContext.createAnalyser();
        analyser.fftSize = 32;
        source.connect(analyser);
        const pcmData = new Uint8Array(analyser.frequencyBinCount);
        
        const volumeInterval = setInterval(() => {
           analyser.getByteFrequencyData(pcmData);
           let sum = 0;
           for(let i=0; i<pcmData.length; i++) sum += pcmData[i];
           setVolumeLevel(sum / pcmData.length);
        }, 100);

        // --- Dynamic System Instruction Construction ---
        
        const isUK = settings.accent === 'UK';
        const isAdvanced = settings.interviewMode === 'ADVANCED';
        const isSensitive = settings.increasedSensitivityMode;
        
        // 1. Voice Selection
        const voiceName = isUK ? 'Fenrir' : 'Kore';

        // 2. Persona Instruction
        const personaInstruction = isUK 
          ? `*** PERSONA: BRITISH ACADEMIC ***
             - Tone: Measured, polite, slightly formal but warm. Think of a supportive Oxbridge tutor.
             - Vocabulary: Use Britishisms naturally (e.g., "whilst", "quite", "indeed", "perhaps", "keen", "have a go").
             - Phrasing: Use indirect, polite requests ("Might you describe...", "I wonder if you could recall...").
             - Backchanneling: Use "Mmm", "I see", "Quite", "Do go on".` 
          : `*** PERSONA: AMERICAN RESEARCHER ***
             - Tone: Enthusiastic, direct, collaborative, and engaging. Think of a skilled UX researcher.
             - Vocabulary: Use American standard English (e.g., "awesome", "got it", "totally", "jump in", "unpack that").
             - Phrasing: Use direct, active questions ("Tell me about...", "What happened next?", "Walk me through that").
             - Backchanneling: Use "That makes sense", "I'm with you", "Right", "Go on".`;

        // 3. Spelling Instruction
        const spellingInstruction = settings.spelling === 'UK' 
          ? 'Ensure all text output uses British spelling (e.g., "colour", "analyse", "centre").' 
          : 'Ensure all text output uses American spelling.';

        // 4. Mode Instruction & Protocol
        const modeInstruction = isAdvanced
          ? `MODE: ADVANCED (EXPERT PRACTITIONER).
             - Assume the user understands the method.
             - Move quickly to the "Evocation State" using minimal guidance ("Please evoke the moment").
             - Focus intensely on "Diachronic Cut" (slicing time) and "Synchronic Detail" (VAK modalities).
             - Use technical terms: "synchronic", "diachronic", "modality", "pre-reflective".
             - Be rigorous. If they offer content ("what") instead of process ("how"), interrupt gently to redirect.`
          : `MODE: BEGINNER (NAIVE SUBJECT).
             - Guide gently. Do NOT use technical jargon.
             - Spend time establishing the "Evocation State" (help them slow down, close eyes, return to the sensory memory).
             - Explain WHY we are slowing down if they get confused.
             - Validate their experience frequently ("That makes sense", "Take your time").
             - Use simple questions: "What do you see right now in your mind's eye?" instead of "Describe the visual modality".`;
        
        const sensitivityInstruction = isSensitive
          ? `*** ETHICAL CONTRACT: INCREASED SENSITIVITY MODE ***
             - Slow the pace and ask one probe at a time.
             - Reiterate that the participant can pause, skip, or stop.
             - Prefer gentler, non-leading prompts and shorter follow-up chains.
             - Offer grounding when intensity rises ("Take your time, feel your breath, we can pause").`
          : `*** ETHICAL CONTRACT: STANDARD MODE ***
             - Maintain consent-aware pacing and participant agency.`;

        const systemInstruction = `
          You are an expert Micro-phenomenology Interviewer (inspired by Vermersch/Petitmengin). 
          Your ONLY goal is to help the user evoke a specific past singular experience and describe it in fine-grained sensory detail.

          *** CORE PROTOCOL ***
          1. **Singularity**: We must explore ONE specific moment (seconds/minutes), not a general habit. Ask: "Can you select a specific time this happened?"
          2. **Evocation**: The user must relive the moment, not just remember it.
             - Instruct: "I invite you to close your eyes."
             - Instruct: "Take the time to let the moment come back."
             - Check: "Are you there? Do you see what you saw? Do you hear what you heard?"
          3. **The "How" (Process)**:
             - IGNORE the "Why" (causes) and the "What" (abstract content).
             - FOCUS on the "How" (unfolding of experience).
             - Question patterns: "When you do X, how do you go about it?", "What happens just before?", "Where do you feel that in your body?"
          4. **Sensory Modalities**:
             - Visual: "Is the image bright? Fuzzy? Moving? Where is it located in space?"
             - Auditory: "Is it an internal voice? A sound? Where does it come from?"
             - Kinesthetic: "What is the sensation in your chest? Is it tight? Warm?"

          *** FOLLOW-UP TECHNIQUES (CRITICAL) ***
          1. **Echoing**: ALWAYS reuse the user's exact words. If they say "I felt a buzz", ask "When you feel this 'buzz', does it have a direction?".
          2. **Temporal Micro-Slicing**: If they describe a step, ask for the micro-step before. "Just before you [action], was there a signal? A thought? A sensation?".
          3. **Unpacking "Empty" Words**: If they say "I understood", ask "How did this understanding appear to you? Was it a voice? An image? A feeling?".
          4. **Depth over Breadth**: Do not move to the next event until the current sensory experience is fully described (visuals, sounds, feelings).

          *** CONFIGURATION ***
          1. ${personaInstruction}
          2. ${spellingInstruction}
          3. ${modeInstruction}
          4. ${sensitivityInstruction}

          Start the session by briefly introducing yourself and asking the user if they have a specific moment in mind to explore.
        `;

        const sessionPromise = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-09-2025',
          callbacks: {
            onopen: () => {
              if (mounted) setStatus('connected');
              if (connectTimeoutRef.current) {
                window.clearTimeout(connectTimeoutRef.current);
                connectTimeoutRef.current = null;
              }
              setDiagnostics({
                key: 'ok',
                mic: 'ok',
                network: 'ok',
                session: 'live',
                message: 'Live session connected.'
              });
              
              // Stream audio from the microphone to the model.
              scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                if (isMuted) return; // Don't send data if muted
                const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                const pcmBlob = createBlob(inputData);
                
                // CRITICAL: Solely rely on sessionPromise resolves and then call `session.sendRealtimeInput`
                sessionPromise.then((session) => {
                  session.sendRealtimeInput({ media: pcmBlob });
                });
              };
              
              source.connect(scriptProcessor);
              scriptProcessor.connect(inputAudioContext.destination);
            },
            onmessage: async (message: LiveServerMessage) => {
              // Handle Audio Output
              const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
              if (base64Audio) {
                if (outputAudioContext.state === 'suspended') {
                   await outputAudioContext.resume();
                }
                
                nextStartTimeRef.current = Math.max(
                  nextStartTimeRef.current,
                  outputAudioContext.currentTime,
                );

                const audioBuffer = await decodeAudioData(
                  decode(base64Audio),
                  outputAudioContext,
                  24000,
                  1,
                );
                
                const source = outputAudioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outputNode);
                source.addEventListener('ended', () => {
                  sourcesRef.current.delete(source);
                });

                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                sourcesRef.current.add(source);
              }

              // Handle Transcription
              // We use outputAudioTranscription to get the model's text response correctly
              const transcript = message.serverContent?.outputTranscription?.text;
              if (transcript) {
                 transcriptRef.current.push(`AI: ${transcript}`);
              }
            },
            onclose: () => {
              console.log("Session closed");
              setDiagnostics((prev) => ({
                ...prev,
                session: 'closed',
                message: 'Session closed.'
              }));
            },
            onerror: (err) => {
              console.error("Live API Error:", err);
              if (mounted) setStatus('error');
              setDiagnostics(classifyError(err));
            }
          },
          config: {
            responseModalities: [Modality.AUDIO], // Must remain only AUDIO
            outputAudioTranscription: {}, // Enable transcription
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName } },
            },
            systemInstruction: systemInstruction,
          }
        });

        connectTimeoutRef.current = window.setTimeout(() => {
          setStatus('error');
          setDiagnostics((prev) => ({
            ...prev,
            network: 'fail',
            session: 'error',
            message: 'Connection timed out. Verify network and API key.'
          }));
        }, 15000);

        sessionRef.current = sessionPromise;

        // Start Duration Timer
        timerRef.current = setInterval(() => {
          setDuration(d => {
            durationRef.current = d + 1;
            return d + 1;
          });
        }, 1000);

        return () => {
           clearInterval(volumeInterval);
        };

      } catch (e) {
        console.error("Failed to init session", e);
        setStatus('error');
        setDiagnostics(classifyError(e));
      }
    };

    startSession();

    return () => {
      mounted = false;
      if (connectTimeoutRef.current) {
        window.clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
      if (timerRef.current) clearInterval(timerRef.current);
      if (inputContextRef.current) inputContextRef.current.close();
      if (outputContextRef.current) outputContextRef.current.close();
      if (sessionRef.current) {
        if (typeof sessionRef.current.then === 'function') {
          sessionRef.current.then((s: any) => s.close && s.close());
        } else if (typeof sessionRef.current.close === 'function') {
          sessionRef.current.close();
        }
      }
    };
  }, [settings]);

  const handleEndSession = async () => {
    if (sessionRef.current) {
      if (typeof sessionRef.current.then === 'function') {
        sessionRef.current.then((s: any) => s.close && s.close());
      } else if (typeof sessionRef.current.close === 'function') {
        sessionRef.current.close();
      }
    }
    const simulatedTranscript = transcriptRef.current.join("\n");
    const finalTranscript = simulatedTranscript.length > 0 ? simulatedTranscript : "Conversational Session (Audio)";
    onComplete(finalTranscript, durationRef.current);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white rounded-xl shadow-2xl overflow-hidden relative">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 to-slate-900 opacity-50 z-0" />
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-blue-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" style={{animationDelay: '1s'}} />

      <div className="relative z-10 flex flex-col h-full p-8">
        {/* Header */}
        <div className="flex justify-between items-start mb-12">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="flex h-3 w-3 relative">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${status === 'connected' ? 'bg-green-400' : 'bg-amber-400'}`}></span>
                <span className={`relative inline-flex rounded-full h-3 w-3 ${status === 'connected' ? 'bg-green-500' : 'bg-amber-500'}`}></span>
              </span>
              <span className="text-sm font-medium tracking-wider text-slate-300 uppercase">
                {status === 'connected' ? 'Live Connection' : 'Connecting...'}
              </span>
            </div>
            <h2 className="text-3xl font-light text-white">AI Interviewer</h2>
            <p className="text-slate-400 text-sm mt-1">
              Micro-phenomenology Session • {settings.accent} Voice
            </p>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white">
            <X size={24} />
          </button>
        </div>

        <div className="mb-8 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
            <span>Key: <strong>{String(diagnostics.key).toUpperCase()}</strong></span>
            <span>Mic: <strong>{String(diagnostics.mic).toUpperCase()}</strong></span>
            <span>Network: <strong>{String(diagnostics.network).toUpperCase()}</strong></span>
            <span>Session: <strong>{String(diagnostics.session).toUpperCase()}</strong></span>
          </div>
          <p className="mt-2 text-xs text-slate-300">{diagnostics.message}</p>
        </div>

        {/* Central Visualizer */}
        <div className="flex-1 flex flex-col items-center justify-center relative">
          {/* Main Pulse Circle */}
          <div className="relative">
             <div 
               className="w-48 h-48 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shadow-2xl shadow-indigo-500/30 transition-all duration-100 ease-out"
               style={{ transform: `scale(${1 + volumeLevel / 200})` }}
             >
                <Activity size={64} className="text-white opacity-80" />
             </div>
             {/* Ripples */}
             <div className="absolute inset-0 border border-white/10 rounded-full animate-ping" style={{animationDuration: '3s'}} />
             <div className="absolute inset-0 border border-white/5 rounded-full animate-ping" style={{animationDuration: '4s', animationDelay: '0.5s'}} />
          </div>
          
          <div className="mt-12 text-center space-y-2">
             <div className="text-5xl font-mono font-light tracking-widest text-white/90">
               {formatTime(duration)}
             </div>
             <p className="text-white/40 text-sm">Speaking now...</p>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-12 flex justify-center items-center gap-8">
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className={`p-4 rounded-full transition-all ${isMuted ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/50' : 'bg-white/10 text-white hover:bg-white/20'}`}
          >
            {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
          </button>

          <button 
            onClick={handleEndSession}
            className="group flex items-center gap-3 px-8 py-4 bg-rose-600 hover:bg-rose-500 text-white rounded-full font-medium transition-all shadow-lg shadow-rose-900/20 hover:scale-105"
          >
            <PhoneOff size={20} className="group-hover:animate-bounce" />
            <span>End Session</span>
          </button>
          
          <div className="w-14 h-14 flex items-center justify-center rounded-full bg-white/5 text-slate-400">
             <Volume2 size={24} className={volumeLevel > 10 ? 'text-green-400' : ''} />
          </div>
        </div>
      </div>
    </div>
  );
};
