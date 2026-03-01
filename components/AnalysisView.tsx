import React, { useState, useEffect, useRef } from 'react';
import { InterviewSession, Code, Annotation } from '../types';
import { Activity, Clock, Eye, Layers, MessageSquare, AlertCircle, Sparkles, Plus, X, Tag, FileText, Download, Play, Pause, AlertTriangle } from 'lucide-react';

interface Props {
  session: InterviewSession;
  onBack: () => void;
  onUpdateSession: (updatedSession: InterviewSession) => void;
}

// "Fieldwork Tones" — 10 professional complementary colours
// designed to sit naturally against duck egg blue, evoking
// the warmth and precision of qualitative research.
const PALETTE = [
  { label: 'Field Teal',     hex: '#3D7E7E', meaning: 'somatic grounding' },
  { label: 'Warm Coral',     hex: '#C4806C', meaning: 'embodied warmth' },
  { label: 'Sage',           hex: '#5E9E78', meaning: 'organic emergence' },
  { label: 'Dusty Rose',     hex: '#B07080', meaning: 'affective resonance' },
  { label: 'Honey Amber',    hex: '#B89858', meaning: 'attentional luminosity' },
  { label: 'Slate Blue',     hex: '#5E7EA0', meaning: 'perceptual depth' },
  { label: 'Terracotta',     hex: '#A87060', meaning: 'temporal memory' },
  { label: 'Lavender Grey',  hex: '#7878A0', meaning: 'pre-reflective gestalt' },
  { label: 'Olive Sage',     hex: '#7E8E5E', meaning: 'liminal threshold' },
  { label: 'Muted Plum',     hex: '#886878', meaning: 'contemplative edge' },
];

