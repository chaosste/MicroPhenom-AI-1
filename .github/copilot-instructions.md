# MicroPhenom-AI - Micro-phenomenology Research Tool

MicroPhenom-AI is a React + TypeScript voice-enabled research tool for conducting, recording, and analyzing micro-phenomenology interviews using Google's Gemini 2.5 Flash. Features live AI-guided interviews, audio recording, structured analysis, and qualitative coding capabilities.

## Build, Test, and Development Commands

```bash
# Install dependencies
npm install

# Development server (http://localhost:3000)
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

## Architecture

### Application Overview

MicroPhenom-AI is a comprehensive qualitative research platform implementing micro-phenomenology interview methodology. The app supports three modes:

1. **Live AI-Guided Interview** - Real-time interview with Gemini Live API
2. **Manual Recording** - Record audio without AI guidance
3. **Upload & Analyze** - Upload existing audio files for analysis

### Project Structure

```
components/
├── LiveInterviewSession.tsx     # Gemini Live API integration for real-time interviews
├── InterviewRecorder.tsx        # Manual audio recording component
├── AnalysisView.tsx            # Analysis display with coding interface
└── MicrophoneVisualizer.tsx    # Audio waveform visualization

services/
├── geminiService.ts            # Gemini API calls (analysis, welcome messages)
└── geminiCachingService.ts     # Context caching for Gemini

