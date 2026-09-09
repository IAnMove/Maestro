# Use shared commands from Wizard or an MCP client

Wizard operates inside the web application. MCP accepts explicit operations
from an external client while the application server is running. Closing a
browser does not stop an already admitted native generation or upscale job.
Server-driven editorial workflows are a separate migration and are not covered
by this guarantee.

## Wizard and manual controls

1. Choose the destination workspace and select installed models or existing
   source media. For Tools, select the source, its kind and the upscale method.
2. Ask Wizard for the operation with those exact identifiers, or use the
   ordinary Generate/Run controls.
3. The application presents the request in the relevant Studio/Tools panel.
   A workspace or form change during preparation prevents that submission.
4. The queued message contains a task/job identity. Follow Activity to its
   terminal status and open the resulting asset. Queued does not mean finished.
5. If a submission response is lost, recover the saved request in the panel.
   Recovery reuses its intention; it must not silently create a new generation.

The shared native routes currently cover image, speech and upscale. Other
Studio modes continue through their existing paths until migrated. Speech
model duration controls have model-specific meanings: for example, a 20-second
Kugel setting does not force a short sentence to occupy exactly 20 seconds.

## MCP connection and discovery

Set `HOCUS_MCP_TOKEN` in the server's environment before starting the
application. Configure the external client's HTTP endpoint as
`http://SERVER:PORT/api/v1/wangp/mcp` and its Authorization header as
`Bearer YOUR_TOKEN`. Keep the actual token out of saved requests and reports.
The endpoint is disabled when no token is configured.

The tested protocol is `2025-03-26`, using the official JavaScript MCP SDK's
Streamable HTTP client. Discovery uses `tools/list`; the returned schemas are
the authority for supported versions and parameters. The server does not invoke
Wizard's LLM to interpret an explicit MCP operation.

Relevant tools include:

| Tool | Purpose |
| --- | --- |
| `models`, `processors` | Discover exact model IDs and processor availability |
| `assets` | Find source IDs and workspace-qualified media URLs |
| `generation.image` | Submit the shared image specification |
| `generation.speech` | Submit the shared speech specification |
| `tools.upscale` | Submit a typed upscale request for an existing image/video |
| `generation.receipt` | Recover a shared admission and its canonical task |
| `status` | Follow the returned native job ID |

The previous `generate`, `upscale` and other legacy tools remain available.
Their schemas differ from the typed operations above; do not mix envelopes.

For example, call `tools.upscale` with arguments shaped as follows, replacing
the example source with an existing resource obtained through `assets`:

```json
{
  "version": 2,
  "intent_id": "one-client-intention",
  "input": {
    "workspace": "my-outputs",
    "params": {
      "source": "/api/v1/file/source.png?workspace=my-inputs",
      "source_kind": "image",
      "method": "lanczos2",
      "seed": 42,
      "wangp_processor_settings": {}
    }
  }
}
```

MCP carries the operation in the tool name. The equivalent local HTTP request
adds `"operation": "tools.upscale"` and goes to
`POST /api/v1/generation/commands`. Its catalog is available at the same path
with GET. The collection ID, when supplied, is distinct from the physical
output workspace; see [Tools commands](TOOLS_COMMANDS.md).

## Follow-up, retry and errors

Save the command and its `intent_id` before sending. An admission response has
`receipt.result.job_id` and `receipt.result.task_id`. Poll `status` with the
job ID. On completion, its output filenames belong to the explicit destination
workspace; source media remain in their source workspace.

To recover an uncertain response, call `generation.receipt` with:

```json
{
  "version": 1,
  "input": {
    "workspace": "my-outputs",
    "intent_id": "one-client-intention"
  }
}
```

Repeat the exact command with the same intention after a transport failure.
An existing admission returns the same receipt and task. Changing the content
under that intention produces a conflict. A deliberately new generation uses
a new intention, even when the prompt is identical. After a server restart,
inspect the saved receipt and queue recovery before explicitly resuming an
interrupted job.

Validation errors do not establish admission. A storage/dispatch error can
require recovery, so do not replace its intention automatically. Native task
status remains the completion authority. Read [image](IMAGE_COMMANDS.md),
[speech](SPEECH_COMMANDS.md) and [upscale](TOOLS_COMMANDS.md) contracts for
supported inputs and current limits. Hashes record inspected sources; they do
not make external source files immutable throughout queue lifetime.
