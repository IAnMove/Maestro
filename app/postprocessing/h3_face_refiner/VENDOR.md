# H3 Face Refiner

Imported from WanGP commit `362c3467a70e1136ceb52eec95907205a8f88543`.
The original Carasibana [MIT notice](LICENSE.upstream) remains intact; see the
[WanGP license](../../licenses/wangp-1272.txt) and
[file inventory](../../shared/wangp1272/upstream.json).

Local changes reuse the bound generation runtime, isolate its private model,
resolve shared assets/LoRA paths, and preserve PCM audio conditioning. Ultralytics
and InsightFace are separate installed dependencies with their own code and
model licenses; this repository does not include their checkpoints.
