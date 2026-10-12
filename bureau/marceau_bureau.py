"""Marceau : interface commune servie localement et moteur llama.cpp embarqué."""
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import hashlib
import os
import secrets
import shutil
import sys
import threading
import urllib.request
import urllib.parse
import webbrowser

BUNDLE = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent))
CATALOGUE = json.loads((BUNDLE/'modeles-locaux.json').read_text(encoding='utf-8'))
MODELES = {m['id']: m for m in CATALOGUE}

class Moteur:
    def __init__(self, folder):
        self.folder = Path(folder)
        self.states = {}
        self.lock = threading.Lock()
        self.download_lock = threading.Lock()
        self.context = None
        self.loaded = None
    def path(self, id):
        if id not in MODELES: raise ValueError('Modèle inconnu.')
        return self.folder/(id+'.gguf')
    def ready(self, id):
        path=self.path(id)
        try:
            if path.stat().st_size != MODELES[id]['taille']: return False
            with path.open('rb') as f: return f.read(4)==b'GGUF'
        except OSError: return False
    def snapshot(self):
        return {'dossier':str(self.folder),'etats':{id:self.states.get(id,{'phase':'pret' if self.ready(id) else 'absent','progression':1 if self.ready(id) else 0,'message':'Prêt hors ligne.' if self.ready(id) else 'Modèle à installer.'}) for id in MODELES}}
    def install(self, id):
        spec=MODELES[id]
        if self.ready(id): return
        if not self.download_lock.acquire(blocking=False): raise ValueError('Un modèle est déjà en cours de téléchargement.')
        self.states[id]={'phase':'telechargement','progression':0,'message':'Téléchargement en cours…'}
        threading.Thread(target=self._download,args=(id,spec),daemon=True).start()
    def _download(self,id,spec):
        part=self.path(id).with_suffix('.part')
        try:
            self.folder.mkdir(parents=True,exist_ok=True)
            if shutil.disk_usage(self.folder).free < spec['taille']+300_000_000: raise ValueError('Espace libre insuffisant pour ce modèle et 300 Mo supplémentaires.')
            request=urllib.request.Request(spec['url'],headers={'User-Agent':'Marceau-local/1.0'})
            digest=hashlib.sha256(); written=0
            with urllib.request.urlopen(request,timeout=60) as response, part.open('wb') as f:
                while True:
                    chunk=response.read(1024*1024)
                    if not chunk: break
                    f.write(chunk);digest.update(chunk);written+=len(chunk)
                    if written>spec['taille']: raise ValueError('Taille de modèle invalide.')
                    self.states[id]={'phase':'telechargement','progression':written/spec['taille'],'message':'Téléchargement en cours…'}
            if written!=spec['taille'] or digest.hexdigest()!=spec['sha256']: raise ValueError('Téléchargement incomplet ou empreinte différente. Réessaie.')
            with part.open('rb') as f:
                if f.read(4)!=b'GGUF': raise ValueError('Format de modèle invalide.')
            part.replace(self.path(id))
            self.states[id]={'phase':'pret','progression':1,'message':'Installé. Prêt sans Internet.'}
        except Exception as e:
            part.unlink(missing_ok=True)
            self.states[id]={'phase':'erreur','progression':0,'message':str(e)}
        finally:self.download_lock.release()
    def generate(self,id,messages,max_tokens):
        if not self.lock.acquire(blocking=False): raise ValueError('L’IA termine déjà une réponse.')
        try:
            if not self.ready(id): raise ValueError('Installe le modèle dans Réglages IA.')
            if self.loaded!=id:
                if self.context:self.context.close();self.context=None
                from llama_cpp import Llama
                self.context=Llama(model_path=str(self.path(id)),n_ctx=4096,n_threads=min(4,os.cpu_count() or 2),n_gpu_layers=0,chat_format='chatml',verbose=False)
                self.loaded=id
            result=self.context.create_chat_completion(messages=messages,max_tokens=min(1024,max(128,max_tokens)),temperature=0.6,stream=True)
            for item in result:
                text=item['choices'][0].get('delta',{}).get('content','')
                if text:yield text
        finally:self.lock.release()
    def set_folder(self,folder):
        if self.download_lock.locked() or not self.lock.acquire(blocking=False): raise ValueError('Attends la fin de l’opération en cours.')
        try:
            new=Path(folder).expanduser()
            if not new.is_absolute():raise ValueError('Indique un chemin complet, par exemple E:\\modeles ou /media/…/modeles.')
            new.mkdir(parents=True,exist_ok=True)
            probe=new/('.marceau-test-'+secrets.token_hex(6))
            with probe.open('x') as f:f.write('ok')
            probe.unlink()
            if self.context:self.context.close();self.context=None
            self.loaded=None;self.folder=new;self.states={}
        finally:self.lock.release()

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def json_response(self,content,status=200):
        data=json.dumps(content,ensure_ascii=False).encode()
        self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
    def authorised(self):
        origin=self.headers.get('Origin')
        expected=f'http://127.0.0.1:{self.server.server_port}'
        return self.headers.get('Host')==f'127.0.0.1:{self.server.server_port}' and self.headers.get('X-Marceau-Token')==self.server.token and (not origin or origin==expected)
    def do_GET(self):
        if self.headers.get('Host')!=f'127.0.0.1:{self.server.server_port}':self.send_error(403);return
        path=urllib.parse.urlsplit(self.path).path
        if path.startswith('/api/'):
            if not self.authorised():self.json_response({'error':'Accès refusé.'},403);return
            if path=='/api/local/etat':self.json_response(self.server.engine.snapshot());return
            self.json_response({'error':'Route inconnue.'},404);return
        try:
            candidate=(self.server.web/urllib.parse.unquote(path).lstrip('/')).resolve()
            candidate.relative_to(self.server.web.resolve())
            if candidate.is_dir():candidate=candidate/'index.html'
            if not candidate.is_file():self.send_error(404);return
            data=candidate.read_bytes()
            if candidate.name=='index.html':
                script='<script>window.__MARCEAU_BUREAU__='+json.dumps({'token':self.server.token})+';</script>'
                data=data.replace(b'</head>',script.encode()+b'</head>')
            import mimetypes
            self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(str(candidate))[0] or 'application/octet-stream');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
        except (ValueError,OSError):self.send_error(404)
    def do_POST(self):
        if not self.authorised():self.json_response({'error':'Accès refusé.'},403);return
        try:
            size=int(self.headers.get('Content-Length','0'))
            if size<=0 or size>20*1024*1024:self.json_response({'error':'Requête trop grande.'},400);return
            body=json.loads(self.rfile.read(size))
            if not isinstance(body,dict):raise ValueError('Requête invalide.')
            route=urllib.parse.urlsplit(self.path).path
            if route.startswith('/api/local/stockage/'):
                key=body.get('cle')
                if not isinstance(key,str) or not key.startswith('marceau:') or len(key)>200:raise ValueError('Clé de stockage invalide.')
                target=self.server.data/('etat-'+hashlib.sha256(key.encode()).hexdigest()+'.json')
                if route.endswith('/lire'):
                    self.json_response({'valeur':target.read_text(encoding='utf-8') if target.is_file() else None});return
                if route.endswith('/ecrire'):
                    value=body.get('valeur')
                    if not isinstance(value,str):raise ValueError('Valeur invalide.')
                    json.loads(value)
                    self.server.data.mkdir(parents=True,exist_ok=True)
                    temporary=target.with_suffix('.'+secrets.token_hex(6)+'.tmp')
                    temporary.write_text(value,encoding='utf-8');temporary.replace(target)
                    self.json_response({'ok':True});return
                if route.endswith('/effacer'):
                    target.unlink(missing_ok=True);self.json_response({'ok':True});return
                self.json_response({'error':'Route inconnue.'},404);return
            if route=='/api/local/installer':
                self.server.engine.install(body['modele']);self.json_response({'ok':True});return
            if route=='/api/local/dossier':
                self.server.engine.set_folder(body['dossier']);self.server.save_configuration();self.json_response(self.server.engine.snapshot());return
            if route=='/api/local/generer':
                id=body['modele'];messages=body['messages']
                if id not in MODELES or not isinstance(messages,list) or len(messages)>100:raise ValueError('Conversation invalide.')
                for m in messages:
                    if not isinstance(m,dict) or m.get('role') not in ('system','user','assistant') or not isinstance(m.get('content'),str):raise ValueError('Message invalide.')
                self.send_response(200);self.send_header('Content-Type','application/x-ndjson; charset=utf-8');self.send_header('Connection','close');self.end_headers();self.close_connection=True
                text=''
                try:
                    for chunk in self.server.engine.generate(id,messages,int(body.get('maxTokens',768))):
                        text+=chunk;self.wfile.write((json.dumps({'text':text})+'\n').encode());self.wfile.flush()
                    self.wfile.write((json.dumps({'text':text,'done':True})+'\n').encode())
                except (BrokenPipeError,ConnectionResetError):pass
                except Exception as e:
                    self.wfile.write((json.dumps({'error':str(e)})+'\n').encode())
                return
            self.json_response({'error':'Route inconnue.'},404)
        except (ValueError,KeyError,OSError) as e:self.json_response({'error':str(e)},400)

