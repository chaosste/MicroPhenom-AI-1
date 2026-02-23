import React, { useState, useEffect, useRef } from 'react';
import { InterviewSession, Code, Annotation } from '../types';
import { Activity, Clock, Eye, Layers, MessageSquare, AlertCircle, Sparkles, Plus, X, Tag, FileText, Download, Play, Pause, AlertTriangle } from 'lucide-react';

interface Props {
  session: InterviewSession;
  onBack: () => void;
  onUpdateSession: (updatedSession: InterviewSession) => void;
}

const COLORS = [
  { label: 'Red', value: 'bg-red-200 text-red-900 border-red-300' },
  { label: 'Blue', value: 'bg-blue-200 text-blue-900 border-blue-300' },
  { label: 'Green', value: 'bg-green-200 text-green-900 border-green-300' },
  { label: 'Amber', value: 'bg-amber-200 text-amber-900 border-amber-300' },
  { label: 'Purple', value: 'bg-purple-200 text-purple-900 border-purple-300' },
  { label: 'Pink', value: 'bg-pink-200 text-pink-900 border-pink-300' },
  { label: 'Teal', value: 'bg-teal-200 text-teal-900 border-teal-300' },
];

export const AnalysisView: React.FC<Props> = ({ session, onBack, onUpdateSession }) => {
  const [activeTab, setActiveTab] = useState<'coding' | 'report'>('coding');
  const [newCodeLabel, setNewCodeLabel] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [selection, setSelection] = useState<{ segmentIndex: number; start: number; end: number; text: string } | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { analysis, codes, annotations } = session;

  useEffect(() => {
    if (session.audioBlob) {
      const url = URL.createObjectURL(session.audioBlob);
      setAudioUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [session.audioBlob]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('ended', onEnded);
    };
  }, [audioUrl]);

  if (!analysis) return <div>No analysis data available.</div>;

  // --- Actions ---

  const handleExport = () => {
    const exportData = {
      meta: {
        id: session.id,
        date: session.date,
        duration: session.duration,
      },
      analysis: session.analysis,
      codes: session.codes,
      annotations: session.annotations,
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `microphenom-session-${session.id}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  const seekTo = (timestampStr: string) => {
    if (!audioRef.current) return;
    const parts = timestampStr.split(':').map(Number);
    let seconds = 0;
    if (parts.length === 2) {
        seconds = parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
        seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    
    audioRef.current.currentTime = seconds;
    if (!isPlaying) {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // --- Coding Logic ---

  const handleCreateCode = () => {
    if (!newCodeLabel.trim()) return;
    const newCode: Code = {
      id: Date.now().toString(),
      label: newCodeLabel,
      color: selectedColor.value,
    };
    onUpdateSession({
      ...session,
      codes: [...codes, newCode],
    });
    setNewCodeLabel('');
  };

  const importCodebookSuggestions = () => {
    const suggestions = analysis.codebookSuggestions || [];
    if (suggestions.length === 0) return;
    const existing = new Set(codes.map(c => c.label.trim().toLowerCase()));
    const nextCodes: Code[] = [];
    suggestions.forEach((s) => {
      const label = s.label.trim();
      if (!label || existing.has(label.toLowerCase())) return;
      nextCodes.push({
        id: `${Date.now()}-${nextCodes.length}`,
        label,
        color: COLORS[(codes.length + nextCodes.length) % COLORS.length].value
      });
    });
    if (nextCodes.length === 0) return;
    onUpdateSession({
      ...session,
      codes: [...codes, ...nextCodes]
    });
  };

  const handleDeleteCode = (codeId: string) => {
    onUpdateSession({
      ...session,
      codes: codes.filter(c => c.id !== codeId),
      annotations: annotations.filter(a => a.codeId !== codeId),
    });
  };

  const handleTextSelection = (segmentIndex: number) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setSelection(null);
      return;
    }

    const range = sel.getRangeAt(0);
    const text = sel.toString();

    const container = document.getElementById(`segment-${segmentIndex}`);
    if (!container || !container.contains(range.commonAncestorContainer)) {
      return; 
    }

    // Simplified offset calculation relative to text content of the container
    // This is a robust-enough approximation for a prototype without complex DOM traversal libs
    const getOffset = (node: Node, offset: number): number => {
      let charCount = 0;
      let found = false;
      
      const walk = (n: Node) => {
        if (found) return;
        if (n === node) {
          charCount += offset;
          found = true;
          return;
        }
        if (n.nodeType === Node.TEXT_NODE) {
          charCount += n.textContent?.length || 0;
        } else {
          for (let child of Array.from(n.childNodes)) {
            walk(child);
            if (found) return;
          }
        }
      };
      
      walk(container);
      return charCount;
    };

    const start = getOffset(range.startContainer, range.startOffset);
    const end = getOffset(range.endContainer, range.endOffset);

    if (start < end) {
      setSelection({ segmentIndex, start, end, text });
    }
  };

  const applyCode = (codeId: string) => {
    if (!selection) return;
    const newAnnotation: Annotation = {
      id: Date.now().toString(),
      codeId,
      segmentIndex: selection.segmentIndex,
      startOffset: selection.start,
      endOffset: selection.end,
      text: selection.text
    };
    
    onUpdateSession({
      ...session,
      annotations: [...annotations, newAnnotation]
    });
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  const deleteAnnotation = (annoId: string) => {
    onUpdateSession({
      ...session,
      annotations: annotations.filter(a => a.id !== annoId)
    });
  };

  // --- Rendering Segments with Highlights ---

  const renderSegmentText = (segment: { text: string }, index: number) => {
    const segmentAnnos = annotations
      .filter(a => a.segmentIndex === index)
      .sort((a, b) => a.startOffset - b.startOffset);

    if (segmentAnnos.length === 0) return segment.text;

    const elements = [];
    let lastIndex = 0;

    segmentAnnos.forEach((anno, i) => {
      // Text before annotation
      if (anno.startOffset > lastIndex) {
        elements.push(
          <span key={`text-${i}`} className="text-slate-700">
            {segment.text.slice(lastIndex, anno.startOffset)}
          </span>
        );
      }

      // The annotation itself
      const code = codes.find(c => c.id === anno.codeId);
      elements.push(
        <span 
          key={`anno-${anno.id}`} 
          className={`${code?.color || 'bg-gray-200'} border-b-2 px-1 rounded-md mx-0.5 cursor-pointer hover:opacity-80 transition-all relative group box-decoration-clone`}
          title={`${code?.label}: ${anno.text}`}
        >
          {segment.text.slice(anno.startOffset, anno.endOffset)}
          {/* Delete Button on Hover */}
          <button 
            onClick={(e) => { e.stopPropagation(); deleteAnnotation(anno.id); }}
            className="absolute -top-3 -right-2 bg-slate-800 text-white rounded-full p-0.5 hidden group-hover:flex w-4 h-4 items-center justify-center text-[10px] shadow-sm z-10"
          >
            <X size={8} />
          </button>
        </span>
      );

      lastIndex = anno.endOffset;
    });

    // Text after last annotation
    if (lastIndex < segment.text.length) {
      elements.push(
        <span key="text-end" className="text-slate-700">
          {segment.text.slice(lastIndex)}
        </span>
      );
    }

    return elements;
  };

  // --- Sub-Components ---

  const renderCodingWorkspace = () => (
    <div className="flex flex-col md:flex-row h-full overflow-hidden">
      {/* Sidebar: Code Management */}
      <div className="w-full md:w-80 bg-white border-r border-slate-200 flex flex-col h-full z-20 shadow-sm">
        <div className="p-4 border-b border-slate-100 bg-slate-50">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <Tag size={18} /> Thematic Codes
          </h3>
        </div>
        
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Create Code */}
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3">
            <input
              type="text"
              value={newCodeLabel}
              onChange={(e) => setNewCodeLabel(e.target.value)}
              placeholder="New code name..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c.label}
                  onClick={() => setSelectedColor(c)}
                  className={`w-6 h-6 rounded-full ${c.value.split(' ')[0]} ${selectedColor.label === c.label ? 'ring-2 ring-offset-1 ring-slate-400' : ''}`}
                  title={c.label}
                />
              ))}
            </div>
            <button
              onClick={handleCreateCode}
              disabled={!newCodeLabel.trim()}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-2 rounded text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={16} /> Create Code
            </button>
          </div>

          {(analysis.codebookSuggestions?.length || 0) > 0 && (
            <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-700">AI Codebook Seeds</p>
                <button
                  onClick={importCodebookSuggestions}
                  className="text-xs px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  Import all
                </button>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {analysis.codebookSuggestions?.map((s, i) => (
                  <div key={`${s.label}-${i}`} className="text-xs border border-slate-100 rounded p-2 bg-slate-50">
                    <div className="font-semibold text-slate-800">{s.label}</div>
                    <div className="text-slate-600">{s.rationale}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Code List */}
          <div className="space-y-2">
            {codes.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-4">No codes created yet.</p>
            )}
            {codes.map(code => (
              <div key={code.id} className="flex items-center justify-between p-2 rounded hover:bg-slate-50 border border-transparent hover:border-slate-100 group">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${code.color.split(' ')[0]}`} />
                  <span className="text-sm font-medium text-slate-700">{code.label}</span>
                  <span className="text-xs text-slate-400 bg-slate-100 px-1.5 rounded-full">
                    {annotations.filter(a => a.codeId === code.id).length}
                  </span>
                </div>
                <button 
                  onClick={() => handleDeleteCode(code.id)}
                  className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main: Transcript */}
      <div className="flex-1 overflow-y-auto bg-slate-50 p-4 md:p-8 relative">
        <div className="max-w-3xl mx-auto space-y-6 pb-20">
          <div className="text-center mb-8">
             <h2 className="text-2xl font-bold text-slate-800">Transcript</h2>
             <p className="text-slate-500 text-sm">Highlight text to apply thematic codes. Click timestamps to play audio.</p>
          </div>

          {analysis.transcriptSegments?.map((segment, idx) => (
            <div key={idx} className="flex flex-col gap-1 group/segment">
              <div className="flex items-baseline gap-2">
                <span className={`text-xs font-bold uppercase tracking-wider ${segment.speaker.toLowerCase().includes('interviewer') ? 'text-indigo-600' : 'text-slate-600'}`}>
                  {segment.speaker}
                </span>
                {audioUrl ? (
                  <button 
                    onClick={() => seekTo(segment.timestamp)}
                    className="text-xs text-slate-400 font-mono hover:text-indigo-600 hover:underline cursor-pointer flex items-center gap-1"
                    title="Play from here"
                  >
                    {segment.timestamp} <Play size={8} className="inline" />
                  </button>
                ) : (
                  <span className="text-xs text-slate-400 font-mono">{segment.timestamp}</span>
                )}
              </div>
              <div 
                id={`segment-${idx}`}
                className={`p-4 rounded-xl text-lg leading-relaxed shadow-sm border transition-colors ${
                  segment.speaker.toLowerCase().includes('interviewer') 
                    ? 'bg-indigo-50 border-indigo-100 text-indigo-900 rounded-tl-none' 
                    : 'bg-white border-slate-200 text-slate-800 rounded-tr-none'
                }`}
                onMouseUp={() => handleTextSelection(idx)}
              >
                {renderSegmentText(segment, idx)}
              </div>
            </div>
          ))}
        </div>

        {/* Floating Code Menu */}
        {selection && codes.length > 0 && (
          <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-white shadow-xl rounded-full px-4 py-3 border border-slate-200 z-50 animate-in slide-in-from-bottom-4 fade-in duration-200 flex gap-2 items-center">
             <span className="text-xs font-bold text-slate-500 mr-2 border-r border-slate-200 pr-2">
               Apply Code:
             </span>
             {codes.map(code => (
               <button
                 key={code.id}
                 onClick={() => applyCode(code.id)}
                 className={`px-3 py-1 rounded-full text-xs font-medium hover:scale-105 transition-transform ${code.color.replace('border-', 'border ')}`}
               >
                 {code.label}
               </button>
             ))}
             <button 
               onClick={() => { setSelection(null); window.getSelection()?.removeAllRanges(); }}
               className="ml-2 w-6 h-6 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center"
             >
               <X size={12} />
             </button>
          </div>
        )}
      </div>
    </div>
  );

  const renderAnalysisReport = () => (
    <div className="p-6 md:p-8 overflow-auto h-full bg-slate-50">
        <div className="max-w-4xl mx-auto space-y-6">
        {/* Summary Card */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="text-amber-500" size={20} />
            <h3 className="font-semibold text-lg text-slate-800">Experience Abstract</h3>
          </div>
          <p className="text-slate-700 leading-relaxed">{analysis.summary}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Diachronic Structure (Timeline) */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 mb-6">
              <Clock className="text-blue-500" size={20} />
              <h3 className="font-semibold text-lg text-slate-800">Diachronic Structure</h3>
            </div>
            
            <div className="relative border-l-2 border-blue-100 ml-3 space-y-8 pb-2">
              {analysis.diachronicStructure.map((phase, idx) => (
                <div key={idx} className="relative pl-8">
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-blue-500 border-4 border-white shadow-sm" />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-1">
                      {phase.timestampEstimate || `Phase ${idx + 1}`}
                    </span>
                    <h4 className="font-semibold text-slate-900 mb-1">{phase.phase}</h4>
                    <p className="text-slate-600 text-sm">{phase.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Synchronic Structure (Modalities) */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 mb-6">
              <Layers className="text-purple-500" size={20} />
              <h3 className="font-semibold text-lg text-slate-800">Synchronic Structure</h3>
            </div>

            <div className="grid gap-4">
              {analysis.synchronicStructure.map((dim, idx) => (
                <div key={idx} className="p-4 rounded-lg bg-slate-50 border border-slate-100 flex gap-4 items-start hover:shadow-md transition-shadow">
                  <div className={`p-2 rounded-lg shrink-0 ${
                    dim.modality === 'Visual' ? 'bg-blue-100 text-blue-600' :
                    dim.modality === 'Auditory' ? 'bg-orange-100 text-orange-600' :
                    dim.modality === 'Kinesthetic' ? 'bg-rose-100 text-rose-600' :
                    'bg-slate-200 text-slate-600'
                  }`}>
                    {dim.modality === 'Visual' && <Eye size={18} />}
                    {dim.modality === 'Auditory' && <Activity size={18} />}
                    {dim.modality === 'Kinesthetic' && <Activity size={18} />}
                    {['Visual', 'Auditory', 'Kinesthetic'].indexOf(dim.modality) === -1 && <Layers size={18} />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-slate-900">{dim.modality}</h4>
                      {dim.submodality && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-500">
                          {dim.submodality}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600">{dim.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Satellites */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="text-slate-400" size={20} />
              <h3 className="font-semibold text-lg text-slate-800">Satellite Information</h3>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Context, judgments, and generalizations separated from the core experience.
            </p>
            <ul className="space-y-2">
              {analysis.satellites.map((sat, idx) => (
                <li key={idx} className="text-sm text-slate-600 bg-slate-50 px-3 py-2 rounded border border-slate-100 italic">
                  "{sat}"
                </li>
              ))}
            </ul>
          </div>

          {/* Suggestions */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="text-indigo-500" size={20} />
              <h3 className="font-semibold text-lg text-slate-800">Deepening Suggestions</h3>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Questions the AI suggests to further explore the experience if you were to continue.
            </p>
            <ul className="space-y-3">
              {analysis.suggestions.map((sug, idx) => (
                <li key={idx} className="flex gap-3 text-sm text-indigo-900 bg-indigo-50 px-4 py-3 rounded-lg">
                  <span className="font-bold text-indigo-400">{idx + 1}.</span>
                  {sug}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Hidden Audio Element */}
      {audioUrl && (
        <audio ref={audioRef} src={audioUrl} />
      )}

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row justify-between items-center shadow-sm z-30 gap-4 sm:gap-0">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Analysis & Coding</h2>
            <p className="text-sm text-slate-500">Session from {new Date(session.date).toLocaleDateString()}</p>
          </div>
          
          {/* Custom Audio Player Controls */}
          {audioUrl ? (
            <div className="hidden md:flex items-center gap-3 ml-6 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
               <button 
                 onClick={togglePlay}
                 className="w-8 h-8 flex items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
               >
                 {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
               </button>
               <span className="text-xs font-mono font-medium text-slate-600 min-w-[80px]">
                 {formatTime(currentTime)} / {formatTime(session.duration)}
               </span>
            </div>
          ) : (
            <div className="hidden md:flex items-center gap-2 ml-6 text-amber-500 text-xs px-2 py-1 bg-amber-50 rounded border border-amber-100">
               <AlertTriangle size={12} /> Audio unavailable (restored session)
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('coding')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'coding' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Coding
            </button>
            <button
              onClick={() => setActiveTab('report')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'report' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Report
            </button>
          </div>

          <button 
            onClick={handleExport}
            className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-indigo-600 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
            title="Export JSON"
          >
            <Download size={18} />
          </button>
          
          <div className="h-6 w-px bg-slate-200" />
          
          <button 
            onClick={onBack}
            className="text-sm font-medium text-slate-600 hover:text-slate-900 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Exit
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'coding' ? renderCodingWorkspace() : renderAnalysisReport()}
      </div>
    </div>
  );
};
