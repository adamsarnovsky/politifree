"""Derive fixed visual vectors from the pinned local model, without downloads."""
import hashlib
import json
from pathlib import Path
from server import Analyzer, VISUAL_LABELS


def build(root=None):
    analyzer = Analyzer() if root is None else Analyzer(root)
    vectors = analyzer._encode_visual_references()
    artifact = {"format": 1, "labels": VISUAL_LABELS,
                "sources": analyzer._visual_reference_sources(), "vectors": vectors.tolist()}
    path = analyzer.root / "visual/reference-vectors.json"
    path.write_text(json.dumps(artifact, separators=(",", ":")) + "\n", encoding="utf-8")
    # The bundled installer checks derived vectors just like the original weights.
    manifest_path = Path(__file__).with_name("model-manifest.json")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["models/visual/reference-vectors.json"] = {
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "bytes": path.stat().st_size}
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"file": str(path), "shape": list(vectors.shape), "bytes": path.stat().st_size}))


if __name__ == "__main__":
    build()
