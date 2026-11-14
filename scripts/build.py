"""Package only the public Chrome source. No credentials or local state."""
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root = Path(__file__).resolve().parents[1]
source = root / 'outputs/Politifree-Chrome'
version = json.loads((source / 'manifest.json').read_text())['version']
out = root / 'dist'; out.mkdir(exist_ok=True)
with ZipFile(out / f'politifree-{version}.zip', 'w', ZIP_DEFLATED) as archive:
    for path in sorted(source.iterdir()):
        if path.is_file() and path.suffix in {'.js','.json','.html','.css','.png'}:
            assert not any(word in path.name.lower() for word in ['token','secret','private'])
            archive.write(path, path.name)
print(f'Built dist/politifree-{version}.zip')
