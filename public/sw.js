// Service worker de Marceau (version web installable).
// Il ne garde en cache QUE les fichiers du site lui-même (même origine), pour que l'appli
// s'ouvre même hors ligne. Les requêtes vers les IA (autres origines, avec la clé API) ne
// passent JAMAIS par ce cache : elles vont directement du navigateur au fournisseur.
const CACHE = 'marceau-v1';

// Dès l'installation, on met en cache la page d'accueil ET les fichiers qu'elle charge (scripts,
// styles, icônes). Sans ça, à la première visite la page est déjà chargée avant que le service
// worker la contrôle : le cache resterait vide et l'appli installée ne s'ouvrirait pas hors ligne.
const BASE = ['/', '/manifest.json', '/favicon.ico', '/icones/icone-192.png', '/icones/icone-512.png'];

async function precharger() {
  const cache = await caches.open(CACHE);
  const accueil = await fetch('/', { cache: 'no-cache' });
  const html = await accueil.clone().text();
  await cache.put('/', accueil);
  // Fichiers référencés par la page (le nom des scripts change à chaque version).
  const refs = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map((m) => m[1]);
  const urls = [...new Set([...BASE.slice(1), ...refs])];
  await Promise.all(urls.map((u) => cache.add(u).catch(() => {})));
}

self.addEventListener('install', (e) => {
  e.waitUntil(precharger().catch(() => {}).then(() => self.skipWaiting()));
});

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
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Vérification de mise à jour (« /?maj=… ») : toujours le réseau, jamais gardée en cache.
  if (url.searchParams.has('maj')) return;
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
