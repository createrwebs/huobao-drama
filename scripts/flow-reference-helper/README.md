# Google Flow character reference uploads

Build the upload-only helper from the repository root:

```sh
sh scripts/build-flow-reference-helper.sh
```

Requires Git, Go (automatic toolchain download enabled), and network access at
build time. The build pins flow-go to commit
`70ec73861091267dd1f57184bcf809a922bea85b` and installs a separate helper in the
engine's `bin` directory. Set `FLOW_ENGINE_DIR` to target a different engine.
It does not replace the existing video engine or change Node dependencies.

The helper calls `UploadImageViaBatch`, not the legacy REST image upload:
legacy REST media IDs are not usable by batchexecute reference generation.
Uploading does not submit a video generation. It needs valid browser cookies,
an active Flow project, and the extension/bridge for reCAPTCHA when required.

Huobao stores only successful server media IDs in
`data/huobao-flow-references.sqlite3` inside the engine directory, keyed by
account, project, and SHA-256 of image bytes. Concurrent requests within the
backend share uploads. Old `flow.db/uploads` entries and legacy character sync
metadata are not trusted. Character metadata is updated after upload success.

The helper is used only by the explicit character-sync endpoint. Video generation
now uses the original engine route: local image files via `--reference` and an
explicit cookie file selected by `getBestFlowAccount` for each request. The engine
uploads references inside its generation session; video creation does not depend
on this helper or its cache. This restores compatibility but does not promise
one-time uploads for video jobs. Missing reference files stop submission.

Changing image bytes, account, or project causes a new upload. If an asset is
deleted remotely while its local cache still exists, use Force Sync to upload
again. Cache hits are not a remote existence check. Deduplication is per running
backend process; multiple separate backend instances should not share this
workflow concurrently.

The existing engine selects its `abra_r2v_<duration>s` reference model family.
The CLI does not expose a video `--model` flag: this integration must not be
treated as verification that an arbitrary model label (including Veo 3.1) is
honored upstream. Reference aspect/quality support is also an engine limitation.