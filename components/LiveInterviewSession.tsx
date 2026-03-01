import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, type Blob } from '@google/genai';
import { Mic, MicOff, X, PhoneOff, Activity, Volume2 } from 'lucide-react';
import { Settings } from '../types';

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

  const transcriptRef = useRef<string[]>([]);
  const durationRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Audio Refs
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const sessionRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;

    const startSession = async () => {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        // Setup Audio Contexts
        const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 16000});
        const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
        const outputNode = outputAudioContext.createGain();
        outputNode.connect(outputAudioContext.destination);

        inputContextRef.current = inputAudioContext;
        outputContextRef.current = outputAudioContext;

        // Microphone Stream
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

        const voiceName = isUK ? 'Fenrir' : 'Kore';

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

        const spellingInstruction = settings.spelling === 'UK'
          ? 'Ensure all text output uses British spelling (e.g., "colour", "analyse", "centre").'
          : 'Ensure all text output uses American spelling.';

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

              scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                if (isMuted) return;
                const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                const pcmBlob = createBlob(inputData);

                sessionPromise.then((session) => {
                  session.sendRealtimeInput({ media: pcmBlob });
                });
              };

              source.connect(scriptProcessor);
              scriptProcessor.connect(inputAudioContext.destination);
            },
            onmessage: async (message: LiveServerMessage) => {
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

              const transcript = message.serverContent?.outputTranscription?.text;
              if (transcript) {
                 transcriptRef.current.push(`AI: ${transcript}`);
              }
            },
            onclose: () => {
              console.log("Session closed");
            },
            onerror: (err) => {
              console.error("Live API Error:", err);
              if (mounted) setStatus('error');
            }
          },
          config: {
            responseModalities: [Modality.AUDIO],
            outputAudioTranscription: {},
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName } },
            },
            systemInstruction: systemInstruction,
          }
        });

        sessionRef.current = sessionPromise;

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
      }
    };

    startSession();

    return () => {
      mounted = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (inputContextRef.current) inputContextRef.current.close();
      if (outputContextRef.current) outputContextRef.current.close();
      if (sessionRef.current) {
        sessionRef.current.then((s: any) => s.close && s.close());
      }
    };
  }, [settings]);

  const handleEndSession = async () => {
    const simulatedTranscript = transcriptRef.current.join("\n");
    const finalTranscript = simulatedTranscript.length > 0 ? simulatedTranscript : "Conversational Session (Audio)";
    onComplete(finalTranscript, durationRef.current);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Ambient palette colours for the dark session
  const ambientWarm = '#C4806C';   // Warm Coral
  const ambientCool = '#3D7E7E';   // Field Teal
  const ambientDeep = '#5E7EA0';   // Slate Blue

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white rounded-xl shadow-2xl overflow-hidden relative">
      {/* Background Ambience — warm and cool tones replacing indigo/purple */}
      <div className="absolute inset-0 z-0" style={{background: `linear-gradient(135deg, rgba(61,126,126,0.3) 0%, rgba(15,23,42,0.9) 50%, rgba(94,126,160,0.2) 100%)`}} />
      <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full mix-blend-multiply filter blur-3xl opacity-15 animate-pulse" style={{backgroundColor: ambientWarm}} />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full mix-blend-multiply filter blur-3xl opacity-15 animate-pulse" style={{backgroundColor: ambientCool, animationDelay: '1s'}} />

      <div className="relative z-10 flex flex-col h-full p-8">
        {/* Header */}
        <div className="flex justify-between items-start mb-12">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="flex h-3 w-3 relative">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${status === 'connected' ? 'bg-green-400' : ''}`} style={status !== 'connected' ? {backgroundColor: ambientCool} : undefined}></span>
                <span className={`relative inline-flex rounded-full h-3 w-3 ${status === 'connected' ? 'bg-green-500' : ''}`} style={status !== 'connected' ? {backgroundColor: ambientCool} : undefined}></span>
              </span>
              <span className="text-sm font-medium tracking-wider text-slate-400 uppercase">
                {status === 'connected' ? 'Live Connection' : 'Connecting...'}
              </span>
            </div>
            <h2 className="text-3xl font-light text-white">AI Interviewer</h2>
            <p className="text-slate-500 text-sm mt-1">
              Micro-phenomenology Session &middot; {settings.accent} Voice
            </p>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-500 hover:text-white">
            <X size={24} />
          </button>
        </div>

        {/* Central Visualizer */}
        <div className="flex-1 flex flex-col items-center justify-center relative">
          {/* Main Pulse Circle — gradient from the ambiguous palette */}
          <div className="relative">
             <div
               className="w-48 h-48 rounded-full flex items-center justify-center shadow-2xl transition-all duration-100 ease-out"
               style={{
                 background: `linear-gradient(135deg, ${ambientWarm}, ${ambientDeep})`,
                 boxShadow: `0 25px 60px rgba(61,126,126,0.2)`,
                 transform: `scale(${1 + volumeLevel / 200})`,
               }}
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
             <p className="text-white/30 text-sm">Speaking now...</p>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-12 flex justify-center items-center gap-8">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className={`p-4 rounded-full transition-all ${isMuted ? 'ring-1' : 'bg-white/10 text-white hover:bg-white/20'}`}
            style={isMuted ? {backgroundColor: 'rgba(196,128,108,0.15)', color: '#C4806C', borderColor: 'rgba(196,128,108,0.3)'} : undefined}
          >
            {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
          </button>

          <button
            onClick={handleEndSession}
            className="group flex items-center gap-3 px-8 py-4 bg-white text-[#2A6B6B] rounded-full font-medium transition-all shadow-lg hover:scale-105"
          >
            <PhoneOff size={20} className="group-hover:animate-bounce" />
            <span>End Session</span>
          </button>

          <div className="w-14 h-14 flex items-center justify-center rounded-full bg-white/5 text-slate-500">
             <Volume2 size={24} className={volumeLevel > 10 ? 'text-green-400' : ''} />
          </div>
        </div>
      </div>
    </div>
  );
};
