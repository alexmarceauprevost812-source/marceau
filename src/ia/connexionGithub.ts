/**
 * Connexion directe à GitHub (« Se connecter avec GitHub ») par le flux « appareil » d'OAuth :
 * Marceau affiche un code, la personne l'entre sur github.com/login/device et accepte,
 * puis Marceau reçoit un jeton. Aucun secret dans l'application : seul l'identifiant
 * public (Client ID) d'une « OAuth App » GitHub est nécessaire, avec « Device Flow » activé.
 * Docs : https://docs.github.com/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow
 */

/** Client ID public de l'OAuth App GitHub de Marceau (vide = connexion directe pas encore configurée). */
export const CLIENT_ID_GITHUB = '';

export const connexionDirectePossible = () => CLIENT_ID_GITHUB.trim() !== '';

export type CodeAppareil = {
  codeAppareil: string;
  codeUtilisateur: string;
  adresse: string;
  expireA: number;
  intervalle: number;
};

async function poster(url: string, champs: Record<string, string>) {
  const reponse = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: Object.entries(champs)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&'),
  });
  if (!reponse.ok) throw new Error(`GitHub a répondu ${reponse.status}. Réessaie plus tard.`);
  return (await reponse.json()) as Record<string, unknown>;
}

/** Étape 1 : demande un code à afficher à la personne. */
export async function demanderCode(): Promise<CodeAppareil> {
  const r = await poster('https://github.com/login/device/code', { client_id: CLIENT_ID_GITHUB, scope: 'repo' });
  if (typeof r.device_code !== 'string' || typeof r.user_code !== 'string') {
    throw new Error(String(r.error_description ?? 'GitHub n’a pas donné de code. Vérifie que « Device Flow » est activé.'));
  }
  return {
    codeAppareil: r.device_code,
    codeUtilisateur: r.user_code,
    adresse: typeof r.verification_uri === 'string' ? r.verification_uri : 'https://github.com/login/device',
    expireA: Date.now() + (Number(r.expires_in) || 900) * 1000,
    intervalle: Number(r.interval) || 5,
  };
}

const attendre = (ms: number, signal: AbortSignal) =>
  new Promise<void>((ok, echec) => {
    const t = setTimeout(ok, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      echec(Object.assign(new Error('Connexion annulée.'), { name: 'AbortError' }));
    });
  });

/** Étape 2 : attend que la personne accepte sur GitHub, puis renvoie le jeton d'accès. */
export async function attendreJeton(code: CodeAppareil, signal: AbortSignal): Promise<string> {
  let intervalle = code.intervalle;
  for (;;) {
    await attendre(intervalle * 1000, signal);
    if (Date.now() > code.expireA) throw new Error('Le code a expiré. Recommence la connexion.');
    const r = await poster('https://github.com/login/oauth/access_token', {
      client_id: CLIENT_ID_GITHUB,
      device_code: code.codeAppareil,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });
    if (typeof r.access_token === 'string' && r.access_token) return r.access_token;
    switch (r.error) {
      case 'authorization_pending':
        break;
      case 'slow_down':
        intervalle = Number(r.interval) || intervalle + 5;
        break;
      case 'expired_token':
        throw new Error('Le code a expiré. Recommence la connexion.');
      case 'access_denied':
        throw new Error('Connexion refusée sur GitHub.');
      default:
        throw new Error(String(r.error_description ?? r.error ?? 'Connexion à GitHub impossible.'));
    }
  }
}