App.tsx                         # Main application shell & state management
types.ts                        # TypeScript type definitions
vite.config.ts                  # Vite configuration with env variable handling
server.js                       # Simple HTTP server for production (alternative to nginx)
```

### Key Features

**Interview Modes:**
- **Beginner**: Foundational micro-phenomenology techniques
- **Advanced**: Temporal neuroslicing, transmodality, Gestalt emergence

**Settings:**
- Spelling: US/UK
- Accent: US/UK (affects voice selection)
- Interview mode: Beginner/Advanced

**Analysis Pipeline:**
1. **Transcription**: Speaker-segmented transcript with timestamps
2. **Satellite Identification**: Extract non-experiential content (judgments, theories, context)
3. **Diachronic Analysis**: Temporal phases of experience ("the film")
4. **Synchronic Analysis**: Sensory modalities and submodalities at key moments
5. **Suggestions**: Follow-up questions to deepen evocation

**Qualitative Coding:**
- Create custom codes with color labels
- Annotate transcript segments
- Export coded data
- Audio playback synchronized with transcript

### State Management

**LocalStorage-based persistence:**
- Sessions: `microphenom_sessions` (excludes audioBlob for size)
- Settings: Not currently persisted (defaults to US/BEGINNER)

**Session data:**
```typescript
{
  id: string;
  date: string;
  audioBlob?: Blob;  // Not saved to localStorage
  duration: number;
  analysis?: AnalysisResult;
  isAnalyzing: boolean;
  codes: Code[];      // User-defined coding categories
  annotations: Annotation[];  // Coded segments
}
```

### Gemini Live API Integration

**LiveInterviewSession workflow:**
1. Initialize WebSocket connection to Gemini Live
2. Configure with micro-phenomenology system instructions
3. Stream bidirectional audio (16kHz PCM16)
4. Collect transcript in real-time
5. Save transcript on session end

**Audio format:**
- Sample rate: 16kHz
- Encoding: PCM16 (Linear PCM, 16-bit)
- Base64 encoding for transmission
- MIME type: `audio/pcm;rate=16000`

**System instructions:**
- Dynamically generated based on settings (spelling, accent, mode)
- Focus on "how" not "what"
- Redirect from content to process
- Recursive clarification of vague/abstract responses
- No "why" questions (avoids speculation)

### Analysis Structure

**Gemini generates structured JSON with:**

```typescript
{
  transcriptSegments: TranscriptSegment[];  // Speaker-segmented with timestamps
  summary: string;                          // Overview of target experience
  diachronicStructure: DiachronicPhase[];   // Temporal phases
  synchronicStructure: SynchronicDimension[]; // Sensory modalities
  satellites: string[];                      // Non-experiential content
  suggestions: string[];                     // Follow-up questions
}
```

**Diachronic phases:**
- Sequential breakdown of experience over time
- Each phase has: name, description, timestamp estimate

**Synchronic dimensions:**
- Modalities: Visual, Auditory, Kinesthetic, Cognitive, Emotional
- Each includes description and submodality (e.g., "blurry image", "internal tension")

**Satellites:**
- Judgments, generalizations, context, theoretical knowledge
- Extracted to isolate direct lived experience

### Coding Interface

**Code management:**
- Create codes with custom labels and colors
- 7 predefined color schemes (Red, Blue, Green, Amber, Purple, Pink, Teal)
- Delete codes (cascades to annotations)

**Annotation workflow:**
1. Select text in transcript segment
2. Choose code from list
3. Annotation saved with segment index and text offsets
4. Visual highlighting in transcript

**Export functionality:**
- JSON export of coded data
- Includes: codes, annotations, transcript segments
- Filename: `microphenom-export-{sessionId}.json`

## Key Conventions

### Environment Variables

**Development (.env.local):**
```bash
GEMINI_API_KEY=<your_api_key>
```

**Build-time injection:**
- Vite exposes `process.env.API_KEY` and `process.env.GEMINI_API_KEY`
- Both point to `GEMINI_API_KEY` from environment

**Security note:**
- API key is bundled into client-side code during build
- Not suitable for production without backend proxy
- Consider user-provided keys for deployed version (see NeuroPhenom-AI pattern)

### TypeScript Configuration

- Target: `ES2022`
- Experimental decorators enabled
- `useDefineForClassFields: false` (for decorators compatibility)
- Path alias: `@/*` maps to project root
- Module resolution: `bundler`
- JSX: `react-jsx`

### Audio Processing

**Recording:**
- Browser MediaRecorder API
- Creates WebM or other browser-supported format Blob
- Stored in session until analysis

**Playback:**
- HTML5 Audio element
- Synchronized with transcript view
- Time updates for current playback position

**Gemini Live audio:**
- 16kHz mono PCM16
- Float32Array → Int16Array → Base64
- Decoded via AudioContext for playback

### Analysis Pattern

**Audio-based analysis:**
```typescript
analyzeInterview(audioBlob: Blob, settings: Settings): Promise<AnalysisResult>
```
- Converts Blob to Base64
- Sends to Gemini with audio analysis prompt
- Returns structured analysis

**Text-based analysis:**
```typescript
analyzeTextTranscript(text: string): Promise<AnalysisResult>
```
- For uploaded text transcripts
- Same structured output as audio analysis

### UI/UX Patterns

**State-based views:**
- `HOME`: Session list, search, start new interview
- `RECORDING`: Manual audio recording
- `LIVE_INTERVIEW`: AI-guided interview session
- `ANALYSIS`: Analysis display with coding interface

**Visual hierarchy:**
- Black/white minimalist design (inherited from NeuroPhenom-AI aesthetic)
- Lucide icons throughout
- Responsive layout
- Loading states during analysis

## Deployment

### Docker + nginx (Primary)

**Dockerfile:**
- Multi-stage build (Node builder + nginx serve)
- Vite build → `/usr/share/nginx/html`
- nginx on port 8080 (Cloud Run default)

**nginx.conf:**
- SPA routing (all routes → index.html)
- Static file caching

### Node.js server (Alternative)

**server.js:**
- Simple HTTP server for production
- Serves built files from current directory
- MIME type handling
- Port from `process.env.PORT` or 8080

**Usage:**
```bash
npm run build
node server.js
```

### Cloud Run Deployment

**cloudbuild.yaml:**
- Docker build → GCR
- Deploy to Cloud Run (us-central1)
- Unauthenticated access

**Environment variables:**
- Must set `GEMINI_API_KEY` at build time or runtime
- Consider Cloud Build substitutions for secrets

## Micro-phenomenology Methodology

### Core Principles

**SINGULARITY:**
- Specific, singular instance situated in time/space
- Not generalizations or typical experiences

**EPOCHÉ:**
- Suspend beliefs, theories, interpretations
- Focus on direct experience

**EVOCATION:**
- Relive the situation (present tense)
- Concrete sensory cues: "What could you see/hear?"

**REDIRECTION:**
- From content ("what") to process ("how")
- Pivot questions: "How did you do that?"

**RECURSIVE CLARIFICATION:**
- When responses are vague/abstract, STOP and clarify
- Don't advance timeline until grounded
- Example: "When you say 'weird', what was the specific sensation?"

**NO WHY:**
- Never ask "why" (leads to speculation)
- Focus on lived experience, not explanations

### Temporal Structures

**Diachronic (Time):**
- Unfolding over time
- Prompts: "How did you start?", "What happened then?"

**Synchronic (Structure):**
- Configuration at frozen moment
- Prompts: "Is it fuzzy or clear?", "Where in your body?"

### Interview Modes

**Beginner:**
- Foundational techniques
- Help find specific moment
- Evoke vividly
- Describe "how" vs "what"

**Advanced:**
- Temporal neuroslicing
- Transmodality (cross-sense descriptions)
- Gestalt emergence
- Sophisticated probing

## Important Notes

- **Project root**: `/Users/stephenbeale/Projects/MicroPhenom-AI/`
- **Microphone access**: Required for recording, needs HTTPS in production
- **LocalStorage limitations**: audioBlob excluded from persistence (size constraints)
- **API key security**: Currently bundled at build time - consider backend proxy for production
- **Gemini Live API**: Requires WebSocket support, 16kHz audio
- **Analysis format**: Structured JSON enforced by prompt engineering (no explicit schema)
- **Coding data**: Fully local, stored in session object
- **Export format**: JSON with codes, annotations, and transcript segments
