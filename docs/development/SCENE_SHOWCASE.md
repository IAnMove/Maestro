# Portable scene showcase

The scene-template review sandbox can serve a self-contained, local showcase
package without contacting HocusPocus APIs or invoking an image/video
generator. The package is opt-in:

```text
showcase/
├── manifest.json
├── scene-one.mp4
├── scene-one.png
├── scene-one.json
└── inputs/
    ├── character.png
    └── plate.jpg
```

The root files are addressed by manifest references such as
`/scene-showcase/scene-one.mp4`; only those references are copied. The
`inputs/` directory is optional and may contain only canonical `.jpg`, `.jpeg`,
`.png`, or `.webp` basenames. It is copied to the run's temporary directory and
registered with the review server after the server starts, so editable scene
snapshots can use the returned `/api/v1/file/<name>?workspace=default` URLs.

Start the sandbox from `ui/`:

```sh
npm exec -- tsx scripts/scene-template-review.mjs --showcase-dir /absolute/path/to/showcase
```

`--render` can be supplied as well. It keeps the existing provider-free,
browser compositor render flow; it does not generate AI video. The CLI prints
the fresh temporary output directory and the loopback review URL after all
canonical inputs have been indexed. Open the editor from the loopback URL
(`http://127.0.0.1:<port>/scene-template-review?editor=1`) so loopback-only
write actions remain available.

At startup the loader parses `manifest.json` with the application's
`parseShowcaseManifest`, enforces a 1 MiB manifest and 256-reference limit,
limits referenced files to 512 MiB in total, and verifies every declared byte
count and SHA-256 before publishing anything. JSON scene references are capped
at 4 MiB and must contain the exact declared `sceneName` and
`generationPolicy: "provided_only"`. This package version is a silent,
raster-input compositor: `image` layers must use a verified `inputs/` file via
`/api/v1/file/<basename>` (with at most one safe `workspace` query). The only
inline image exception is the byte-for-byte SVG produced by the compositor's
four built-in `effect()` graphics (`beam`, `shield`, `burst`, and `debris`);
arbitrary SVG/data URLs remain rejected. `effect` layers may be empty-source
procedural layers or use `maestro-effect:<kind>` only when `<kind>` is one of
the 14 atmosphere kinds and matches `atmosphere.kind`; camera layers have no
external source. Audio tracks, video/GLB/model/overlay sources, remote URLs,
and missing inputs are rejected. Canonical inputs are limited to 64 files, 4
MiB per file, and 128 MiB in total. Symlinks, traversal, ambiguous duplicate
references, and overwrites are rejected. A failed package never starts a
reachable partial showcase.

The optional LAN URL is preview-only: GET/HEAD media reads are allowed, while
POST writes remain loopback-only. The index and output registry are in memory
and the output directory is fresh per run; restarting the process does not
recover it. Keep generated videos, images, scene JSON, and other weights/media
out of Git. Pass them through an ignored temporary/session directory and keep
only the small manifest/schema and tooling in the repository.
