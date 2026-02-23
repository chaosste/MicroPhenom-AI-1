export enum AppState {
  HOME = 'HOME',
  RECORDING = 'RECORDING',
  ANALYSIS = 'ANALYSIS',
  LIVE_INTERVIEW = 'LIVE_INTERVIEW',
}

export interface Settings {
  spelling: 'US' | 'UK';
  accent: 'US' | 'UK';
  interviewMode: 'BEGINNER' | 'ADVANCED';
  increasedSensitivityMode: boolean;
}

export interface DiachronicPhase {
  phaseName?: string;
  phase: string;
  description: string;
  startTime?: string;
  timestampEstimate?: string;
}

export interface SynchronicDimension {
  category?: string;
  modality: string;
  description: string;
  details?: string;
  submodality?: string;
}

export interface TranscriptSegment {
  speaker: string;
  text: string;
  timestamp: string;
}

export interface AnalysisResult {
  // Canonical schema
  transcript?: TranscriptSegment[];
  takeaways?: string[];
  modalities?: string[];
  phasesCount?: number;
  codebookSuggestions?: {
    label: string;
    rationale: string;
    exemplarQuote: string;
  }[];

  // Legacy-compatible fields
  transcriptSegments: TranscriptSegment[];
  summary: string;
  diachronicStructure: DiachronicPhase[];
  synchronicStructure: SynchronicDimension[];
  satellites: string[];
  suggestions: string[];
}

export interface Code {
  id: string;
  label: string;
  color: string; // Tailwind class, e.g., 'bg-red-200'
}

export interface Annotation {
  id: string;
  codeId: string;
  segmentIndex: number;
  startOffset: number;
  endOffset: number;
  text: string;
}

export interface InterviewSession {
  id: string;
  date: string;
  audioBlob?: Blob;
  duration: number;
  analysis?: AnalysisResult;
  isAnalyzing: boolean;
  // User-defined coding data
  codes: Code[];
  annotations: Annotation[];
}
