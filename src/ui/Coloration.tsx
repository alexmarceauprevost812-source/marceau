import { Text } from 'react-native';

import type { Couleurs } from '../theme';

type Genre = 'texte' | 'mot' | 'chaine' | 'commentaire' | 'nombre' | 'balise' | 'attribut' | 'fonction';

const MOTS_JS =
  'abstract as async await break case catch class const continue debugger default delete do else enum export extends false finally for from function get if implements import in instanceof interface let new null of package private protected public readonly return set static super switch this throw true try type typeof undefined var void while with yield';
const MOTS_PY =
  'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return self True try while with yield print';
const MOTS_AUTRES =
  'fun val var when object data sealed override suspend func let struct impl fn pub mut match use mod crate trait enum int float double char bool boolean string void long short byte select insert update delete from where join left right inner on group by order having create table into values and or not null primary key echo then fi done esac elif sudo apt';

const FAMILLES: Record<string, string> = {
  js: 'js', jsx: 'js', ts: 'js', tsx: 'js', javascript: 'js', typescript: 'js', json: 'js', mjs: 'js', cjs: 'js',
  py: 'py', python: 'py',
  html: 'html', xml: 'html', svg: 'html', vue: 'html',
  css: 'css', scss: 'css', less: 'css',
  sh: 'sh', bash: 'sh', shell: 'sh', zsh: 'sh', yaml: 'sh', yml: 'sh', toml: 'sh', dockerfile: 'sh',
};

export function familleDe(langage: string, chemin = ''): string {
  const ext = chemin.includes('.') ? chemin.split('.').pop()!.toLowerCase() : '';
  return FAMILLES[langage.toLowerCase()] ?? FAMILLES[ext] ?? 'autre';
}

function motsDe(famille: string): Set<string> {
  const liste = famille === 'py' ? MOTS_PY : famille === 'js' ? MOTS_JS : `${MOTS_JS} ${MOTS_PY} ${MOTS_AUTRES}`;
  return new Set(liste.split(' '));
}

type Jeton = { t: string; g: Genre };

/** Découpe du code en jetons colorés (léger, sans dépendance). */
export function jetons(code: string, langage: string, chemin = ''): Jeton[] {
  const famille = familleDe(langage, chemin);
  const mots = motsDe(famille);
  const commentaireLigne = famille === 'py' || famille === 'sh' ? '#[^\\n]*' : '\\/\\/[^\\n]*';
  const commentaire = famille === 'html' ? '<!--[\\s\\S]*?(?:-->|$)' : `\\/\\*[\\s\\S]*?(?:\\*\\/|$)|${commentaireLigne}`;
  // Groupes numérotés (pas de groupes nommés, pour la compatibilité avec Hermes)
  const regles: [Genre | 'ident', string][] = [
    ['commentaire', commentaire],
    ['chaine', '"(?:[^"\\\\\\n]|\\\\.)*"?|\'(?:[^\'\\\\\\n]|\\\\.)*\'?|`(?:[^`\\\\]|\\\\.)*`?'],
    ...(famille === 'html' ? ([['balise', '<\\/?[A-Za-z][\\w:-]*|\\/?>']] as [Genre, string][]) : []),
    ...(famille === 'html' || famille === 'css'
      ? ([['attribut', '[A-Za-z_-][\\w-]*(?=\\s*[=:])']] as [Genre, string][])
      : []),
    ['nombre', '\\b\\d[\\d_]*(?:\\.\\d+)?\\b'],
    ['fonction', '[A-Za-z_$][\\w$]*(?=\\s*\\()'],
    ['ident', '[A-Za-z_$][\\w$]*'],
  ];
  const re = new RegExp(regles.map(([, motif]) => `(${motif})`).join('|'), 'g');

  const resultat: Jeton[] = [];
  let dernier = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    if (m[0] === '') {
      re.lastIndex++;
      continue;
    }
    if (m.index > dernier) resultat.push({ t: code.slice(dernier, m.index), g: 'texte' });
    const i = regles.findIndex((_, k) => m![k + 1] !== undefined);
    const regle = regles[i]?.[0] ?? 'ident';
    let genre: Genre;
    if (regle === 'fonction') genre = mots.has(m[0]) ? 'mot' : 'fonction';
    else if (regle === 'ident') genre = famille !== 'html' && mots.has(m[0]) ? 'mot' : 'texte';
    else genre = regle;
    // Fusionne les jetons voisins de même genre (moins de <Text> à dessiner)
    const precedent = resultat[resultat.length - 1];
    if (precedent && precedent.g === genre) precedent.t += m[0];
    else resultat.push({ t: m[0], g: genre });
    dernier = m.index + m[0].length;
  }
  if (dernier < code.length) resultat.push({ t: code.slice(dernier), g: 'texte' });
  return resultat;
}

/** Code coloré, à placer dans un <Text> monospace. */
export function CodeColore({ code, langage, chemin, couleurs }: { code: string; langage: string; chemin?: string; couleurs: Couleurs }) {
  return (
    <>
      {jetons(code, langage, chemin).map((j, i) =>
        j.g === 'texte' ? (
          j.t
        ) : (
          <Text
            key={i}
            style={{
              color: couleurs.code[j.g],
              fontStyle: j.g === 'commentaire' ? 'italic' : 'normal',
              fontWeight: j.g === 'mot' || j.g === 'balise' ? '700' : 'normal',
            }}
          >
            {j.t}
          </Text>
        ),
      )}
    </>
  );
}
