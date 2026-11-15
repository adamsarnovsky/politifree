# Politifree local engine 0.6.14 (source checkout)

![Politifree](logo.png)

Runs OCR, semantic classification, speech transcription and sampled video-frame OCR and visual scene classification on your computer. The production connection uses Chrome native messaging. It does not save uploaded content or send it to a cloud service. Initial setup downloads Python packages; model weights are included in the full companion package.

## Source checkout setup (Windows)

For normal Windows use, download the [combined installer](https://github.com/adamsarnovsky/politifree/releases/download/v0.7.0/Politifree-Setup-v0.7.0.zip), which includes the extension, companion, and models. This repository is a development source checkout and does **not** contain model weights. For a development source installation:

1. Install 64-bit Python 3.12 and Node.js.
2. Place the semantic, speech and visual assets described below under `models/`, matching every path and checksum in `model-manifest.json`. Source repositories are listed below. This checkout does not include an automatic model downloader; do not skip checksum validation.
3. Run `powershell -NoProfile -ExecutionPolicy Bypass -File setup.ps1` from this folder. Setup stops if any model is absent or damaged.
4. Run `powershell -NoProfile -ExecutionPolicy Bypass -File register-native.ps1 -ExtensionPath ../Politifree-Chrome` to register the current unpacked extension path for your Windows user.
5. Reload the extension in Chrome and refresh your pages. Chrome starts and stops the engine through native messaging; do not run the legacy HTTP start script.

The full installer is the standard user distribution. Historical evaluation fixtures and audit captures are not part of this public source export; repository tests cover the shared-filter protocol and text regressions, not comprehensive model accuracy.

## Managed local engine

Use the combined Politifree installer. Chrome starts native_host.py through a
registered native messaging host when the extension needs analysis. The first
request loads the text model. OCR, vision and speech load only when needed;
unused media models are released independently during subsequent work. Idle timeout or Off closes the connection and releases
the process. No local HTTP listener, pairing token or sign-in task is needed.

The installer registers only the current extension identity, derived from its
Windows unpacked path (or a public key for a future Store build). This preserves
identity and settings when the installed folder stays the same.

server.py also contains the legacy HTTP development API. Its manual start/stop
scripts are retained for development compatibility and are not used by the
normal installer. Do not start that API for a regular installation.

## Behavior and tradeoffs

- OCR checks sufficiently large content images, excluding avatars, navigation and editing fields.
- Semantic analysis supplements explicit political text rules. It applies regardless of which viewpoint a post expresses. It is a pretrained model, not a model trained on this user's browsing.
- Downloadable media: speech is transcribed, video frames are sampled every two seconds plus keyframes. Clips exceeding two minutes or 32 MiB remain unverified. Images are capped at 10 MiB and 16 million pixels.
- Live audio: six-second chunks, analysed with two seconds of overlapping context, are withheld until locally checked. Chunks identified as political are suppressed. Failed or uncertain chunks play to avoid silencing ordinary audio without evidence. Audio is delayed and can be out of sync with visible video. Boundaries between chunks and model errors can still cause misses.
- Unchecked, inaccessible or unsupported media remains visible under the current precision policy. The legacy unchecked-content setting does not guarantee that these items are hidden.
- Protected video, closed shadow DOM, inaccessible canvases/frames and logins remain browser constraints. This cannot bypass authentication or guarantee removal of all politics. OCR, visual and semantic models can make mistakes.
- CPU analysis is bounded and cached in memory. Text-only browsing does not load OCR, vision or speech. Exact repeated audio windows reuse transcripts; repeated images and frames reuse context-aware results without reducing video sampling coverage. Memory depends on the models in use. No raw content is logged. Restarting clears in-memory caches.

## Model and library sources

- Semantic model: [MoritzLaurer/deberta-v3-xsmall-zeroshot-v1.1-all-33](https://huggingface.co/MoritzLaurer/deberta-v3-xsmall-zeroshot-v1.1-all-33), quantized ONNX, MIT.
- Speech model: [Systran/faster-whisper-tiny.en](https://huggingface.co/Systran/faster-whisper-tiny.en), English, with [faster-whisper](https://github.com/SYSTRAN/faster-whisper), MIT.
- OCR: [RapidOCR](https://github.com/RapidAI/RapidOCR), installed from PyPI, Apache 2.0.
- Browser integration: [Chrome tabCapture](https://developer.chrome.com/docs/extensions/reference/api/tabCapture) and [offscreen documents](https://developer.chrome.com/docs/extensions/reference/api/offscreen).

For development-only source checkouts without the bundled models, download the semantic repository's `config.json`, `tokenizer.json` and `onnx/model_quantized.onnx` into `models/semantic/`, and the speech repository into `models/speech/` using `hf download`. The server never downloads models during inference.


## Visual evidence and combined decisions

CLIP image embeddings compete against political scenes and ordinary scenes (pets, food, sports, concerts, portraits and business presentations). Flags and crowds are not automatic political verdicts. Public-figure likeness prompts are evidence, not reliable face identification. Ambiguous visual results remain unverified unless strong text evidence resolves them. The visual score is a rule-based evidence level, not a calibrated probability. Centre cropping can miss details near an image's edge.

Image OCR and speech are classified together with the surrounding post caption. Evidence from multiple images and transcripts is combined in the extension for a final text decision. Strong individual signals cannot be diluted by ordinary filler. Failed or truncated analysis cannot become a cleared result.

Video samples every two seconds and at keyframes, up to two minutes. Very brief inserts between sampled frames can escape detection. Speech uses 30-second windows with two seconds of overlap. Live audio checks include the previous two seconds but play each cleared chunk only once; delays and phrase-boundary misses remain possible.

Visual weights: https://huggingface.co/Xenova/clip-vit-base-patch32 at revision 4c1807b705b1d015fb032789cc4d221b23025a6f. Model card included in models/visual/README.md. All bundled model hashes are recorded in model-manifest.json and verified during setup and startup. No repository Python code is executed.

## Evaluation

Public regression checks are described in the repository root README. The broader local release suite is not bundled in this source export. Do not interpret its passing results as universal filtering accuracy.

