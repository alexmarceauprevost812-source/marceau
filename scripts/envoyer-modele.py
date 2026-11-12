#!/usr/bin/env python3
"""Envoie un modèle IA (.gguf) de l'ordinateur vers le téléphone, par le Wi-Fi.

Utilisation (sur l'ordinateur) :
    python3 scripts/envoyer-modele.py                      # liste ce qui est trouvé
    python3 scripts/envoyer-modele.py qwen2.5-coder:1.5b   # un modèle Ollama déjà sur l'ordi
    python3 scripts/envoyer-modele.py ~/Models/mon.gguf    # un fichier .gguf
    python3 scripts/envoyer-modele.py ~/Models             # tous les .gguf d'un dossier

Le script affiche un lien. Dans Marceau : Réglages → IA → « Modèle sur le téléphone (.gguf) »,
colle le lien dans « Télécharger ce lien ». Le téléphone et l'ordinateur doivent être sur le même Wi-Fi.
Ctrl+C pour arrêter. Aucune dépendance : Python 3 seulement.
"""
import http.server
import json
import os
import re
import socket
import sys
from pathlib import Path
from urllib.parse import quote, unquote

PORT = 8000
DOSSIERS_OLLAMA = [
    Path(os.environ.get("OLLAMA_MODELS", "")) if os.environ.get("OLLAMA_MODELS") else None,
    Path.home() / ".ollama" / "models",
    Path("/usr/share/ollama/.ollama/models"),
]


def adresse_ip():
    """Adresse de l'ordinateur sur le réseau local."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "IP-DE-L-ORDI"
    finally:
        s.close()


def nom_sur(texte):
    """Même règle que le téléphone : lettres, chiffres, point, tiret, souligné."""
    n = re.sub(r"[^\w.-]+", "-", texte).strip("-")
    return n if n.lower().endswith(".gguf") else n + ".gguf"


def modeles_ollama():
    """{ 'llama3.2:3b': (Path du fichier, nom .gguf) } pour les modèles Ollama de l'ordi."""
    trouves = {}
    for base in filter(None, DOSSIERS_OLLAMA):
        racine = base / "manifests" / "registry.ollama.ai"
        if not racine.is_dir():
            continue
        for fiche in racine.rglob("*"):
            if not fiche.is_file():
                continue
            rel = fiche.relative_to(racine).parts  # (espace, nom, tag)
            if len(rel) != 3:
                continue
            espace, nom, tag = rel
            try:
                couches = json.loads(fiche.read_text()).get("layers", [])
            except (OSError, ValueError):
                continue
            for c in couches:
                if c.get("mediaType") == "application/vnd.ollama.image.model":
                    blob = base / "blobs" / c["digest"].replace(":", "-")
                    ref = f"{nom}:{tag}" if espace == "library" else f"{espace}/{nom}:{tag}"
                    prefixe = "" if espace == "library" else f"{espace}-"
                    trouves[ref] = (blob, nom_sur(f"{prefixe}{nom}-{tag}"))
    return trouves


def gguf_dans(chemin):
    if chemin.is_dir():
        return sorted(chemin.glob("*.gguf"))
    return [chemin]


def taille(octets):
    return f"{octets / 1e9:.1f} Go" if octets >= 1e9 else f"{octets / 1e6:.0f} Mo"


class Service(http.server.BaseHTTPRequestHandler):
    fichiers = {}  # nom -> Path

    def log_message(self, fmt, *args):
        sys.stderr.write("  " + (fmt % args) + "\n")

    def do_GET(self):
        nom = unquote(self.path.split("?")[0].lstrip("/"))
        chemin = self.fichiers.get(nom)
        if not chemin:
            self.send_error(404, "Modèle introuvable")
            return
        total = chemin.stat().st_size
        debut, fin, code = 0, total - 1, 200
        m = re.match(r"bytes=(\d*)-(\d*)", self.headers.get("Range", ""))
        if m and (m.group(1) or m.group(2)):
            if m.group(1):
                debut = int(m.group(1))
                fin = int(m.group(2)) if m.group(2) else total - 1
            else:
                debut = max(0, total - int(m.group(2)))
            fin = min(fin, total - 1)
            code = 206
        self.send_response(code)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(fin - debut + 1))
        if code == 206:
            self.send_header("Content-Range", f"bytes {debut}-{fin}/{total}")
        self.end_headers()
        restant = fin - debut + 1
        try:
            with open(chemin, "rb") as f:
                f.seek(debut)
                while restant > 0:
                    bloc = f.read(min(1 << 20, restant))
                    if not bloc:
                        break
                    self.wfile.write(bloc)
                    restant -= len(bloc)
        except (BrokenPipeError, ConnectionResetError):
            pass


def main():
    ollama = modeles_ollama()
    args = sys.argv[1:]
    if not args:
        print("Modèles Ollama trouvés sur cet ordinateur :")
        for ref, (blob, _) in sorted(ollama.items()):
            if blob.exists():
                print(f"  {ref:40} {taille(blob.stat().st_size)}")
        if not ollama:
            print("  (aucun)")
        print("Utilisation :" + __doc__.split("Utilisation")[1].split("Le script")[0].split(":", 1)[1])
        return

    a_servir = {}
    for arg in args:
        if arg in ollama:
            blob, nom = ollama[arg]
            if not blob.is_file():
                sys.exit(f"Le fichier de {arg} est introuvable ou illisible : {blob}")
            a_servir[nom] = blob
            continue
        chemin = Path(arg).expanduser()
        if not chemin.exists():
            sys.exit(f"« {arg} » n'est ni un modèle Ollama de cet ordinateur, ni un fichier. "
                     "Lance le script sans argument pour voir la liste.")
        fichiers = gguf_dans(chemin)
        if not fichiers:
            sys.exit(f"Aucun fichier .gguf dans {chemin}")
        for f in fichiers:
            a_servir[nom_sur(f.name)] = f

    Service.fichiers = a_servir
    ip = adresse_ip()
    print(f"\nPrêt. Dans Marceau → Réglages → IA → Modèle sur le téléphone (.gguf) → « Télécharger ce lien » :\n")
    for nom, chemin in a_servir.items():
        print(f"  http://{ip}:{PORT}/{quote(nom)}    ({taille(chemin.stat().st_size)})")
    print("\nLe téléphone doit être sur le même Wi-Fi. Ctrl+C pour arrêter.\n")
    try:
        http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Service).serve_forever()
    except OSError as e:
        sys.exit(f"Impossible d'utiliser le port {PORT} : {e}")
    except KeyboardInterrupt:
        print("\nArrêté.")


if __name__ == "__main__":
    main()
