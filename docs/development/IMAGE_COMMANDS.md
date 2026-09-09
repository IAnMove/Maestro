# Shared image command admission

This is the first image slice of the Wizard/MCP operations plan. It implements
the strict text-to-image backend and a recoverable browser API client. The
general Studio form and Wizard `start_generation` still use their existing
submission path: wiring them requires preserving all their advanced settings,
references and LoRAs, not reducing the form to the subset below. Video, audio,
Tools, editorial domains and workflow execution are not covered by this slice.

## Contract and discovery

`GET /api/v1/generation/commands` describes the two executable operations.
The same entries generate MCP `generation.image` and `generation.receipt`.
The original ten MCP tools retain their existing names and behavior.

Submit to `POST /api/v1/generation/commands`:

```json
{
  "version": 1,
  "operation": "generation.image",
  "intent_id": "an-intention-chosen-by-the-client",
  "input": {
    "workspace": "default",
    "model_type": "an-exact-installed-image-model-id",
    "prompt": "A literal prompt\nwith a second line",
    "resolution": "512x512",
    "num_inference_steps": 1,
    "seed": 42,
    "guidance_scale": 1.0
  }
}
```

MCP carries the operation in the tool name and omits `operation` from its
arguments. `negative_prompt` is optional. Unknown fields and authority claims
are rejected. The native image selectors, single-output counts and complete
multiline prompt policy are fixed by the contract; prompt enhancement is off.
Models must be installed and support image output without mandatory references.
Resolution uses explicit dimensions, each 64..4096 and divisible by eight.
No discovery call downloads a model. Native generation preparation remains the
authority for its model-specific rules and execution policy.

## Admission and progress

The response is `{receipt, replayed}`. An immutable receipt with status `queued`
proves admission and contains exact native job/task IDs. It does not prove that
a worker is currently running, that inference completed, or that media passed
quality review. Read the current task through the canonical task API or through
`GET /api/v1/generation/commands/receipt?workspace=...&intent_id=...`, which
returns `{receipt, task}`. A retained receipt may outlive task retention.

The intention namespace is the physical output workspace's TaskRegistry
database. It is independent of the installation-wide collection intentions.
Every request freezes its explicit output workspace; neither transport reads
the last browser's current selection. The field `workspace` here is an output
folder name, not a Workspace collection ID. A retry preserves that field and
the intention ID; another deliberate generation uses another intention.

The content fingerprint excludes transport identity and includes all validated
effective inputs. TaskRegistry stores the original envelope, effective input
and the prepared native runtime snapshot separately from its bounded public
task metadata. A snapshot checksum detects corrupt admission storage and fails
closed. This is integrity checking, not protection against a malicious database
administrator. Server configuration and installed model bytes are external
dependencies; storing a request does not freeze a model installation.

## Atomicity and recovery

TaskRegistry schema version 3 adds command admissions to its existing SQLite
database. One transaction commits the canonical task, creation event and
receipt. This is not another task registry or scheduler. Older binaries reject
this schema rather than modifying tasks while ignoring their receipts.

A separate atomic claim permits initial dispatch once. The existing native
FIFO and worker perform inference. The existing durable generation queue is a
recoverable projection of the stored runtime request; persistence must succeed
before dispatch. Transport retries cannot steal a claimed command after a
timeout. A failed response after admission must be recovered with the same ID.

On restart, TaskRegistry marks interrupted work and the existing queue recovery
UI can restore its native request without automatically starting inference.
Explicit resume restarts the original inference from the beginning, according
to that existing policy; it is not a mid-diffusion checkpoint. Discard records
the terminal cancellation so a later recovery scan cannot resurrect it.
The deployment remains one native generation runtime; independent API worker
processes sharing a GPU still need the broader server fencing/lease work.

The browser client persists a detached command before POST. A lost response,
invalid receipt or temporary outage preserves it across reload. A rejection
on an already uncertain retry does not delete the hint. A storage-cleanup
failure after receiving a valid receipt does not turn admission into failure.
JavaScript clients reject unsafe integer seeds instead of rounding a literal.

## Validation boundary

Provider-free service, HTTP/MCP, SQLite concurrency/failure and browser client
tests cover the command boundary. Runtime wiring tests preserve the existing
task projection and H3 preparation behavior. Real-media evidence is recorded
separately in the execution outputs and PR; unit tests do not certify GPU
generation, quality, Windows durability or every Studio parameter.
