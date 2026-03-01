import React, { useState, useEffect, useRef } from 'react';
import { Mic, Clock, ChevronRight, Activity, Trash2, Search, FileText, Upload, MoreVertical, MessageSquare, Check, Globe, Sparkles, Key, Info, ExternalLink } from 'lucide-react';
import { AppState, InterviewSession, AnalysisResult, Settings } from './types';
import { InterviewRecorder } from './components/InterviewRecorder';
import { AnalysisView } from './components/AnalysisView';
import { LiveInterviewSession } from './components/LiveInterviewSession';
import { analyzeInterview, analyzeTextTranscript } from './services/geminiService';
import { analyzeTextTranscriptClaude } from './services/claudeService';

// The Descripteme — logo mark for MicroPhenom AI
// Kinship with NeuroPhenom's Epoche ( . ) but with the right bracket
// dashed and fading: the articulation of experience is always still
// in progress, the closure provisional.
const Descripteme: React.FC<{ size?: number; className?: string }> = ({ size = 28, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M 43 22 C 18 36, 18 64, 43 78" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round"/>
    <path d="M 57 22 C 82 36, 82 64, 57 78" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeDasharray="6 4" opacity="0.5"/>
    <circle cx="50" cy="50" r="4.5" fill="currentColor"/>
  </svg>
);

const App: React.FC = () => {
  const [view, setView] = useState<AppState>(AppState.HOME);
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    spelling: 'US',
    accent: 'US',
    interviewMode: 'BEGINNER',
    increasedSensitivityMode: false,
    apiProvider: 'gemini',
    geminiApiKey: '',
    claudeApiKey: '',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Load sessions from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('microphenomai_sessions') ?? localStorage.getItem('microphenom_sessions');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSessions(parsed);
      } catch (e) {
        console.error("Failed to load sessions", e);
      }
    }

    // Load saved settings
    const savedSettings = localStorage.getItem('microphenomai_settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings(prev => ({ ...prev, ...parsed }));
      } catch (e) {
        console.error("Failed to load settings", e);
      }
    }

    // Click outside to close menu
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Save sessions to localStorage whenever they change
  useEffect(() => {
    const sessionsToSave = sessions.map(({ audioBlob, ...rest }) => rest);
    localStorage.setItem('microphenomai_sessions', JSON.stringify(sessionsToSave));
  }, [sessions]);

  // Save settings to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('microphenomai_settings', JSON.stringify(settings));
  }, [settings]);

  const startNewInterview = () => {
    setView(AppState.RECORDING);
  };

  const startLiveInterview = () => {
    setView(AppState.LIVE_INTERVIEW);
  };

  const runAnalysis = async (text: string): Promise<AnalysisResult> => {
    if (settings.apiProvider === 'claude' && settings.claudeApiKey) {
      return analyzeTextTranscriptClaude(text, settings.claudeApiKey);
    }
    return analyzeTextTranscript(text);
  };

  const handleSaveInterview = async (audioBlob: Blob, duration: number) => {
    const newSession: InterviewSession = {
      id: Date.now().toString(),
      date: new Date().toLocaleString(),
      audioBlob,
      duration,
      isAnalyzing: true,
      codes: [],
      annotations: [],
    };

    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setView(AppState.HOME);

    try {
      // Audio analysis always uses Gemini (Claude doesn't process audio natively)
      const result = await analyzeInterview(audioBlob);
      setSessions((prev) =>
        prev.map(s => s.id === newSession.id ? { ...s, analysis: result, isAnalyzing: false } : s)
      );
    } catch (error) {
      console.error("Analysis failed", error);
      setSessions((prev) =>
        prev.map(s => s.id === newSession.id ? { ...s, isAnalyzing: false } : s)
      );
      alert("Failed to analyze interview. Check console and API Key.");
    }
  };

  const handleLiveSessionComplete = async (transcript: string, duration: number) => {
    const newSession: InterviewSession = {
      id: Date.now().toString(),
      date: new Date().toLocaleString(),
      duration,
      isAnalyzing: true,
      codes: [],
      annotations: [],
    };

    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setView(AppState.HOME);

    try {
      const result = await runAnalysis(transcript || "Audio Interview conducted via Conversational AI.");
      setSessions((prev) =>
        prev.map(s => s.id === newSession.id ? { ...s, analysis: result, isAnalyzing: false } : s)
      );
    } catch (error) {
      console.error("Live Analysis failed", error);
      setSessions((prev) =>
        prev.map(s => s.id === newSession.id ? { ...s, isAnalyzing: false } : s)
      );
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      const newSession: InterviewSession = {
        id: Date.now().toString(),
        date: new Date().toLocaleString(),
        duration: 0,
        isAnalyzing: true,
        codes: [],
        annotations: [],
      };

      setSessions((prev) => [newSession, ...prev]);
      setCurrentSessionId(newSession.id);

      try {
        const result = await runAnalysis(text);
        setSessions((prev) =>
          prev.map(s => s.id === newSession.id ? { ...s, analysis: result, isAnalyzing: false } : s)
        );
      } catch (error) {
        console.error("Text analysis failed", error);
        setSessions((prev) =>
          prev.map(s => s.id === newSession.id ? { ...s, isAnalyzing: false } : s)
        );
        alert("Failed to analyze transcript. Check console and API Key.");
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const viewAnalysis = (id: string) => {
    setCurrentSessionId(id);
    setView(AppState.ANALYSIS);
  };

  const updateSession = (updatedSession: InterviewSession) => {
    setSessions(prev => prev.map(s => s.id === updatedSession.id ? updatedSession : s));
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this session?")) {
      setSessions(prev => prev.filter(s => s.id !== id));
      if (currentSessionId === id) {
        setCurrentSessionId(null);
        setView(AppState.HOME);
      }
    }
  };

  const filteredSessions = sessions.filter(session => {
    const query = searchQuery.toLowerCase();
    const summary = session.analysis?.summary.toLowerCase() || '';
    const date = session.date.toLowerCase();
    return summary.includes(query) || date.includes(query);
  });

  const toggleSpelling = () => setSettings(p => ({ ...p, spelling: p.spelling === 'US' ? 'UK' : 'US' }));
  const toggleAccent = () => setSettings(p => ({ ...p, accent: p.accent === 'US' ? 'UK' : 'US' }));
  const toggleInterviewMode = () => setSettings(p => ({ ...p, interviewMode: p.interviewMode === 'BEGINNER' ? 'ADVANCED' : 'BEGINNER' }));
  const toggleSensitivityMode = () => setSettings(p => ({ ...p, increasedSensitivityMode: !p.increasedSensitivityMode }));
  const toggleApiProvider = () => setSettings(p => ({ ...p, apiProvider: p.apiProvider === 'gemini' ? 'claude' : 'gemini' }));

  const renderHome = () => (
    <div className="max-w-6xl mx-auto p-6 md:p-10 w-full">
      <header className="mb-12 text-left relative">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center justify-start gap-3 mb-4">
              <div className="bg-[#2A6B6B] p-2 rounded-lg">
                <Descripteme size={24} className="text-white" />
              </div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">MicroPhenom AI</h1>
            </div>
            <p className="text-slate-500 max-w-2xl leading-relaxed">
              A voice-enabled tool for conducting and {settings.spelling === 'UK' ? 'analysing' : 'analyzing'} <span className="font-semibold text-[#2A6B6B]">micro-phenomenology</span> interviews.
              Record sessions, automatically codify diachronic and synchronic structures, and explore the depths of lived experience.
            </p>
          </div>

          {/* Settings Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400"
            >
              <MoreVertical size={24} />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-12 w-72 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-50 animate-in fade-in slide-in-from-top-2">
                 <div className="px-4 py-2 border-b border-slate-50 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                   Settings
                 </div>

                 <button
                   onClick={toggleSpelling}
                   className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center justify-between group"
                 >
                   <div className="flex items-center gap-3 text-slate-700">
                     <FileText size={16} className="text-slate-400 group-hover:text-[#2A6B6B]" />
                     <span className="text-sm font-medium">Spelling</span>
                   </div>
                   <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded">{settings.spelling}</span>
                 </button>

                 <button
                   onClick={toggleAccent}
                   className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center justify-between group"
                 >
                   <div className="flex items-center gap-3 text-slate-700">
                     <Globe size={16} className="text-slate-400 group-hover:text-[#2A6B6B]" />
                     <span className="text-sm font-medium">AI Accent</span>
                   </div>
                   <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded">{settings.accent}</span>
                 </button>

                 <button
                   onClick={toggleInterviewMode}
                   className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center justify-between group"
                 >
                   <div className="flex items-center gap-3 text-slate-700">
                     <Sparkles size={16} className="text-slate-400 group-hover:text-[#2A6B6B]" />
                     <span className="text-sm font-medium">Mode</span>
                   </div>
                   <span className={`text-xs font-bold px-2 py-1 rounded ${settings.interviewMode === 'ADVANCED' ? 'bg-[#2A6B6B] text-white' : 'bg-slate-100 text-slate-600'}`}>
                     {settings.interviewMode}
                   </span>
                 </button>

                 <button
                   onClick={toggleSensitivityMode}
                   className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center justify-between group"
                 >
                   <div className="flex items-center gap-3 text-slate-700">
                     <Check size={16} className="text-slate-400 group-hover:text-[#2A6B6B]" />
                     <span className="text-sm font-medium">Increased Sensitivity</span>
                   </div>
                   <span className={`text-xs font-bold px-2 py-1 rounded ${settings.increasedSensitivityMode ? 'bg-[#2A6B6B] text-white' : 'bg-slate-100 text-slate-600'}`}>
                     {settings.increasedSensitivityMode ? 'ON' : 'OFF'}
                   </span>
                 </button>

                 <div className="px-4 py-2 border-t border-b border-slate-100 mt-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                   AI Provider
                 </div>

                 <button
                   onClick={toggleApiProvider}
                   className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center justify-between group"
                 >
                   <div className="flex items-center gap-3 text-slate-700">
                     <Key size={16} className="text-slate-400 group-hover:text-[#2A6B6B]" />
                     <span className="text-sm font-medium">Provider</span>
                   </div>
                   <span className="text-xs font-bold bg-[#2A6B6B] text-white px-2 py-1 rounded">
                     {settings.apiProvider === 'gemini' ? 'Gemini' : 'Claude'}
                   </span>
                 </button>

                 <div className="px-4 py-2">
                   <label className="text-xs font-medium text-slate-500 block mb-1.5">
                     {settings.apiProvider === 'gemini' ? 'Gemini' : 'Claude'} API Key
                   </label>
                   <input
                     type="password"
                     value={settings.apiProvider === 'gemini' ? settings.geminiApiKey : settings.claudeApiKey}
                     onChange={(e) => {
                       if (settings.apiProvider === 'gemini') {
                         setSettings(p => ({ ...p, geminiApiKey: e.target.value }));
                       } else {
                         setSettings(p => ({ ...p, claudeApiKey: e.target.value }));
                       }
                     }}
                     placeholder={settings.apiProvider === 'gemini' ? 'AIza...' : 'sk-ant-...'}
                     className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2A6B6B]/20 focus:border-[#2A6B6B]/30 transition-colors bg-slate-50"
                   />
                   <a
                     href={settings.apiProvider === 'gemini' ? 'https://aistudio.google.com/apikey' : 'https://console.anthropic.com/settings/keys'}
                     target="_blank"
                     rel="noopener noreferrer"
                     className="text-xs text-slate-400 hover:text-[#2A6B6B] transition-colors mt-1.5 inline-block"
                   >
                     Get your free API key &rarr;
                   </a>
                 </div>

                 <div className="border-t border-slate-100 mt-1">
                   <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                     About
                   </div>
                   <div className="px-4 pb-4">
                     <div className="flex items-center gap-2 mb-2">
                       <Info size={14} className="text-[#2A6B6B] flex-shrink-0" />
                       <span className="text-sm font-semibold text-slate-700">MicroPhenom-AI</span>
                     </div>
                     <p className="text-xs text-slate-500 leading-relaxed mb-3">
                       MicroPhenom-AI is an open-source research tool for conducting and analysing microphenomenological interviews — a rigorous first-person methodology for exploring the fine-grained texture of lived experience. Developed for researchers working across anthropology, social psychology, educational studies, and qualitative health research, it provides AI-assisted transcription, structural analysis, and experiential categorisation grounded in the pioneering work of Claire Petitmengin and Pierre Vermersch. The application carefully guides interviewers through the delicate evocative process of helping participants access pre-reflective, embodied moments — moving from &ldquo;what happened&rdquo; to &ldquo;how it was lived.&rdquo; Each session generates a detailed phenomenological report identifying diachronic structure, experiential categories, and satellite dimensions of experience. Whether you are mapping the micro-dynamics of a learning moment, a therapeutic encounter, or the textures of everyday decision-making, MicroPhenom-AI brings scholarly precision and genuine methodological care to the art of first-person inquiry.
                     </p>
                     <div className="flex flex-col gap-1.5">
                       <a
                         href="https://www.newpsychonaut.com"
                         target="_blank"
                         rel="noopener noreferrer"
                         className="text-xs text-[#2A6B6B] hover:text-[#1F5454] transition-colors flex items-center gap-1.5 font-medium"
                       >
                         <ExternalLink size={11} />
                         newpsychonaut.com
                       </a>
                       <a
                         href="https://www.instagram.com/newpsychonaut/"
                         target="_blank"
                         rel="noopener noreferrer"
                         className="text-xs text-[#2A6B6B] hover:text-[#1F5454] transition-colors flex items-center gap-1.5 font-medium"
                       >
                         <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                         @newpsychonaut
                       </a>
                     </div>
                   </div>
                 </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* Action Column */}
        <div className="col-span-1 md:col-span-4 space-y-4">

          {/* Conversational AI (TOP OPTION) */}
          <button
            onClick={startLiveInterview}
            className="w-full bg-[#2A6B6B] p-6 rounded-2xl shadow-lg shadow-slate-300 transition-all hover:scale-[1.02] group text-left flex flex-col justify-between h-48 relative overflow-hidden text-white border border-slate-800"
          >
             <div className="absolute right-0 top-0 w-32 h-32 bg-white/5 rounded-bl-full -mr-8 -mt-8 z-0"></div>
             <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full z-0" style={{background: 'radial-gradient(circle, rgba(196,128,108,0.15) 0%, transparent 70%)'}}></div>
             <div className="relative z-10">
                <div className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center mb-4">
                  <MessageSquare size={20} />
                </div>
                <h2 className="text-lg font-bold">Conversational AI</h2>
                <p className="text-slate-400 text-xs mt-1">
                   {settings.interviewMode === 'ADVANCED' ? 'Expert Mode' : 'Interactive Guide'} &middot; {settings.accent} Voice
                </p>
             </div>
             <div className="relative z-10 mt-4 flex items-center text-white font-semibold text-xs bg-white/10 w-fit px-3 py-1 rounded-full">
                Start Session <ChevronRight size={14} className="ml-1" />
             </div>
          </button>

          <div className="grid grid-cols-2 gap-4">
            {/* Record Standard */}
            <button
              onClick={startNewInterview}
              className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md hover:border-slate-300 transition-all group text-left h-40 flex flex-col justify-between"
            >
              <div>
                 <div className="w-8 h-8 rounded-full flex items-center justify-center mb-3" style={{backgroundColor: 'rgba(196,128,108,0.12)', color: '#C4806C'}}>
                   <Mic size={16} />
                 </div>
                 <h2 className="text-sm font-bold text-slate-900 leading-tight">Record Interview</h2>
              </div>
              <div className="flex items-center font-medium text-[10px] uppercase tracking-wide" style={{color: '#C4806C'}}>
                 Record <ChevronRight size={12} className="ml-1" />
              </div>
            </button>

            {/* Upload Transcript */}
            <button
              onClick={triggerFileUpload}
              className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md hover:border-slate-300 transition-all group text-left h-40 flex flex-col justify-between relative"
            >
              <div>
                 <div className="w-8 h-8 rounded-full flex items-center justify-center mb-3" style={{backgroundColor: 'rgba(94,126,160,0.12)', color: '#5E7EA0'}}>
                   <FileText size={16} />
                 </div>
                 <h2 className="text-sm font-bold text-slate-900 leading-tight">{settings.spelling === 'UK' ? 'Analyse' : 'Analyze'} Text</h2>
              </div>
              <div className="flex items-center font-medium text-[10px] uppercase tracking-wide" style={{color: '#5E7EA0'}}>
                 Upload <Upload size={12} className="ml-1" />
              </div>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".txt,.md"
                onChange={handleFileUpload}
              />
            </button>
          </div>
        </div>

        {/* Recent Sessions List */}
        <div className="col-span-1 md:col-span-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
            <div className="flex items-center gap-2">
               <h2 className="text-lg font-semibold text-slate-800">Recent Sessions</h2>
               <span className="text-xs font-medium bg-slate-100 text-slate-500 px-2 py-1 rounded-full">{filteredSessions.length}</span>
            </div>

            {/* Search Bar */}
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sessions..."
                className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2A6B6B]/10 focus:border-slate-300 transition-all shadow-sm"
              />
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden min-h-[400px]">
            {filteredSessions.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-10 text-slate-400 mt-10">
                <Activity size={48} className="mb-4 opacity-20" />
                <p>{sessions.length === 0 ? "No interviews yet." : "No matching sessions found."}</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {filteredSessions.map(session => (
                  <div key={session.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${session.isAnalyzing ? 'animate-pulse' : ''}`}
                        style={session.isAnalyzing
                          ? {backgroundColor: 'rgba(61,126,126,0.12)', color: '#3D7E7E'}
                          : {backgroundColor: 'rgba(94,126,160,0.12)', color: '#5E7EA0'}
                        }
                      >
                        {session.isAnalyzing ? <Activity size={18} /> : (session.audioBlob ? <Descripteme size={18} /> : <FileText size={18} />)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-medium text-slate-900 truncate pr-4">
                          {session.analysis ? (session.analysis.summary.length > 60 ? session.analysis.summary.slice(0, 60) + '...' : session.analysis.summary) : 'Processing Interview...'}
                        </h3>
                        <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
                          <span className="flex items-center gap-1"><Clock size={12} /> {new Date(session.date).toLocaleDateString()}</span>
                          <span>{session.duration > 0 ? `${Math.floor(session.duration / 60)}m ${session.duration % 60}s` : 'Text Upload'}</span>
                          {!session.audioBlob && session.duration > 0 && <span style={{color: '#B89858'}}>Audio Expired</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {session.isAnalyzing ? (
                        <span className="text-xs font-medium px-3 py-1 rounded-full" style={{backgroundColor: 'rgba(61,126,126,0.1)', color: '#3D7E7E'}}>
                          {settings.spelling === 'UK' ? 'Analysing...' : 'Analyzing...'}
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => viewAnalysis(session.id)}
                            className="px-4 py-2 text-sm font-medium text-[#2A6B6B] hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
                          >
                            View Analysis
                          </button>
                          <button
                            onClick={(e) => deleteSession(e, session.id)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete Session"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#E4F2EF] font-sans text-slate-800">
      {view === AppState.HOME && renderHome()}

      {view === AppState.RECORDING && (
        <div className="max-w-6xl mx-auto p-4 md:p-8 h-screen flex flex-col">
          <div className="mb-4">
            <button onClick={() => setView(AppState.HOME)} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-200 transition-colors w-fit">
              &larr; Back to Home
            </button>
          </div>
          <div className="flex-1 min-h-0 shadow-xl rounded-xl overflow-hidden ring-1 ring-slate-900/5">
            <InterviewRecorder
              onSave={handleSaveInterview}
              onCancel={() => setView(AppState.HOME)}
            />
          </div>
        </div>
      )}

      {view === AppState.LIVE_INTERVIEW && (
        <div className="h-screen w-full bg-slate-900">
          <LiveInterviewSession
            onComplete={handleLiveSessionComplete}
            onCancel={() => setView(AppState.HOME)}
            settings={settings}
          />
        </div>
      )}

      {view === AppState.ANALYSIS && currentSessionId && (
        <div className="h-screen flex flex-col bg-[#E4F2EF]">
            <AnalysisView
              session={sessions.find(s => s.id === currentSessionId)!}
              onBack={() => setView(AppState.HOME)}
              onUpdateSession={updateSession}
            />
        </div>
      )}
    </div>
  );
};

export default App;
