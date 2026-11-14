"""Check bundled weights without downloading or executing model repository code."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
manifest = json.loads((root / "model-manifest.json").read_text())
failed = []
for relative, expected in manifest.items():
    target = (root / relative).resolve()
    if not target.is_relative_to(root.resolve() / "models"):
        raise SystemExit("Invalid model manifest path")
    if not target.is_file() or target.stat().st_size != expected["bytes"]:
        failed.append(relative); continue
    with target.open("rb") as handle: actual = hashlib.file_digest(handle, "sha256").hexdigest()
    if actual != expected["sha256"]: failed.append(relative)
if failed:
    raise SystemExit("Missing or damaged model files: " + ", ".join(failed) + ". Extract the complete Companion 0.5.0 package again.")
print("Bundled text, speech and visual model files verified.")
