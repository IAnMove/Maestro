# Wizard action runner and application adapters

The Wizard does not simulate clicks to perform business operations. Registered
capabilities run through one deterministic lifecycle:

```text
resolve -> validate -> prepare -> confirm -> execute -> correlate -> track -> report
```

`capabilityRunner.ts` owns that lifecycle. A successful result always contains
an `AgentExecutionReport`; task, pipeline and output identifiers returned by an
adapter are copied into that report rather than reconstructed from prose.

## Adapter boundary

`applicationAdapters.ts` exposes stable ports for Studio, Story Lab, Series
Lab, Comics, Video3D, Video Editor, CharacterKit and Queue/Activity. React is
not part of these interfaces. Tests can therefore supply in-memory adapters,
and production can use `defaultApplicationAdapters`.

Navigation is an adapter result. The default adapter changes canonical store
state, verifies that the requested destination became active and only then
returns an `application_section` target. The runner copies that verified target
into the execution report. It does not infer a tab later from the action name.

Video3D rhythm currently provides the reference mutation: its adapter opens
and verifies Video3D, sends the typed rhythm request to the mounted scene
controller, and returns the verified destination with the controller's result.

## Compatibility

Only registered capabilities use the common runner. Non-migrated actions keep
their existing business implementations and report normalization while they
are moved domain by domain. This compatibility boundary prevents a registry
migration from disabling an existing Wizard feature.

Presentation hints are metadata only. Speed, panel visibility, scrolling,
sound and detailed animation remain behind Decision gate A; none of them is
required for action correctness.

## Turn validation and displayed results

The model response is a proposal. `parseAgentTurn` keeps bounded, locally derived
rejections for malformed actions, missing parameters, action limits and invalid
Studio generation order. `reconcileWizardMediaTurn` preserves those diagnostics
and records actions excluded by request or visual-evidence policy. Model-supplied
rejection fields are not authoritative.

For a turn containing business actions or rejections, `wizardTurnReport.ts`
builds the displayed answer from execution results and rejection reasons. It
does not prepend a model claim such as “created” when parsing rejected the action.
Queued, running, prepared and awaiting-input results have distinct labels;
admission does not certify a completed artifact. Informational replies and
navigation explanations retain the normal conversation path.

Comic context comes from user requests. A general assistant inventory mentioning
Comics must not redirect a later Flux retry, and an explicit Studio context takes
precedence over an older comic request. Task retries continue through the existing
canonical task adapter; this does not change backend retry/idempotency semantics.

This layer does not fact-check unrestricted informational prose, migrate workflow
execution to the server or implement the shared MCP command catalogue. Those are
separate follow-up scopes.