def main():
    base=Path(sys.executable).resolve().parent if getattr(sys,'frozen',False) else Path(__file__).resolve().parent
    data_dir=base/'donnees'
    try:data_dir.mkdir(exist_ok=True)
    except OSError:data_dir=Path.home()/'.marceau';data_dir.mkdir(parents=True,exist_ok=True)
    config_path=data_dir/'bureau.json'
    try:config=json.loads(config_path.read_text(encoding='utf-8'))
    except (OSError,ValueError):config={}
    folder=Path(config.get('modeles',str(base/'modeles')))
    if config.get('modelesRelatif'):folder=base/folder
    try:folder.mkdir(parents=True,exist_ok=True)
    except OSError:folder=Path.home()/'.marceau/modeles';folder.mkdir(parents=True,exist_ok=True)
    # Une origine stable garde les projets et réglages du navigateur entre les lancements.
    port=int(config.get('port',32178))
    server=ThreadingHTTPServer(('127.0.0.1',port),Handler)
    server.data=data_dir
    server.token=secrets.token_urlsafe(32);server.engine=Moteur(folder);server.web=BUNDLE/'web'
    if not (server.web/'index.html').is_file():raise RuntimeError('Interface absente : exporter Marceau pour le web avant de construire le paquet.')
    def save_configuration():
        temporary=config_path.with_suffix('.tmp')
        try:model_path=str(server.engine.folder.relative_to(base));relative=True
        except ValueError:model_path=str(server.engine.folder);relative=False
        temporary.write_text(json.dumps({'port':server.server_port,'modeles':model_path,'modelesRelatif':relative}),encoding='utf-8')
        temporary.replace(config_path)
    server.save_configuration=save_configuration
    save_configuration()
    print('Marceau est ouvert dans ton navigateur. Ferme cette fenêtre de terminal pour arrêter le moteur.',flush=True)
    print('Modèles :',server.engine.folder,flush=True)
    webbrowser.open(f'http://127.0.0.1:{server.server_port}')
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()

if __name__=='__main__':main()
