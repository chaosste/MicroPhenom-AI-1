# Schema Mapping (MicroPhenom -> NeuroPhenom Canonical)

## Canonical fields now supported

- `summary`
- `takeaways`
- `modalities`
- `phasesCount`
- `codebookSuggestions[{label,rationale,exemplarQuote}]`
- `diachronicStructure[{phaseName,description,startTime}]`
- `synchronicStructure[{category,details}]`
- `transcript[{speaker,text,timestamp}]`

## Backward compatibility

The service normalizer keeps legacy fields for UI compatibility:

- `transcriptSegments`
- `diachronicStructure.phase`
- `diachronicStructure.timestampEstimate`
- `synchronicStructure.modality`
- `synchronicStructure.description`

