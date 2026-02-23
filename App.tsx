import React, { useState, useEffect, useRef } from 'react';
import { Mic, Brain, Clock, ChevronRight, Activity, Trash2, Search, FileText, Upload, MoreVertical, MessageSquare, Check, Globe, Sparkles } from 'lucide-react';
import { AppState, InterviewSession, AnalysisResult, Settings } from './types';
import { InterviewRecorder } from './components/InterviewRecorder';
import { AnalysisView } from './components/AnalysisView';
import { LiveInterviewSession } from './components/LiveInterviewSession';
import { analyzeInterview, analyzeTextTranscript } from './services/geminiService';

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
    increasedSensitivityMode: false
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Load sessions from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('microphenom_sessions');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSessions(parsed);
      } catch (e) {
        console.error("Failed to load sessions", e);
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
    localStorage.setItem('microphenom_sessions', JSON.stringify(sessionsToSave));
  }, [sessions]);

  const startNewInterview = () => {
    setView(AppState.RECORDING);
  };

  const startLiveInterview = () => {
    setView(AppState.LIVE_INTERVIEW);
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
     // Create a session entry for the live interview
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

    // If we have a transcript (or placeholder), run text analysis
    // Note: Live API doesn't give perfect full transcript yet without inputAudioTranscription enabled. 
    // We treat this as a "Text Transcript" analysis flow.
    try {
      // We pass the partial transcript or a prompt to "infer" structure if audio isn't available
      const result = await analyzeTextTranscript(transcript || "Audio Interview conducted via Conversational AI.");
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
        const result = await analyzeTextTranscript(text);
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

  const renderHome = () => (
    <div className="max-w-6xl mx-auto p-6 md:p-10 w-full">
      <header className="mb-12 text-left relative">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center justify-start gap-3 mb-4">
              <div className="bg-indigo-600 p-2 rounded-lg">
                <Brain className="text-white" size={24} />
              </div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">MicroPhenom AI</h1>
            </div>
            <p className="text-slate-600 max-w-2xl leading-relaxed">
              A voice-enabled tool for conducting and {settings.spelling === 'UK' ? 'analysing' : 'analyzing'} <span className="font-semibold text-indigo-600">micro-phenomenology</span> interviews. 
              Record sessions, automatically codify diachronic and synchronic structures, and explore the depths of lived experience.
            </p>
          </div>
          
          {/* Settings Menu */}
          <div className="relative" ref={menuRef}>
            <button 
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
            >
              <MoreVertical size={24} />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-12 w-64 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-50 animate-in fade-in slide-in-from-top-2">
                 <div className="px-4 py-2 border-b border-slate-50 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                   Settings
                 </div>
                 
                 <button 
                   onClick={toggleSpelling}
                   className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center justify-between group"
                 >
                   <div className="flex items-center gap-3 text-slate-700">
                     <FileText size={16} className="text-slate-400 group-hover:text-indigo-500" />
                     <span className="text-sm font-medium">Spelling</span>
                   </div>
                   <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded">{settings.spelling}</span>
                 </button>

                 <button 
                   onClick={toggleAccent}
                   className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center justify-between group"
                 >
                   <div className="flex items-center gap-3 text-slate-700">
                     <Globe size={16} className="text-slate-400 group-hover:text-indigo-500" />
                     <span className="text-sm font-medium">AI Accent</span>
                   </div>
                   <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded">{settings.accent}</span>
                 </button>

                 <button 
                   onClick={toggleInterviewMode}
                   className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center justify-between group"
                 >
                   <div className="flex items-center gap-3 text-slate-700">
                     <Sparkles size={16} className="text-slate-400 group-hover:text-indigo-500" />
                     <span className="text-sm font-medium">Mode</span>
                   </div>
                   <span className={`text-xs font-bold px-2 py-1 rounded ${settings.interviewMode === 'ADVANCED' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                     {settings.interviewMode}
                   </span>
                 </button>

                 <button
                   onClick={toggleSensitivityMode}
                   className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center justify-between group"
                 >
                   <div className="flex items-center gap-3 text-slate-700">
                     <Check size={16} className="text-slate-400 group-hover:text-indigo-500" />
                     <span className="text-sm font-medium">Increased Sensitivity</span>
                   </div>
                   <span className={`text-xs font-bold px-2 py-1 rounded ${settings.increasedSensitivityMode ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                     {settings.increasedSensitivityMode ? 'ON' : 'OFF'}
                   </span>
                 </button>
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
            className="w-full bg-gradient-to-br from-indigo-600 to-purple-700 p-6 rounded-2xl shadow-lg shadow-indigo-200 transition-all hover:scale-[1.02] group text-left flex flex-col justify-between h-48 relative overflow-hidden text-white border border-indigo-500/50"
          >
             <div className="absolute right-0 top-0 w-32 h-32 bg-white/10 rounded-bl-full -mr-8 -mt-8 z-0"></div>
             <div className="relative z-10">
                <div className="w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center mb-4 backdrop-blur-sm">
                  <MessageSquare size={20} />
                </div>
                <h2 className="text-lg font-bold">Conversational AI</h2>
                <p className="text-indigo-100 text-xs mt-1">
                   {settings.interviewMode === 'ADVANCED' ? 'Expert Mode' : 'Interactive Guide'} • {settings.accent} Voice
                </p>
             </div>
             <div className="relative z-10 mt-4 flex items-center text-white font-semibold text-xs bg-white/20 w-fit px-3 py-1 rounded-full backdrop-blur-sm">
                Start Session <ChevronRight size={14} className="ml-1" />
             </div>
          </button>

          <div className="grid grid-cols-2 gap-4">
            {/* Record Standard */}
            <button 
              onClick={startNewInterview}
              className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md hover:border-rose-200 transition-all group text-left h-40 flex flex-col justify-between"
            >
              <div>
                 <div className="w-8 h-8 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mb-3">
                   <Mic size={16} />
                 </div>
                 <h2 className="text-sm font-bold text-slate-900 leading-tight">Record Interview</h2>
              </div>
              <div className="flex items-center text-rose-600 font-medium text-[10px] uppercase tracking-wide">
                 Record <ChevronRight size={12} className="ml-1" />
              </div>
            </button>

            {/* Upload Transcript */}
            <button 
              onClick={triggerFileUpload}
              className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md hover:border-blue-200 transition-all group text-left h-40 flex flex-col justify-between relative"
            >
              <div>
                 <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center mb-3">
                   <FileText size={16} />
                 </div>
                 <h2 className="text-sm font-bold text-slate-900 leading-tight">{settings.spelling === 'UK' ? 'Analyse' : 'Analyze'} Text</h2>
              </div>
              <div className="flex items-center text-blue-600 font-medium text-[10px] uppercase tracking-wide">
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
                className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-sm"
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
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${session.isAnalyzing ? 'bg-amber-50 text-amber-500 animate-pulse' : 'bg-blue-50 text-blue-500'}`}>
                        {session.isAnalyzing ? <Activity size={18} /> : (session.audioBlob ? <Brain size={18} /> : <FileText size={18} />)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-medium text-slate-900 truncate pr-4">
                          {session.analysis ? (session.analysis.summary.length > 60 ? session.analysis.summary.slice(0, 60) + '...' : session.analysis.summary) : 'Processing Interview...'}
                        </h3>
                        <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
                          <span className="flex items-center gap-1"><Clock size={12} /> {new Date(session.date).toLocaleDateString()}</span>
                          <span>{session.duration > 0 ? `${Math.floor(session.duration / 60)}m ${session.duration % 60}s` : 'Text Upload'}</span>
                          {!session.audioBlob && session.duration > 0 && <span className="text-amber-500">Audio Expired</span>}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {session.isAnalyzing ? (
                        <span className="text-xs font-medium text-amber-600 bg-amber-50 px-3 py-1 rounded-full">Analyzing...</span>
                      ) : (
                        <>
                          <button 
                            onClick={() => viewAnalysis(session.id)}
                            className="px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors whitespace-nowrap"
                          >
                            View Analysis
                          </button>
                          <button
                            onClick={(e) => deleteSession(e, session.id)}
                            className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
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
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
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
        <div className="h-screen flex flex-col bg-slate-50">
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
