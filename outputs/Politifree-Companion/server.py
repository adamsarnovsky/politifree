"""Loopback-only inference. No uploaded content is saved or fetched by URL."""
from __future__ import annotations
import argparse
import base64
import gc
import hashlib
import io
import json
import os
import re
import secrets
import threading
import time
from collections import OrderedDict
from pathlib import Path
import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from PIL import Image

ROOT = Path(__file__).resolve().parent
MODEL_ROOT = Path(os.environ.get("POLITIFREE_MODELS", str(ROOT / "models")))
MAX_BYTES = 32 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 16_000_000


class Analyzer:
    def __init__(self, model_root=MODEL_ROOT):
        self.root = Path(model_root)
        self.lock = threading.RLock()
        self.model_used = {}
        self.ocr = self.semantic = self.tokenizer = self.whisper = None
        self.cache = OrderedDict()
        self.visual = None
        self.visual_cache = OrderedDict()
        self.image_cache = OrderedDict()
        self.speech_cache = OrderedDict()

    @property
    def ready(self):
        return self.semantic is not None

    def load(self):
        with self.lock:
            if self.ready:
                return
            try:
                self._load()
            except Exception:
                self._unload_locked()
                raise

    def unload(self):
        with self.lock:
            self._unload_locked()

    def _unload_locked(self):
        self.ocr = self.semantic = self.tokenizer = self.whisper = self.visual = None
        self.visual_text = self.visual_config = self.visual_labels = None
        self.entailment = None
        self.cache.clear(); self.visual_cache.clear(); self.image_cache.clear()
        self.speech_cache.clear(); self.model_used.clear()
        gc.collect()

    def _load(self):
        import onnxruntime as ort
        from tokenizers import Tokenizer
        opts = ort.SessionOptions()
        opts.enable_cpu_mem_arena = False
        opts.enable_mem_pattern = False
        opts.intra_op_num_threads = min(2, os.cpu_count() or 1)
        opts.add_session_config_entry("session.intra_op.allow_spinning", "0")
        self.semantic = ort.InferenceSession(str(self.root / "semantic/onnx/model_quantized.onnx"), opts, providers=["CPUExecutionProvider"])
        self.tokenizer = Tokenizer.from_file(str(self.root / "semantic/tokenizer.json"))
        self.tokenizer.enable_truncation(max_length=384)
        config = json.loads((self.root / "semantic/config.json").read_text())
        self.entailment = next(int(k) for k, v in config["id2label"].items() if "entail" in v.lower())

    def ensure_model(self, kind):
        with self.lock:
            self.model_used[kind] = time.monotonic()
            if kind == 'ocr' and self.ocr is None:
                from rapidocr_onnxruntime import RapidOCR
                self.ocr = RapidOCR(intra_op_num_threads=min(2, os.cpu_count() or 1), inter_op_num_threads=1,
                                    det_limit_type='max', det_limit_side_len=960, rec_batch_num=1)
            elif kind == 'speech' and self.whisper is None:
                from faster_whisper import WhisperModel
                self.whisper = WhisperModel(str(self.root / "speech"), device="cpu", compute_type="int8", cpu_threads=min(2, os.cpu_count() or 1))
            elif kind == 'visual' and self.visual is None:
                try:
                    self._load_visual()
                except Exception:
                    self.visual = None
                    self.visual_text = self.visual_config = self.visual_labels = None
                    raise

    def release_idle_models(self, seconds=90):
        with self.lock:
            now = time.monotonic()
            released = False
            for kind, attr in [('ocr', 'ocr'), ('speech', 'whisper'), ('visual', 'visual')]:
                if now - self.model_used.get(kind, now) > seconds and getattr(self, attr) is not None:
                    setattr(self, attr, None)
                    if kind == 'visual':
                        # Cached uncertain scenes still need the inexpensive
                        # label list to decide whether to inspect a crop.
                        self.visual_text = self.visual_config = None
                    released = True
            if released: gc.collect()

    def _load_visual(self):
        import onnxruntime as ort
        from tokenizers import Tokenizer
        opts = ort.SessionOptions()
        opts.enable_cpu_mem_arena = False
        opts.enable_mem_pattern = False
        opts.intra_op_num_threads = min(2, os.cpu_count() or 1)
        opts.add_session_config_entry("session.intra_op.allow_spinning", "0")
        self.visual = ort.InferenceSession(str(self.root / "visual/onnx/vision_model_quantized.onnx"), opts, providers=["CPUExecutionProvider"])
        encoder = ort.InferenceSession(str(self.root / "visual/onnx/text_model_quantized.onnx"), opts, providers=["CPUExecutionProvider"])
        tokenizer = Tokenizer.from_file(str(self.root / "visual/tokenizer.json"))
        tokenizer.enable_truncation(max_length=77)
        # Competing ordinary scenes prevent a flag or a crowd becoming an automatic verdict.
        self.visual_labels = [
            "a political election campaign rally with a politician speaking",
            "a political protest demanding government policy changes",
            "a political propaganda poster or political cartoon",
            "a televised political debate between election candidates",
            "a politician giving an official government press conference",
            "Donald Trump speaking about politics", "Joe Biden speaking about politics",
            "Kamala Harris speaking about politics", "Vladimir Putin speaking about politics",
            "Barack Obama speaking about politics",
            "a family portrait", "a concert audience watching musicians",
            "a sports crowd watching a game", "a national flag at a sporting event",
            "a scenic landscape", "food and cooking", "a pet animal",
            "a business presentation at a conference", "a comedy meme",
            "a tourist visiting a historic monument", "a product advertisement",
            "a person talking to a camera about everyday life"]
        embeddings = []
        for label in self.visual_labels:
            ids = np.asarray([tokenizer.encode("a photo of " + label).ids], dtype=np.int64)
            embeddings.append(encoder.run(None, {"input_ids": ids})[0][0])
        self.visual_text = np.asarray(embeddings)
        self.visual_text /= np.linalg.norm(self.visual_text, axis=1, keepdims=True)
        self.visual_config = json.loads((self.root / "visual/preprocessor_config.json").read_text())

    def visual_evidence(self, im):
        key = hashlib.sha256(im.tobytes() + str(im.size).encode()).hexdigest()
        if key in self.visual_cache:
            self.visual_cache.move_to_end(key)
            return dict(self.visual_cache[key])
        self.ensure_model("visual")
        # Match the model's shortest-edge resize, centre crop and normalization.
        size = 224; scale = size / min(im.size)
        resized = im.resize((round(im.width * scale), round(im.height * scale)), Image.Resampling.BICUBIC)
        left = (resized.width-size)//2; top = (resized.height-size)//2
        pixels = np.asarray(resized.crop((left, top, left+size, top+size)), dtype=np.float32) / 255
        pixels = (pixels - self.visual_config["image_mean"]) / self.visual_config["image_std"]
        vector = self.visual.run(None, {"pixel_values": pixels.transpose(2, 0, 1)[None].astype(np.float32)})[0][0]
        vector /= max(float(np.linalg.norm(vector)), 1e-8)
        similarities = self.visual_text @ vector
        political = float(np.max(similarities[:10])); ordinary = float(np.max(similarities[10:]))
        margin = political - ordinary
        # This is evidence, not a calibrated probability or face identification.
        strong = political >= .24 and margin >= .035
        uncertain = political >= .21 and margin >= -.015 and not strong
        result = {"visualScore": .9 if strong else .45 if uncertain else 0.0,
                  "visualMargin": margin,
                  "visualUncertain": uncertain, "visualLabel": self.visual_labels[int(np.argmax(similarities))]}
        self.visual_cache[key] = result
        if len(self.visual_cache) > 128: self.visual_cache.popitem(last=False)
        return dict(result)

    def fuse(self, results, context=""):
        texts = [str(context or "")[:6000]] + [r.get("text", "") for r in results]
        combined = self.classify("\n".join(texts))
        combined["score"] = max([combined["score"]] + [r.get("score", 0) for r in results])
        combined["complete"] = all(r.get("complete", False) for r in results)
        # Keep the visual model's explicit strong/uncertain signal when frames
        # are fused with speech and OCR. Otherwise the extension sees only a
        # generic score and can never use visual evidence for a silent Reel.
        combined["visualScore"] = max([r.get("visualScore", 0) for r in results] or [0])
        combined["visualUncertain"] = any(r.get("visualUncertain", False) for r in results)
        combined["evidenceSources"] = len(results) + bool(context)
        return combined

    def classify(self, text):
        text = str(text or "").strip()[:6000]
        if len(text) < 8:
            return {"score": 0.0, "text": text, "complete": True}
        if self.semantic is None:
            raise RuntimeError("Models are not loaded")
        key = hashlib.sha256(text.encode()).hexdigest()
        if key in self.cache:
            self.cache.move_to_end(key)
            return dict(self.cache[key])
        # Disambiguate the mechanical component for the language model. Keep
        # every other word and return the original evidence; a political claim
        # elsewhere in the item must still be evaluated.
        model_text = re.sub(r"\b(?:engine governors?|governors? for (?:this |the |a |an )?(?:small |diesel |steam |gas |gasoline )?engines?)\b", "engine speed controller", text, flags=re.I)
        # Expand the ordinary career idiom instead of allowing the short word
        # 'pro' to acquire a political meaning. Preserve all surrounding claims.
        model_text = re.sub(r"\bgo pro\b(?![-–—]|\s+(?:choice|life|government|abortion|Palestin|Israel))", "become a professional athlete", model_text, flags=re.I)
        # Each window is scored independently so ordinary filler cannot dilute politics.
        hypotheses = ["This text discusses politics, politicians, elections, government policy or political advocacy.",
                      "This text expresses an opinion about political ideology, public policy or a political controversy.",
                      "This text discusses political protests, demands for government funding, or state repression."]
        scores = []
        for start in range(0, min(len(model_text), 6000), 1000):
            window = model_text[max(0, start - 150):start + 1150]
            for hypothesis in hypotheses:
                enc = self.tokenizer.encode(window, hypothesis)
                arrays = {"input_ids": np.asarray([enc.ids], dtype=np.int64), "attention_mask": np.asarray([enc.attention_mask], dtype=np.int64), "token_type_ids": np.asarray([enc.type_ids], dtype=np.int64)}
                logits = self.semantic.run(None, {i.name: arrays[i.name] for i in self.semantic.get_inputs()})[0][0]
                probabilities = np.exp(logits - np.max(logits)); probabilities /= probabilities.sum()
                scores.append(float(probabilities[self.entailment]))
        result = {"score": max(scores), "text": text, "complete": True}
        self.cache[key] = result
        if len(self.cache) > 256:
            self.cache.popitem(last=False)
        return dict(result)

    def image(self, data, context="", visual=True):
        context = str(context or "")[:6000]
        key = hashlib.sha256(data + context.encode() + bytes([bool(visual)])).hexdigest()
        if key in self.image_cache:
            self.image_cache.move_to_end(key)
            return dict(self.image_cache[key])
        self.ensure_model("ocr")
        with Image.open(io.BytesIO(data)) as im:
            if im.width * im.height > 16_000_000:
                raise ValueError("Image dimensions too large")
            im.load()
            im = im.convert("RGB")
            im.thumbnail((1800, 1800))
            # Feed thumbnails can contain tiny screenshot text. OCR gets a
            # larger view; scene classification still sees the original pixels.
            scale = max(1.0, min(3.0, 736 / min(im.size)))
            ocr_image = im.resize((round(im.width * scale), round(im.height * scale)), Image.Resampling.LANCZOS)
            rows = []
            if max(ocr_image.size) > 960:
                # A bounded overview preserves whole-line reading order; tiles
                # then recover small text without replacing that context.
                overview = ocr_image.copy()
                overview.thumbnail((960, 960))
                found, _ = self.ocr(np.asarray(overview))
                rows.extend(found or [])
            # RapidOCR's default shortest-edge enlargement can turn a narrow
            # banner into a huge tensor. Overlap bounded tiles instead, keeping
            # all pixels and enough shared context for words at tile edges.
            for top in range(0, ocr_image.height, 832):
                for left in range(0, ocr_image.width, 832):
                    tile = ocr_image.crop((left, top, min(left+960, ocr_image.width), min(top+960, ocr_image.height)))
                    found, _ = self.ocr(np.asarray(tile))
                    rows.extend(found or [])
            evidence = self.visual_evidence(im) if visual else {"visualScore": 0, "visualUncertain": False}
            # A centre crop can miss a partly obscured campaign sign near an
            # edge. Inspect at most two lower regions only when the full image
            # already leans political. Require a strong second view before
            # turning an uncertain scene into a removal.
            if (visual and evidence["visualUncertain"] and
                    evidence["visualMargin"] >= .015 and
                    evidence["visualLabel"] in self.visual_labels[:10]):
                w, h = im.size
                for bounds in ((int(w * .4), int(h * .43), w, h),
                               (0, int(h * .43), int(w * .6), h)):
                    second = self.visual_evidence(im.crop(bounds))
                    if second["visualScore"] >= .85 and not second["visualUncertain"]:
                        evidence = second
                        break
        text = " ".join(dict.fromkeys(row[1] for row in rows or [] if row[2] >= .5))
        result = self.fuse([self.classify(text)], context)
        result["score"] = max(result["score"], evidence["visualScore"])
        # Ambiguous scenes remain held in maximum protection; context may resolve them.
        result["complete"] = not evidence["visualUncertain"] or result["score"] >= .85
        result.update(evidence)
        # Deterministic uncertainty is still uncertainty, but rerunning identical
        # pixels/context cannot resolve it. Cache evidence, never a safe verdict.
        self.image_cache[key] = dict(result)
        if len(self.image_cache) > 128: self.image_cache.popitem(last=False)
        return result

    def media(self, data, live=False, context="", visual=True):
        import av
        # Decode incrementally: never allocate an unbounded stream from a small file.
        samples = []
        complete = True
        with av.open(io.BytesIO(data)) as container:
            streams = list(container.streams.audio)
            if streams:
                resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
                total = 0
                for frame in container.decode(audio=0):
                    for converted in resampler.resample(frame):
                        total += converted.samples
                        if total > 120 * 16000:
                            complete = False
                            break
                        samples.append(converted.to_ndarray().flatten().astype(np.float32) / 32768)
                    if not complete:
                        break
            elif live:
                raise ValueError("No audio track")
        texts = []; evidence = []
        if samples:
            audio = np.concatenate(samples)
            # Thirty-second windows overlap by two seconds to catch boundary phrases.
            for start in range(0, len(audio), 28 * 16000):
                chunk = audio[start:start + 30 * 16000]
                chunk_key = hashlib.sha256(chunk.tobytes()).hexdigest()
                if chunk_key in self.speech_cache:
                    transcript = self.speech_cache[chunk_key]
                    self.speech_cache.move_to_end(chunk_key)
                else:
                    self.ensure_model("speech")
                    segments, _ = self.whisper.transcribe(chunk, beam_size=1, vad_filter=True, condition_on_previous_text=False)
                    transcript = " ".join(segment.text for segment in segments)
                    self.speech_cache[chunk_key] = transcript
                    if len(self.speech_cache) > 64: self.speech_cache.popitem(last=False)
                texts.append(transcript); evidence.append(self.classify(transcript))
        if not live:
            with av.open(io.BytesIO(data)) as container:
                if container.streams.video:
                    last = -2.0
                    for number, frame in enumerate(container.decode(video=0)):
                        if number >= 7200:
                            complete = False; break
                        stamp = float(frame.time or 0)
                        if stamp > 120:
                            complete = False; break
                        if stamp - last >= 2 or frame.key_frame:
                            last = stamp
                            im = frame.to_image(); im.thumbnail((1280, 1280))
                            buf = io.BytesIO(); im.save(buf, format="PNG")
                            finding = self.image(buf.getvalue(), context=context, visual=visual)
                            evidence.append(finding); texts.append(finding["text"])
        result = self.fuse(evidence, context)
        result["complete"] = complete and result["complete"]
        result["speechDetected"] = bool(samples and texts)
        result["videoSamplingSeconds"] = 2 if not live else None
        return result


