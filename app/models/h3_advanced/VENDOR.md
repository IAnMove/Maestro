# H3 Advanced / Viggle

Imported from WanGP commit `362c3467a70e1136ceb52eec95907205a8f88543`,
directory `models/minimax_h3`. Original file hashes and local adaptations are
recorded in [upstream.json](../../shared/wangp1272/upstream.json).

The adapter in `handler.py` preserves HocusPocus's existing H3/PDD namespace and
connects the imported pipeline to the current loader. Local adaptations cover
immutable downloads, shared affine files, frame/audio contracts and native
injection. Checkpoint export is not supported by this adapter.

The pipeline's `finalize_loras` callback reuses the existing H3 ConvRot adapter
to preserve activation rotation after MMGP 3.7.6 installs its Linear LoRA hooks.
This also applies to Viggle's required distillation LoRA; weights and sampling
remain those of the pinned upstream implementation.

WanGP adaptations use the [Community License 2.0](../../licenses/wangp-1272.txt).
Original notices in imported source remain intact. Model weights are downloaded
separately and retain their own licenses, including H3/Viggle territorial terms.
