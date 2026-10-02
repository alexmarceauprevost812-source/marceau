// Service worker de Marceau (version web installable).
// Il ne garde en cache QUE les fichiers du site lui-même (même origine), pour que l'appli
// s'ouvre même hors ligne. Les requêtes vers les IA (autres origines, avec la clé API) ne
// passent JAMAIS par ce cache : elles vont directement du navigateur au fournisseur.
//
// Chaque version du site a SON cache (« marceau-<script> »). Une mise à jour remplit un cache
// neuf sans toucher à celui de la version active ; l'ancien n'est supprimé qu'une fois la
// nouvelle version activée. Un échec en cours de route (connexion coupée, stockage plein…)
// laisse donc toujours l'ancienne version intacte et utilisable hors ligne.
const PREFIXE = 'marceau-';
// Petit cache qui retient le nom du cache de la version active (le service worker peut être
// arrêté et relancé entre deux événements : une simple variable serait perdue).
const ACTUEL = 'marceau-actuel';
const FACULTATIFS = ['/icones/icone-192.png', '/icones/icone-512.png'];

async function nomActuel() {
  const r = await (await caches.open(ACTUEL)).match('/nom');
  return r ? r.text() : null;
}

async function telecharger(url) {
  const rep = await fetch(url, { cache: 'no-cache' });
  if (!rep.ok) throw new Error(`${url} : ${rep.status}`);
  return rep;
}

// Dès l'installation, on met en cache la page d'accueil ET les fichiers qu'elle charge (script,
// manifeste, icône). Sans ça, à la première visite la page est déjà chargée avant que le service
// worker la contrôle : le cache resterait vide et l'appli installée ne s'ouvrirait pas hors ligne.
// Les fichiers indispensables sont « tout ou rien » : le moindre échec fait échouer
// l'installation, et le navigateur garde l'ancienne version en réessayant plus tard.
async function precharger() {
  const accueil = await telecharger('/');
  const html = await accueil.clone().text();
  // Fichiers référencés par la page (le nom du script change à chaque version).
  const refs = [...new Set([...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map((m) => m[1]))];
  const script = refs.find((u) => u.endsWith('.js'));
  if (!script) throw new Error('script principal introuvable dans la page');
  const indispensables = await Promise.all(refs.map(async (u) => [u, await telecharger(u)]));

  const nom = PREFIXE + script.split('/').pop();
  await caches.delete(nom); // repart d'un cache vide si une tentative précédente a échoué
  try {
    const cache = await caches.open(nom);
    await cache.put('/', accueil);
    await Promise.all(indispensables.map(([u, rep]) => cache.put(u, rep)));
  } catch (e) {
    await caches.delete(nom); // jamais de cache à moitié rempli
    throw e;
  }
  await Promise.all(FACULTATIFS.map(async (u) => (await caches.open(nom)).add(u).catch(() => {})));
  return nom;
}

self.addEventListener('install', (e) => {
  // Pas de .catch : un échec doit faire échouer l'installation.
  e.waitUntil(
    precharger()
      .then((nom) => caches.open(ACTUEL).then((c) => c.put('/prochain', new Response(nom))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const etat = await caches.open(ACTUEL);
      const prochain = await etat.match('/prochain');
      if (prochain) {
        await etat.put('/nom', new Response(await prochain.text()));
        await etat.delete('/prochain');
      }
      const garder = await nomActuel();
      // Supprime les caches des anciennes versions, seulement maintenant que la nouvelle est active.
      for (const c of await caches.keys()) {
        if (c !== ACTUEL && c !== garder) await caches.delete(c);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Vérification de mise à jour (« /?maj=… ») : toujours le réseau, jamais gardée en cache.
  if (url.searchParams.has('maj')) return;
  // Réseau d'abord (toujours la dernière version), cache seulement si hors ligne.
  // Pour la page elle-même : jamais le cache HTTP du navigateur (il pourrait rendre, hors ligne,
  // une page plus récente dont le script n'est pas disponible). Soit le réseau, soit notre copie.
  const navigation = req.mode === 'navigate';
  e.respondWith(
    fetch(req, navigation ? { cache: 'no-store' } : undefined)
      .then((rep) => {
        // La page d'accueil n'est mise en cache qu'à l'installation, avec son script : on ne la
        // remplace pas ici par une page plus récente dont le script ne serait pas en cache.
        if (rep.ok && !navigation) {
          const copie = rep.clone();
          nomActuel().then((nom) => nom && caches.open(nom).then((c) => c.put(req, copie)));
        }
        return rep;
      })
      .catch(() =>
        nomActuel().then(async (nom) => {
          const cache = nom ? await caches.open(nom) : null;
          return (
            (cache && ((await cache.match(req)) || (navigation && (await cache.match('/'))))) ||
            Response.error()
          );
        }),
      ),
  );
});