def create_app(analyzer, token, extension_ids):
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    gate = threading.BoundedSemaphore(2)
    allowed = {"chrome-extension://" + identity for identity in extension_ids}

    def origin_allowed(origin):
        if origin in allowed:
            return True
        # Unpacked installations get path-derived IDs. With no pinned ID,
        # accept valid Chrome extension origins; inference still needs the private pairing token.
        return not extension_ids and bool(
            origin and re.fullmatch(r"chrome-extension://[a-p]{32}", origin))

    @app.middleware("http")
    async def protect(request, call_next):
        if request.headers.get("host") not in {"127.0.0.1:8765", "localhost:8765", "testserver"}:
            return JSONResponse({"error": "Invalid host"}, status_code=403)
        origin = request.headers.get("origin")
        if origin and not origin_allowed(origin):
            return JSONResponse({"error": "Origin not allowed"}, status_code=403)
        if request.method == "OPTIONS":
            if not origin or not origin_allowed(origin):
                return JSONResponse({"error": "Origin not allowed"}, status_code=403)
            return JSONResponse({}, headers={"Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, GET", "Access-Control-Allow-Headers": "Authorization, Content-Type"})
        if not secrets.compare_digest(request.headers.get("authorization", ""), "Bearer " + token):
            return JSONResponse({"error": "Pairing token required"}, status_code=401)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        if origin:
            response.headers["Access-Control-Allow-Origin"] = origin
        return response

    @app.get("/health")
    def health():
        components = {"ocr": analyzer.ocr is not None, "semantic": analyzer.semantic is not None,
                      "speech": analyzer.whisper is not None, "visual": analyzer.visual is not None}
        return {"ready": components["semantic"], "serviceAvailable": True, "components": components, "version": "0.6.15", "protocol": 2,
                "features": ["ocr", "semantic", "speech", "video-frames", "visual", "context-fusion"], "localOnly": True,
                "limits": {"clipSeconds": 120, "frameIntervalSeconds": 2, "speechOverlapSeconds": 2}}

    @app.post("/control")
    async def control(request: Request):
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 1024:
                raise HTTPException(413, "Control payload too large")
        try:
            payload = json.loads(body)
        except (ValueError, UnicodeDecodeError):
            raise HTTPException(400, "Invalid control payload")
        action = payload.get("action") if isinstance(payload, dict) else None
        if not isinstance(action, str) or action not in {"start", "stop"}:
            raise HTTPException(400, "Unsupported Companion action")
        import asyncio
        try:
            if action == "start":
                await asyncio.to_thread(analyzer.load)
            else:
                await asyncio.to_thread(analyzer.unload)
        except Exception:
            raise HTTPException(503, "Local models could not change state")
        return {"ok": True, "ready": analyzer.ready, "action": action}

    @app.post("/analyze")
    async def analyze(request: Request):
        size = 0; chunks = []
        async for chunk in request.stream():
            size += len(chunk)
            if size > MAX_BYTES * 4 // 3 + 8192:
                raise HTTPException(413, "Payload too large")
            chunks.append(chunk)
        try:
            payload = json.loads(b"".join(chunks))
            kind = payload.get("kind")
            if kind not in {"text", "image", "media", "live-audio"}:
                raise ValueError("Unsupported kind")
            if not analyzer.ready:
                raise HTTPException(503, "Local Companion is stopped")
            data = None
            if kind != "text":
                data = base64.b64decode(payload.get("data", ""), validate=True)
                if not data or len(data) > (10 * 1024 * 1024 if kind == "image" else MAX_BYTES):
                    raise ValueError("Invalid payload size")
            if not gate.acquire(blocking=False):
                raise HTTPException(429, "Analysis queue busy")
            try:
                # Offload CPU work without blocking FastAPI's event loop.
                import asyncio
                def infer():
                    with analyzer.lock:
                        # Stop may have unloaded models while this job waited.
                        if not analyzer.ready:
                            raise HTTPException(503, "Local Companion is stopped")
                        analyzer.release_idle_models()
                        if kind == "text": return analyzer.classify(payload.get("text", ""))
                        if kind == "image": return analyzer.image(data, context=payload.get("context", ""), visual=payload.get("visual", True))
                        return analyzer.media(data, live=kind == "live-audio", context=payload.get("context", ""), visual=payload.get("visual", True))
                result = await asyncio.to_thread(infer)
                result["protocol"] = 2
                return result
            finally:
                gate.release()
        except HTTPException:
            raise
        except Exception:
            # Decoder/model errors must never return uploaded content or file paths.
            raise HTTPException(422, "Analysis unavailable or unsupported media")
    return app


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--extension-id", action="append", default=[])
    args = parser.parse_args()
    token_path = ROOT / "pairing-token.txt"
    if not token_path.exists(): token_path.write_text(secrets.token_urlsafe(32))
    token = token_path.read_text().strip()
    if len(token) < 32: raise SystemExit("Invalid pairing token")
    analyzer = Analyzer()
    print("Politifree Companion control service started. Models load when enabled in the extension.", flush=True)
    import uvicorn
    uvicorn.run(create_app(analyzer, token, args.extension_id), host="127.0.0.1", port=8765, access_log=False, log_level="warning")
