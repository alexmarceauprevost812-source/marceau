// Service worker de Marceau (version web installable).
// Il ne garde en cache QUE les fichiers du site lui-même (même origine), pour que l'appli
// s'ouvre même hors ligne. Les requêtes vers les IA (autres origines, avec la clé API) ne
// passent JAMAIS par ce cache : elles vont directement du navigateur au fournisseur.
const CACHE = 'marceau-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // Réseau d'abord (toujours la dernière version), cache seulement si hors ligne.
  e.respondWith(
    fetch(req)
      .then((rep) => {
        if (rep.ok) {
          const copie = rep.clone();
          caches.open(CACHE).then((c) => c.put(req, copie));
        }
        return rep;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('/'))),
  );
});
