import { AnalysisResult } from "../types";

/**
 * Claude API service for MicroPhenom AI.
 *
 * Calls the Anthropic Messages API through the /api/claude-analyze proxy
 * endpoint (served by server.js in production, or Vite dev middleware in
 * development). This avoids CORS issues since the proxy is same-origin.
 *
 * Note: Claude does not natively process audio — only text transcript
 * analysis is supported. Audio recording analysis continues to use Gemini.
 */

export const analyzeTextTranscriptClaude = async (
  text: string,
  apiKey: string
): Promise<AnalysisResult> => {
  const prompt = `You are an expert micro-phenomenology and neurophenomenology analyst.

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
${text}`;

  try {
    const response = await fetch('/api/claude-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey,
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    // The proxy returns the Anthropic Messages API response.
    // Extract the text content from the first content block.
    const textContent = data.content?.find((c: any) => c.type === 'text')?.text;
    if (!textContent) {
      throw new Error("No text content in Claude response");
    }

    // Parse the JSON from Claude's response
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not extract JSON from Claude response");
    }

    return normalizeAnalysisResult(JSON.parse(jsonMatch[0]));
  } catch (error) {
    console.error("Claude Analysis Error:", error);
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
