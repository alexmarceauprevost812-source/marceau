// Service worker de Marceau (version web installable).
// Il ne garde en cache QUE les fichiers du site lui-même (même origine), pour que l'appli
// s'ouvre même hors ligne. Les requêtes vers les IA (autres origines, avec la clé API) ne
// passent JAMAIS par ce cache : elles vont directement du navigateur au fournisseur.
const CACHE = 'marceau-v1';

// Dès l'installation, on met en cache la page d'accueil ET les fichiers qu'elle charge (scripts,
// manifeste, icône). Sans ça, à la première visite la page est déjà chargée avant que le service
// worker la contrôle : le cache resterait vide et l'appli installée ne s'ouvrirait pas hors ligne.
//
// Les fichiers indispensables sont « tout ou rien » : si l'un d'eux ne se télécharge pas
// (connexion coupée…), l'installation ÉCHOUE. Le navigateur réessaiera plus tard et garde, en
// attendant, l'ancien service worker et son cache qui marchaient — jamais un cache à moitié rempli.
const FACULTATIFS = ['/icones/icone-192.png', '/icones/icone-512.png'];

async function telecharger(url) {
  const rep = await fetch(url, { cache: 'no-cache' });
  if (!rep.ok) throw new Error(`${url} : ${rep.status}`);
  return rep;
}

async function precharger() {
  const accueil = await telecharger('/');
  const html = await accueil.clone().text();
  // Fichiers référencés par la page (le nom du script change à chaque version).
  const refs = [...new Set([...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map((m) => m[1]))];
  if (!refs.some((u) => u.endsWith('.js'))) throw new Error('script principal introuvable dans la page');
  const indispensables = await Promise.all(refs.map(async (u) => [u, await telecharger(u)]));
  // Tout est téléchargé : on peut maintenant remplir le cache.
  const cache = await caches.open(CACHE);
  await cache.put('/', accueil);
  await Promise.all(indispensables.map(([u, rep]) => cache.put(u, rep)));
  await Promise.all(FACULTATIFS.map((u) => cache.add(u).catch(() => {})));
}

self.addEventListener('install', (e) => {
  // Pas de .catch : un échec doit faire échouer l'installation.
  e.waitUntil(precharger().then(() => self.skipWaiting()));
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
