# H17 handoff — Wizard/MCP corpus

Branch `grok/agente1-h17-wizard-corpus-20260911` from `origin/development` `780d3915`.
Draft PR toward `development`. Do not merge.

## What shipped

- EN/ES corpus fixture `tests/fixtures/wizard_mcp_corpus.json` (intents, negations,
  ambiguous refs, workspace change, retry, compound, unpublished, errors).
- Contract tests: `tests/test_wizard_mcp_corpus.py`, `ui/tests/wizardMcpCorpus.test.ts`.
- Simulated E2E: `ui/e2e/specs/wizard-mcp-corpus.spec.ts` (Playwright harness, no Pinokio restart).
- Guide: `docs/development/WIZARD_MCP_USAGE.md` (usable without reading the code).
- Local evidence (gitignored): `outputs/wizard-mcp-corpus-20260911/`.

No product runtime files were changed. No foreign lanes edited.

## Mock vs real

| Circuit | Result |
| --- | --- |
| FakeNative HTTP + MCP (image/speech/music/sfx/upscale) | **simulated PASS** — admission, replay, two clients, same id |
| Wizard parse/reconcile/format (EN/ES corpus) | **simulated PASS** |
| Playwright simulated API | implemented; run in CI / locally with the UI preview |
| Live `GET /api/v1/generation/commands` on already-running API `:42005` | **read-only real** if that process is up |
| Live MCP `tools/list` | not executed (Bearer token not taken from the shared runtime) |
| Real generation with installed models | **PENDING** |

Installed on the shared machine (not used): `flux2_klein_4b`, `kugelaudio_0_open`,
`ace_step_v1_5_xl_sft_lm_4b`, others. H17 does **not** enqueue GPU work on the
cinematic/shared Pinokio runtime.

## Matrix

See the fixture `matrix` array and `docs/development/WIZARD_MCP_USAGE.md`.
Short form: designed/implemented/simulated for published ops; `generation.video`
designed but **not implemented** (H01); real generate pending.

## Failures found (not silently fixed)

1. **H01** `generation.video` is unpublished on this base. Repro: catalog omits it;
   MCP `tools/call` name `generation.video` is `isError` and creates zero tasks.
2. **H09** prior Video Editor 589/590 frame finding is recorded, not retested.
3. **agentActions** “Open Studio, prepare a Flux image … and generate it.”
   fills the form and does **not** start. Repro `compound-prepare-and-generate-it`.
4. **wizardTurnReport** how-to with an empty action list keeps model prose
   (invented “I generated invented.png.”). No task is created. Repro in the
   corpus fixture `howto-empty-turn-keeps-model-prose`. Not patched here
   (`wizardTurnReport.ts` is read-only for this lane).

## How to try it

```bash
PYTHONPATH=app /home/ina/pinokio/api/Maestro-next.git/app/env/bin/python -m pytest tests/test_wizard_mcp_corpus.py -q
cd ui && npx tsx --tsconfig tsconfig.app.json --import ./tests/setupI18n.ts --test tests/wizardMcpCorpus.test.ts
# optional: npx playwright test -c e2e/playwright.config.ts e2e/specs/wizard-mcp-corpus.spec.ts
```

As a user: read `docs/development/WIZARD_MCP_USAGE.md`. Refusal must create no
task; an unpublished tool must not promise success; a timeout replay must keep
the same job id on both clients.