// Utility: hex to rgba
const hexToRgba = (hex: string, alpha: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const AnalysisView: React.FC<Props> = ({ session, onBack, onUpdateSession }) => {
  const [activeTab, setActiveTab] = useState<'coding' | 'report'>('coding');
  const [newCodeLabel, setNewCodeLabel] = useState('');
  const [selectedColorIdx, setSelectedColorIdx] = useState(0);
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

  const getCodeHex = (code: Code): string => {
    // Try to find the hex from the stored color string; fall back to palette
    const match = PALETTE.find(p => p.hex === code.color);
    if (match) return match.hex;
    // Backwards compat: if color is a Tailwind class, extract from palette by index
    const idx = codes.indexOf(code) % PALETTE.length;
    return PALETTE[idx].hex;
  };

  const handleCreateCode = () => {
    if (!newCodeLabel.trim()) return;
    const newCode: Code = {
      id: Date.now().toString(),
      label: newCodeLabel,
      color: PALETTE[selectedColorIdx].hex,
    };
    onUpdateSession({
      ...session,
      codes: [...codes, newCode],
    });
    setNewCodeLabel('');
    setSelectedColorIdx((selectedColorIdx + 1) % PALETTE.length);
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
        color: PALETTE[(codes.length + nextCodes.length) % PALETTE.length].hex
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

    const elements: React.ReactNode[] = [];
    let lastIndex = 0;

    segmentAnnos.forEach((anno, i) => {
      if (anno.startOffset > lastIndex) {
        elements.push(
          <span key={`text-${i}`} className="text-slate-700">
            {segment.text.slice(lastIndex, anno.startOffset)}
          </span>
        );
      }

      const code = codes.find(c => c.id === anno.codeId);
      const hex = code ? getCodeHex(code) : '#999';

      elements.push(
        <span
          key={`anno-${anno.id}`}
          className="px-0.5 rounded cursor-pointer hover:opacity-80 transition-all relative group box-decoration-clone"
          style={{
            backgroundColor: hexToRgba(hex, 0.12),
            borderBottom: `3px solid ${hex}`,
            color: hex,
          }}
          title={`${code?.label}: ${anno.text}`}
        >
          <span style={{ color: 'inherit' }}>{segment.text.slice(anno.startOffset, anno.endOffset)}</span>
          <span
            className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap hidden group-hover:block z-10 shadow-sm"
            style={{ backgroundColor: hex, color: 'white' }}
          >
            {code?.label}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); deleteAnnotation(anno.id); }}
            className="absolute -top-3 -right-2 bg-slate-800 text-white rounded-full p-0.5 hidden group-hover:flex w-4 h-4 items-center justify-center text-[10px] shadow-sm z-20"
          >
            <X size={8} />
          </button>
        </span>
      );

      lastIndex = anno.endOffset;
    });

    if (lastIndex < segment.text.length) {
      elements.push(
        <span key="text-end" className="text-slate-700">
          {segment.text.slice(lastIndex)}
        </span>
      );
    }

    return elements;
  };

  // --- Timeline gradient from the palette ---
  const timelineGradient = `linear-gradient(180deg, ${PALETTE.slice(0, 5).map(p => p.hex).join(', ')})`;

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
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-[#2A6B6B]/15"
            />
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((p, i) => (
                <button
                  key={p.label}
                  onClick={() => setSelectedColorIdx(i)}
                  className={`w-6 h-6 rounded-full transition-all ${selectedColorIdx === i ? 'ring-2 ring-offset-1 ring-slate-500 scale-110' : 'hover:scale-105'}`}
                  style={{ backgroundColor: p.hex }}
                  title={`${p.label} — ${p.meaning}`}
                />
              ))}
            </div>
            <button
              onClick={handleCreateCode}
              disabled={!newCodeLabel.trim()}
              className="w-full flex items-center justify-center gap-2 bg-[#2A6B6B] text-white py-2 rounded text-sm font-medium hover:bg-[#1F5454] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                  className="text-xs px-2 py-1 rounded bg-[#2A6B6B] text-white hover:bg-[#1F5454] transition-colors"
                >
                  Import all
                </button>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {analysis.codebookSuggestions?.map((s, i) => {
                  const dotColor = PALETTE[(codes.length + i) % PALETTE.length].hex;
                  return (
                    <div key={`${s.label}-${i}`} className="text-xs rounded p-2" style={{border: `1px solid ${hexToRgba(dotColor, 0.25)}`, backgroundColor: hexToRgba(dotColor, 0.04)}}>
                      <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{backgroundColor: dotColor}} />
                        {s.label}
                      </div>
                      <div className="text-slate-500 mt-0.5">{s.rationale}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Code List */}
          <div className="space-y-1">
            {codes.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-4">No codes created yet.</p>
            )}
            {codes.map(code => {
              const hex = getCodeHex(code);
              const count = annotations.filter(a => a.codeId === code.id).length;
              return (
                <div key={code.id} className="flex items-center justify-between p-2 rounded hover:bg-white/80 group transition-colors" style={{border: '1px solid transparent'}}>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shrink-0 ring-1 ring-white/20" style={{backgroundColor: hex}} />
                    <span className="text-sm font-medium text-slate-700">{code.label}</span>
                    <span className="text-xs px-1.5 rounded-full" style={{backgroundColor: hexToRgba(hex, 0.1), color: hex}}>
                      {count}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDeleteCode(code.id)}
                    className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main: Transcript */}
      <div className="flex-1 overflow-y-auto bg-[#E4F2EF] p-4 md:p-8 relative">
        <div className="max-w-3xl mx-auto space-y-6 pb-20">
          <div className="text-center mb-8">
             <h2 className="text-2xl font-bold text-slate-800">Transcript</h2>
             <p className="text-slate-400 text-sm">Highlight text to apply thematic codes. Click timestamps to play audio.</p>
          </div>

          {analysis.transcriptSegments?.map((segment, idx) => (
            <div key={idx} className="flex flex-col gap-1 group/segment">
              <div className="flex items-baseline gap-2">
                <span className={`text-xs font-bold uppercase tracking-wider ${segment.speaker.toLowerCase().includes('interviewer') ? 'text-[#2A6B6B]' : 'text-slate-500'}`}>
                  {segment.speaker}
                </span>
                {audioUrl ? (
                  <button
                    onClick={() => seekTo(segment.timestamp)}
                    className="text-xs text-slate-400 font-mono hover:text-[#2A6B6B] hover:underline cursor-pointer flex items-center gap-1 transition-colors"
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
                className={`p-4 rounded-xl text-[15px] font-normal leading-relaxed shadow-sm border transition-colors ${
                  segment.speaker.toLowerCase().includes('interviewer')
                    ? 'bg-slate-100 border-slate-200 text-slate-800 rounded-tl-none'
                    : 'bg-white border-slate-200 text-slate-700 rounded-tr-none'
                }`}
                style={segment.speaker.toLowerCase().includes('interviewer') ? { color: 'rgba(0,0,0,0.85)' } : undefined}
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
             <span className="text-xs font-bold text-slate-400 mr-2 border-r border-slate-200 pr-2">
               Apply Code:
             </span>
             {codes.map(code => {
               const hex = getCodeHex(code);
               return (
                 <button
                   key={code.id}
                   onClick={() => applyCode(code.id)}
                   className="px-3 py-1 rounded-full text-xs font-medium hover:scale-105 transition-transform flex items-center gap-1.5"
                   style={{ backgroundColor: hexToRgba(hex, 0.12), color: hex, border: `1px solid ${hexToRgba(hex, 0.25)}` }}
                 >
                   <span className="w-1.5 h-1.5 rounded-full" style={{backgroundColor: hex}} />
                   {code.label}
                 </button>
               );
             })}
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
    <div className="p-6 md:p-8 overflow-auto h-full bg-[#E4F2EF]">
        <div className="max-w-4xl mx-auto space-y-6">
        {/* Summary Card */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={20} style={{color: PALETTE[8].hex}} />
            <h3 className="font-semibold text-lg text-slate-800">Experience Abstract</h3>
          </div>
          <p className="text-slate-700 leading-relaxed">{analysis.summary}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Diachronic Structure (Timeline) */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 mb-6">
              <Clock size={20} style={{color: PALETTE[3].hex}} />
              <h3 className="font-semibold text-lg text-slate-800">Diachronic Structure</h3>
            </div>

            <div className="relative ml-3 space-y-8 pb-2">
              {/* Gradient timeline line */}
              <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{background: timelineGradient}} />

              {analysis.diachronicStructure.map((phase, idx) => {
                const nodeColor = PALETTE[idx % PALETTE.length].hex;
                return (
                  <div key={idx} className="relative pl-8">
                    <div className="absolute -left-[7px] top-0 w-4 h-4 rounded-full border-4 border-white shadow-sm" style={{backgroundColor: nodeColor}} />
                    <div className="flex flex-col">
                      <span className="text-xs font-bold uppercase tracking-wider mb-1" style={{color: nodeColor}}>
                        {phase.timestampEstimate || `Phase ${idx + 1}`}
                      </span>
                      <h4 className="font-semibold text-slate-900 mb-1">{phase.phase}</h4>
                      <p className="text-slate-600 text-sm">{phase.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Synchronic Structure (Modalities) */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 mb-6">
              <Layers size={20} style={{color: PALETTE[4].hex}} />
              <h3 className="font-semibold text-lg text-slate-800">Synchronic Structure</h3>
            </div>

            <div className="grid gap-4">
              {analysis.synchronicStructure.map((dim, idx) => {
                const dotColor = PALETTE[(idx + 3) % PALETTE.length].hex;
                return (
                  <div
                    key={idx}
                    className="p-4 rounded-lg bg-slate-50 border border-slate-100 flex gap-4 items-start transition-all group/sync"
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = hexToRgba(dotColor, 0.08); }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
                  >
                    <div className="p-2 rounded-lg shrink-0" style={{backgroundColor: hexToRgba(dotColor, 0.15), color: dotColor}}>
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
                );
              })}
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
            <p className="text-sm text-slate-400 mb-4">
              Context, judgments, and generalisations separated from the core experience.
            </p>
            <ul className="space-y-2">
              {analysis.satellites.map((sat, idx) => (
                <li key={idx} className="text-sm text-slate-600 bg-slate-50 px-3 py-2 rounded border border-slate-100 italic">
                  &ldquo;{sat}&rdquo;
                </li>
              ))}
            </ul>
          </div>

          {/* Suggestions */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare size={20} style={{color: PALETTE[7].hex}} />
              <h3 className="font-semibold text-lg text-slate-800">Deepening Suggestions</h3>
            </div>
            <p className="text-sm text-slate-400 mb-4">
              Questions the AI suggests to further explore the experience if you were to continue.
            </p>
            <ul className="space-y-3">
              {analysis.suggestions.map((sug, idx) => {
                const color = PALETTE[(idx + 5) % PALETTE.length].hex;
                return (
                  <li key={idx} className="flex gap-3 text-sm px-4 py-3 rounded-lg" style={{backgroundColor: hexToRgba(color, 0.06), color: '#334155'}}>
                    <span className="font-bold" style={{color: hexToRgba(color, 0.6)}}>{idx + 1}.</span>
                    {sug}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-[#E4F2EF] overflow-hidden">
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
                 className="w-8 h-8 flex items-center justify-center rounded-full bg-[#2A6B6B] text-white hover:bg-[#1F5454] transition-colors"
               >
                 {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
               </button>
               <span className="text-xs font-mono font-medium text-slate-600 min-w-[80px]">
                 {formatTime(currentTime)} / {formatTime(session.duration)}
               </span>
            </div>
          ) : (
            <div className="hidden md:flex items-center gap-2 ml-6 text-xs px-2 py-1 rounded border" style={{color: PALETTE[8].hex, backgroundColor: hexToRgba(PALETTE[8].hex, 0.06), borderColor: hexToRgba(PALETTE[8].hex, 0.15)}}>
               <AlertTriangle size={12} /> Audio unavailable (restored session)
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('coding')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'coding' ? 'bg-white text-[#2A6B6B] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Coding
            </button>
            <button
              onClick={() => setActiveTab('report')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'report' ? 'bg-white text-[#2A6B6B] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Report
            </button>
          </div>

          <button
            onClick={handleExport}
            className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-[#2A6B6B] px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
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
