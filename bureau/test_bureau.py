import unittest
import tempfile
import threading
import urllib.request
import urllib.error
import json
from pathlib import Path
from http.server import ThreadingHTTPServer
from marceau_bureau import Moteur, Handler, MODELES

class Local(unittest.TestCase):
    def test_model_absent(self):
        with tempfile.TemporaryDirectory() as folder:
            engine=Moteur(folder)
            self.assertFalse(engine.ready('qwen3-1.7b'))
            with self.assertRaises(ValueError):next(engine.generate('qwen3-1.7b',[],128))
            self.assertFalse(engine.lock.locked())
    def test_unknown_model(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(ValueError):Moteur(folder).path('../ailleurs')
    def test_wrong_size(self):
        with tempfile.TemporaryDirectory() as folder:
            engine=Moteur(folder);engine.path('qwen3-4b').write_bytes(b'GGUFbad')
            self.assertFalse(engine.ready('qwen3-4b'))
    def test_usb_folder_choice(self):
        with tempfile.TemporaryDirectory() as folder:
            engine=Moteur(folder);engine.set_folder(str(Path(folder)/'usb/modeles'))
            self.assertEqual(engine.folder,Path(folder)/'usb/modeles')
    def test_loopback_access_token(self):
        with tempfile.TemporaryDirectory() as folder:
            server=ThreadingHTTPServer(('127.0.0.1',0),Handler);server.engine=Moteur(folder);server.token='test-token';server.data=Path(folder)
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            try:
                url=f'http://127.0.0.1:{server.server_port}/api/local/etat'
                with self.assertRaises(urllib.error.HTTPError) as error:urllib.request.urlopen(url)
                self.assertEqual(error.exception.code,403)
                request=urllib.request.Request(url,headers={'X-Marceau-Token':'test-token'})
                with urllib.request.urlopen(request) as response:self.assertEqual(json.load(response)['dossier'],folder)
                request=urllib.request.Request(url,headers={'X-Marceau-Token':'test-token','Origin':'https://example.com'})
                with self.assertRaises(urllib.error.HTTPError):urllib.request.urlopen(request)
            finally:server.shutdown();server.server_close()

if __name__=='__main__':unittest.main()
