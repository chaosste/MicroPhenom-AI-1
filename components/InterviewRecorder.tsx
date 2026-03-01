import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Save, RefreshCw, HelpCircle, Info, Sparkles } from 'lucide-react';
import { MicrophoneVisualizer } from './MicrophoneVisualizer';
import { getWelcomeMessage } from '../services/geminiService';

interface Props {
  onSave: (blob: Blob, duration: number) => void;
  onCancel: () => void;
}

export const InterviewRecorder: React.FC<Props> = ({ onSave, onCancel }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [showGuide, setShowGuide] = useState(true);
  const [welcomeMessage, setWelcomeMessage] = useState<string>('');
  const [isLoadingMessage, setIsLoadingMessage] = useState(true);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchWelcome = async () => {
      try {
        const msg = await getWelcomeMessage();
        if (mounted) setWelcomeMessage(msg);
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setIsLoadingMessage(false);
      }
    };
    fetchWelcome();
    return () => { mounted = false; };
  }, []);

  const startRecording = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setStream(mediaStream);

      const mediaRecorder = new MediaRecorder(mediaStream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.start();
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Microphone access denied. Please allow microphone permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/wav' });
        if (stream) stream.getTracks().forEach(track => track.stop());
        setStream(null);
        onSave(blob, duration);
      };
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-slate-800">Conduct Interview</h2>
          <p className="text-slate-400 text-sm">Focus on evoking the specific past experience.</p>
        </div>
        <div className="flex items-center gap-2 font-mono text-xl font-bold px-4 py-2 rounded-lg" style={{backgroundColor: isRecording ? 'rgba(196,128,108,0.08)' : 'rgba(148,163,184,0.15)', color: isRecording ? '#C4806C' : '#64748b'}}>
          {isRecording && <div className="w-3 h-3 rounded-full animate-pulse" style={{backgroundColor: '#C4806C'}} />}
          {formatTime(duration)}
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row">
        {/* Main Recording Area */}
        <div className="flex-1 p-8 flex flex-col items-center justify-center space-y-8 bg-[#E4F2EF]">

          {/* AI Welcome Message */}
          <div className="max-w-xl w-full">
            {isLoadingMessage ? (
              <div className="flex flex-col items-center justify-center p-6 text-slate-400 gap-2 h-32">
                 <Sparkles size={20} className="animate-spin" style={{color: '#3D7E7E'}} />
                 <span className="text-sm">Connecting to AI Guide...</span>
              </div>
            ) : (
               <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative mx-auto transform transition-all animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#2A6B6B] text-white px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm">
                    <Sparkles size={12} /> AI Guide
                  </div>
                  <p className="text-slate-600 font-medium leading-relaxed italic text-center">
                    &ldquo;{welcomeMessage}&rdquo;
                  </p>
               </div>
            )}
          </div>

          <MicrophoneVisualizer stream={stream} isRecording={isRecording} />

          <div className="flex gap-6">
            {!isRecording ? (
              <button
                onClick={startRecording}
                className="flex flex-col items-center gap-2 group"
              >
                <div className="w-20 h-20 rounded-full bg-[#2A6B6B] text-white flex items-center justify-center shadow-lg group-hover:scale-105 transition-all">
                  <Mic size={32} />
                </div>
                <span className="font-medium text-slate-600">Start Recording</span>
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="flex flex-col items-center gap-2 group"
              >
                <div className="w-20 h-20 rounded-full bg-[#1F5454] text-white flex items-center justify-center shadow-lg group-hover:scale-105 transition-all">
                  <Square size={28} fill="currentColor" />
                </div>
                <span className="font-medium text-slate-600">Stop & Analyse</span>
              </button>
            )}
          </div>

          <div className="text-center max-w-md text-slate-400 text-sm">
            The session will be analysed by AI immediately after stopping.
            Ensure you have provided the API Key in Settings.
          </div>
        </div>

        {/* Guidance Panel */}
        <div className={`w-full md:w-80 bg-white border-l border-slate-100 flex flex-col transition-all duration-300 ${showGuide ? 'translate-x-0' : 'translate-x-full hidden md:flex'}`}>
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <HelpCircle size={18} className="text-slate-600" />
            <span className="font-semibold text-slate-800">Interviewer Guide</span>
          </div>

          <div className="p-4 overflow-y-auto space-y-6 flex-1">
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">The Goal</h3>
              <p className="text-sm text-slate-600">
                Help the interviewee <span className="font-bold text-[#2A6B6B]">evoke</span> a specific past moment. Move from &ldquo;what&rdquo; (content) to &ldquo;how&rdquo; (experience).
              </p>
            </section>

            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Golden Rules</h3>
              <ul className="space-y-3 text-sm text-slate-700">
                <li className="flex gap-2">
                  <span style={{color: '#5E9E78'}} className="font-bold">&#10003;</span>
                  <span>Ask <strong>HOW</strong> (process, feeling, sensory).</span>
                </li>
                <li className="flex gap-2">
                  <span style={{color: '#C4806C'}} className="font-bold">&#10007;</span>
                  <span>Avoid <strong>WHY</strong> (causes, justifications).</span>
                </li>
                <li className="flex gap-2">
                  <span style={{color: '#5E9E78'}} className="font-bold">&#10003;</span>
                  <span>Use their exact words (echoing).</span>
                </li>
              </ul>
            </section>

            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Useful Prompts</h3>
              <div className="space-y-2">
                <div className="bg-slate-50 p-3 rounded text-sm text-slate-600 border border-slate-200">
                  &ldquo;When you say [word], what do you see/hear/feel?&rdquo;
                </div>
                <div className="bg-slate-50 p-3 rounded text-sm text-slate-600 border border-slate-200">
                  &ldquo;Take your time to let the moment come back...&rdquo;
                </div>
                <div className="bg-slate-50 p-3 rounded text-sm text-slate-600 border border-slate-200">
                  &ldquo;Where is that sensation located?&rdquo;
                </div>
                <div className="bg-slate-50 p-3 rounded text-sm text-slate-600 border border-slate-200">
                  &ldquo;Is it a moving image or a still one?&rdquo;
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};
