# Azure Realtime Migration Plan

This branch is reserved for Azure voice migration.

## Branch
- `codex/azure-realtime-microphenom`

## Defaults
- Keep `GEMINI` as default provider until Azure realtime adapter is wired.

## Acceptance Gates
- `/api/health` returns 200
- live mic session connects
- transcript captured
- analyze/codify runs
- diagnostics panel remains green for key/mic/network/session
