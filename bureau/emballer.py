"""Prépare des archives de téléchargement sans mélanger les plateformes."""
from pathlib import Path
import sys
import zipfile
source=Path(sys.argv[1]);target=Path(sys.argv[2]);target.mkdir(parents=True,exist_ok=True)
for folder, name in [('Marceau-USB-ubuntu-latest','Marceau-USB-Linux'),('Marceau-USB-windows-latest','Marceau-USB-Windows'),('Marceau-USB-macos-latest','Marceau-USB-macOS'),('Marceau-Local-Android-Samsung','Marceau-Local-Android')]:
    root=source/folder
    if not root.is_dir():raise SystemExit('Artefact manquant : '+folder)
    with zipfile.ZipFile(target/(name+'.zip'),'w',zipfile.ZIP_DEFLATED) as archive:
        for file in root.rglob('*'):
            if file.is_file():archive.write(file,name+'/'+file.relative_to(root).as_posix())
