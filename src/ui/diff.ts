/** Comparaison ligne par ligne (pour voir ce que l'IA a changé dans un fichier). */

export type LigneDiff = { type: 'egal' | 'ajout' | 'retrait'; texte: string };

const MAX_CELLULES = 4_000_000;

/** Différences entre deux versions d'un fichier (algorithme LCS). */
export function diffLignes(ancien: string, nouveau: string): LigneDiff[] {
  const a = ancien === '' ? [] : ancien.split('\n');
  const b = nouveau === '' ? [] : nouveau.split('\n');
  // On retire le début et la fin identiques (rapide et courant)
  let debut = 0;
  while (debut < a.length && debut < b.length && a[debut] === b[debut]) debut++;
  let finA = a.length;
  let finB = b.length;
  while (finA > debut && finB > debut && a[finA - 1] === b[finB - 1]) {
    finA--;
    finB--;
  }
  const milieuA = a.slice(debut, finA);
  const milieuB = b.slice(debut, finB);
  const avant: LigneDiff[] = a.slice(0, debut).map((texte) => ({ type: 'egal', texte }));
  const apres: LigneDiff[] = a.slice(finA).map((texte) => ({ type: 'egal', texte }));

  const n = milieuA.length;
  const m = milieuB.length;
  let milieu: LigneDiff[];
  if (n * m > MAX_CELLULES) {
    // Trop gros : on montre tout l'ancien retiré puis tout le nouveau ajouté
    milieu = [
      ...milieuA.map((texte) => ({ type: 'retrait' as const, texte })),
      ...milieuB.map((texte) => ({ type: 'ajout' as const, texte })),
    ];
  } else {
    const t = new Uint32Array((n + 1) * (m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        t[i * (m + 1) + j] =
          milieuA[i] === milieuB[j]
            ? t[(i + 1) * (m + 1) + j + 1] + 1
            : Math.max(t[(i + 1) * (m + 1) + j], t[i * (m + 1) + j + 1]);
      }
    }
    milieu = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (milieuA[i] === milieuB[j]) {
        milieu.push({ type: 'egal', texte: milieuA[i] });
        i++;
        j++;
      } else if (t[(i + 1) * (m + 1) + j] >= t[i * (m + 1) + j + 1]) {
        milieu.push({ type: 'retrait', texte: milieuA[i++] });
      } else {
        milieu.push({ type: 'ajout', texte: milieuB[j++] });
      }
    }
    while (i < n) milieu.push({ type: 'retrait', texte: milieuA[i++] });
    while (j < m) milieu.push({ type: 'ajout', texte: milieuB[j++] });
  }
  return [...avant, ...milieu, ...apres];
}

export function statsDiff(ancien: string, nouveau: string) {
  let ajouts = 0;
  let retraits = 0;
  for (const l of diffLignes(ancien, nouveau)) {
    if (l.type === 'ajout') ajouts++;
    else if (l.type === 'retrait') retraits++;
  }
  return { ajouts, retraits };
}

/** Garde seulement les lignes changées et quelques lignes autour (comme « git diff »). */
export function avecContexte(lignes: LigneDiff[], contexte = 3): (LigneDiff | { type: 'saut'; texte: string })[] {
  const garder = new Array(lignes.length).fill(false);
  lignes.forEach((l, i) => {
    if (l.type !== 'egal') for (let k = Math.max(0, i - contexte); k <= Math.min(lignes.length - 1, i + contexte); k++) garder[k] = true;
  });
  const resultat: (LigneDiff | { type: 'saut'; texte: string })[] = [];
  let saut = 0;
  lignes.forEach((l, i) => {
    if (garder[i]) {
      if (saut) resultat.push({ type: 'saut', texte: `… ${saut} ligne${saut > 1 ? 's' : ''} identique${saut > 1 ? 's' : ''}` });
      saut = 0;
      resultat.push(l);
    } else saut++;
  });
  if (saut) resultat.push({ type: 'saut', texte: `… ${saut} ligne${saut > 1 ? 's' : ''} identique${saut > 1 ? 's' : ''}` });
  return resultat;
}
