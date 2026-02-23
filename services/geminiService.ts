import { GoogleGenAI } from "@google/genai";
import { AnalysisResult } from "../types";

// Convert Blob to Base64 string
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data url prefix (e.g. "data:audio/wav;base64,")
      const base64Content = base64String.split(",")[1];
      resolve(base64Content);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const getWelcomeMessage = async (): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelId = "gemini-2.5-flash"; 
  
  const prompt = `
  You are a warm, insightful micro-phenomenology research guide. 
  Address the user directly.
  Write a brief, welcoming message (max 50 words) for a user about to record an interview.
  1. Explain that the goal is to slow down and discover the specific "how" of a lived experience.
  2. Suggest they start by bringing to mind a single, concrete moment to explore.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
    });
    return response.text || "Welcome. Let's explore the micro-dimensions of your experience. Please start by identifying a specific moment you wish to investigate.";
  } catch (error) {
    console.error("Gemini Welcome Message Error:", error);
    return "Welcome. Let's explore the micro-dimensions of your experience. Please start by identifying a specific moment you wish to investigate.";
  }
};

export const analyzeTextTranscript = async (text: string): Promise<AnalysisResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelId = "gemini-2.5-flash";

  const prompt = `
  You are an expert micro-phenomenology and neurophenomenology analyst.

  Analyze the transcript using canonical output fields.

  Return only JSON with this structure:
  {
    "summary": "string",
    "takeaways": ["string"],
    "modalities": ["string"],
    "phasesCount": 0,
    "codebookSuggestions": [
      { "label": "string", "rationale": "string", "exemplarQuote": "string" }
    ],
    "diachronicStructure": [
      { "phaseName": "string", "description": "string", "startTime": "00:00" }
    ],
    "synchronicStructure": [
      { "category": "string", "details": "string" }
    ],
    "transcript": [
      { "speaker": "Interviewer|Interviewee|AI", "text": "string", "timestamp": "00:00" }
    ],
    "satellites": ["string"],
    "suggestions": ["string"]
  }

  Rules:
  - Prioritize process ("how") over theory ("why").
  - If timestamps are missing, use "00:00".
  - Do not invent unsupported details.

  TRANSCRIPT TEXT:
  ${text}
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    if (response.text) {
      return normalizeAnalysisResult(JSON.parse(response.text));
    } else {
      throw new Error("No response text from Gemini");
    }
  } catch (error) {
    console.error("Gemini Text Analysis Error:", error);
    throw error;
  }
};

export const analyzeInterview = async (audioBlob: Blob): Promise<AnalysisResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const base64Audio = await blobToBase64(audioBlob);

  const modelId = "gemini-2.5-flash"; 

  const prompt = `
  You are an expert micro-phenomenology and neurophenomenology analyst.

  Analyze this interview audio and return only JSON with canonical fields:
  {
    "summary": "string",
    "takeaways": ["string"],
    "modalities": ["string"],
    "phasesCount": 0,
    "codebookSuggestions": [
      { "label": "string", "rationale": "string", "exemplarQuote": "string" }
    ],
    "diachronicStructure": [
      { "phaseName": "string", "description": "string", "startTime": "00:00" }
    ],
    "synchronicStructure": [
      { "category": "string", "details": "string" }
    ],
    "transcript": [
      { "speaker": "Interviewer|Interviewee|AI", "text": "string", "timestamp": "00:00" }
    ],
    "satellites": ["string"],
    "suggestions": ["string"]
  }

  Rules:
  - Prioritize process ("how") over theory ("why").
  - Keep claims conservative when evidence is sparse.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "audio/wav", // Assuming wav
              data: base64Audio,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: "application/json",
      },
    });

    if (response.text) {
      return normalizeAnalysisResult(JSON.parse(response.text));
    } else {
      throw new Error("No response text from Gemini");
    }
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
};

const normalizeAnalysisResult = (raw: any): AnalysisResult => {
  const canonicalTranscript = Array.isArray(raw?.transcript) ? raw.transcript : [];
  const legacyTranscript = Array.isArray(raw?.transcriptSegments) ? raw.transcriptSegments : [];
  const transcriptSegments = (canonicalTranscript.length > 0 ? canonicalTranscript : legacyTranscript).map((s: any) => ({
    speaker: String(s?.speaker || 'Interviewee'),
    text: String(s?.text || ''),
    timestamp: String(s?.timestamp || '00:00')
  }));

  const diachronic = Array.isArray(raw?.diachronicStructure) ? raw.diachronicStructure : [];
  const synchronic = Array.isArray(raw?.synchronicStructure) ? raw.synchronicStructure : [];

  return {
    summary: String(raw?.summary || ''),
    takeaways: Array.isArray(raw?.takeaways) ? raw.takeaways.map(String) : [],
    modalities: Array.isArray(raw?.modalities) ? raw.modalities.map(String) : [],
    phasesCount: Number.isFinite(raw?.phasesCount) ? Number(raw.phasesCount) : diachronic.length,
    codebookSuggestions: Array.isArray(raw?.codebookSuggestions)
      ? raw.codebookSuggestions.map((s: any) => ({
          label: String(s?.label || ''),
          rationale: String(s?.rationale || ''),
          exemplarQuote: String(s?.exemplarQuote || '')
        })).filter((s: any) => s.label)
      : [],
    transcript: transcriptSegments,
    transcriptSegments,
    diachronicStructure: diachronic.map((p: any) => ({
      phaseName: String(p?.phaseName || p?.phase || ''),
      phase: String(p?.phase || p?.phaseName || ''),
      description: String(p?.description || ''),
      startTime: String(p?.startTime || p?.timestampEstimate || '00:00'),
      timestampEstimate: String(p?.timestampEstimate || p?.startTime || '00:00')
    })),
    synchronicStructure: synchronic.map((s: any) => ({
      category: String(s?.category || s?.modality || 'Dimension'),
      modality: String(s?.modality || s?.category || 'Dimension'),
      description: String(s?.description || s?.details || ''),
      details: String(s?.details || s?.description || ''),
      submodality: s?.submodality ? String(s.submodality) : undefined
    })),
    satellites: Array.isArray(raw?.satellites) ? raw.satellites.map(String) : [],
    suggestions: Array.isArray(raw?.suggestions) ? raw.suggestions.map(String) : []
  };
};
