"""Check pinned dependencies before reusing an installed environment."""
import importlib
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
import struct
import sys


def dependency_errors(requirements, lookup=version):
    errors = []
    for line in requirements.splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        name, expected = line.split('==')
        try:
            actual = lookup(name)
        except PackageNotFoundError:
            errors.append(f'{name} is missing')
            continue
        if actual != expected:
            errors.append(f'{name}: expected {expected}, found {actual}')
    return errors


def main():
    if sys.version_info[:2] != (3, 12) or struct.calcsize('P') != 8:
        print('64-bit Python 3.12 is required.')
        return 1
    if sys.argv[1:] == ['--runtime-only']:
        return 0
    errors = dependency_errors(Path(__file__).with_name('requirements.txt').read_text())
    for module in ('fastapi', 'uvicorn', 'rapidocr_onnxruntime', 'faster_whisper',
                   'onnxruntime', 'tokenizers', 'PIL', 'huggingface_hub'):
        try:
            importlib.import_module(module)
        except Exception:
            errors.append(f'{module} could not be imported')
    for error in errors:
        print(error)
    return int(bool(errors))


if __name__ == '__main__':
    raise SystemExit(main())
