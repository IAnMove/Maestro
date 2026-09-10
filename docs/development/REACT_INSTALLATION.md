# React installation, recovery and build identity

The UI is a required part of Pinokio's normal Start flow. A Python environment
directory or a running API is not proof that the React application was built.

Install and Update invoke `ui_build.js` before native engine setup. Start invokes
the same child before loading Python engines. The child returns success only
after `scripts/build_ui.py` verifies a complete build. An unchanged Git revision
does not skip missing/corrupt output. A current receipt avoids npm on repeat Start.

The builder runs `npm ci --include=dev` against the committed lockfile, then the
existing type check/Vite build. Python for the architecture prebuild is selected
explicitly from the builder's interpreter. No Python package or model is installed.
The output is compiled in a private staging directory. Entry references and all
generated files are checked before replacing `ui/dist`. A failed npm build keeps
the previous output; failed publication attempts restore it. This is directory
replacement with rollback, not a zero-downtime deployment. Stop the app before
using Repair Web UI, then restart. Concurrent builders are rejected by an OS lock
that releases when the process exits; no lock file needs manual deletion.

`ui/dist/build-info.json` records the release from `VERSION`, Git commit/branch,
build ID, UTC build time, source digest and output fingerprints. The digest covers
UI source/config/public files and the scoped architecture generator inputs.
Generated files and dependencies are excluded. The startup log prints release,
commit, branch, system/OS build, Python and React build identity before AI imports.
Unavailable Git/build data is explicitly unknown, never substituted with a newer
commit. A plain `npm run build` remains usable but has no managed build identity;
Pinokio's next Start creates a verified build.

If Python is launched directly with a missing/partial UI, `/` returns an HTML
recovery page with HTTP 503 and no-store. API and Classic routes remain available.
Windows JavaScript/CSS MIME overrides are preserved. Restart after repairing an
already-running backend so its static mount is registered.

## Recovery for an installed user

Stop Start, click **Repair Web UI**, wait for **React build ready**, then Start.
This does not reinstall engines or weights. For manual repair in the repo root:

```text
python scripts/build_ui.py --force
```

On older published revisions without the helper/menu item, use the repo terminal:

```text
cd ui
npm ci --include=dev
npm run build
```

Then restart Start. If npm fails, report its first error plus the startup identity
lines. The final missing-UI message alone does not identify the failed install step.
The `expandable_segments not supported` Torch warning is separate from UI output.

## Validation boundary

Targeted tests cover missing/partial/corrupt output, current-build reuse, changed
sources, concurrent compilation, failed npm and failed directory publication,
support identity without Git, HTTP 503 and successful module MIME serving. CI
also builds from scratch via this helper on Linux and Windows, verifies output,
and exercises a repeat Start check on Windows. This is React installation evidence;
it does not certify installation/inference of every GPU model on a Windows PC.
