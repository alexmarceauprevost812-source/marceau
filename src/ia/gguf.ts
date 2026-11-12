import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, FileMode, Paths } from 'expo-file-system';

/**
 * Modèles d'IA au format .gguf, qui tournent sur le téléphone (voir llamaLocal.native.ts).
 *
 * Le modèle n'est JAMAIS dans l'APK (il pèse de 0,5 à plusieurs Go) : il se télécharge à part,
 * une seule fois, ou on ajoute un fichier .gguf qu'on a déjà.
 *
 * Où sont rangés les modèles :
 * - dossier de l'appli (« modeles ») : téléchargements et imports faits depuis Marceau ;
 * - dossier partagé « Models » (Android, stockage du téléphone) : on y dépose ses propres .gguf,
 *   par exemple ceux de CodexLocal ou du terminal LexOS. Il faut alors l'autorisation
 *   « Accès à tous les fichiers » pour Marceau.
 */

export type ModeleLocal = {
  /** Nom du fichier, ex. « qwen2.5-coder-1.5b.gguf » : c'est ce qu'on garde dans les réglages. */
  nom: string;
  /** Taille en octets. */
  taille: number;
  uri: string;
  /** true si le fichier est dans le dossier partagé « Models » (pas supprimable depuis l'appli). */
  partage: boolean;
};

export type Progression = { octets: number; total: number };

type OptionsTelechargement = {
  onProgression?: (p: Progression) => void;
  signal?: AbortSignal;
};

/** Dossier partagé du téléphone où déposer ses modèles (le même que pour CodexLocal et le terminal). */
export const DOSSIER_PARTAGE = '/storage/emulated/0/Models';

const MODELES_LOCAUX_POSSIBLES = Platform.OS === 'android' || Platform.OS === 'ios';

/** Les modèles .gguf ne tournent que dans l'APK (pas sur le site web). */
export function ggufDisponible(): boolean {
  return MODELES_LOCAUX_POSSIBLES;
}

// ---------------------------------------------------------------------------
// Dossiers et liste
// ---------------------------------------------------------------------------

export function dossierModeles(): Directory {
  const d = new Directory(Paths.document, 'modeles');
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

/** Le dossier partagé « Models », s'il existe et si Marceau a le droit de le lire (Android seulement). */
function dossierPartage(): Directory | null {
  if (Platform.OS !== 'android') return null;
  try {
    const d = new Directory(`file://${DOSSIER_PARTAGE}`);
    if (!d.exists) d.create({ intermediates: true, idempotent: true });
    return d.exists ? d : null;
  } catch {
    return null; // pas d'autorisation « Accès à tous les fichiers »
  }
}

function fichiersGguf(d: Directory, partage: boolean): ModeleLocal[] {
  try {
    return d
      .list()
      .filter((e): e is File => e instanceof File && /\.gguf$/i.test(e.name))
      .map((f) => ({ nom: f.name, taille: f.size ?? 0, uri: f.uri, partage }));
  } catch {
    return [];
  }
}

/** Les modèles .gguf disponibles sur le téléphone (dossier de l'appli, puis dossier partagé « Models »). */
export function listerModelesLocaux(): ModeleLocal[] {
  if (!MODELES_LOCAUX_POSSIBLES) return [];
  const liste = fichiersGguf(dossierModeles(), false);
  const partage = dossierPartage();
  if (partage) {
    const connus = new Set(liste.map((m) => m.nom));
    for (const m of fichiersGguf(partage, true)) if (!connus.has(m.nom)) liste.push(m);
  }
  return liste.sort((a, b) => a.nom.localeCompare(b.nom));
}

/** Retrouve un modèle par son nom de fichier. */
export function trouverModele(nom: string): ModeleLocal | null {
  return listerModelesLocaux().find((m) => m.nom === nom) ?? null;
}

/** true si Marceau peut lire le dossier partagé « Models » (sinon : autorisation à donner). */
export function dossierPartageLisible(): boolean {
  return dossierPartage() !== null;
}

export function supprimerModele(nom: string) {
  const f = new File(dossierModeles(), nom);
  if (f.exists) f.delete();
}

export function formaterTaille(octets: number): string {
  if (octets >= 1024 ** 3) return `${(octets / 1024 ** 3).toFixed(1).replace('.', ',')} Go`;
  return `${Math.max(1, Math.round(octets / 1024 ** 2))} Mo`;
}

/** Nom de fichier sûr, terminé par .gguf. */
function nomSur(nom: string): string {
  const propre = nom.trim().replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'modele';
  return /\.gguf$/i.test(propre) ? propre : `${propre}.gguf`;
}

// ---------------------------------------------------------------------------
// Vérification d'un fichier
// ---------------------------------------------------------------------------

/** Un vrai fichier .gguf commence par les quatre lettres « GGUF » et pèse au moins quelques Mo. */
function verifierGguf(f: File) {
  const taille = f.size ?? 0;
  if (taille < 1_000_000) {
    throw new Error(
      "Le fichier reçu est trop petit pour être un modèle : le lien est peut-être mauvais, ou le site demande de se connecter.",
    );
  }
  const poignee = f.open(FileMode.ReadOnly);
  try {
    const debut = poignee.readBytes(4);
    if (String.fromCharCode(...debut) !== 'GGUF') {
      throw new Error("Ce fichier n'est pas un modèle .gguf valide.");
    }
  } finally {
    poignee.close();
  }
}

// ---------------------------------------------------------------------------
// Ajouter un fichier .gguf qu'on a déjà
// ---------------------------------------------------------------------------

/** Choisit un fichier .gguf dans le téléphone et le range dans le dossier des modèles. Renvoie son nom. */
export async function importerGguf(): Promise<string | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (res.canceled) return null;
  const a = res.assets[0];
  if (!/\.gguf$/i.test(a.name)) throw new Error(`« ${a.name} » n'est pas un fichier .gguf.`);
  const source = new File(a.uri);
  const destination = new File(dossierModeles(), nomSur(a.name));
  try {
    if (destination.exists) destination.delete();
    try {
      source.moveSync(destination); // même stockage : déplacement instantané
    } catch {
      source.copySync(destination);
      source.delete();
    }
    verifierGguf(destination);
  } catch (e) {
    try {
      if (destination.exists) destination.delete();
    } catch {
      // rien à nettoyer
    }
    throw e;
  }
  return destination.name;
}

// ---------------------------------------------------------------------------
// Télécharger un modèle
// ---------------------------------------------------------------------------

async function telechargerVers(
  url: string,
  nomFinal: string,
  o: OptionsTelechargement & { headers?: Record<string, string> },
): Promise<string> {
  const dossier = dossierModeles();
  const final = new File(dossier, nomFinal);
  if (final.exists) return nomFinal; // déjà téléchargé
  // On télécharge dans un fichier « .part » : un téléchargement coupé ne se retrouve pas dans la liste.
  const partiel = new File(dossier, `${nomFinal}.part`);
  try {
    await File.downloadFileAsync(url, partiel, {
      idempotent: true,
      headers: o.headers,
      signal: o.signal,
      onProgress: (p) => o.onProgression?.({ octets: p.bytesWritten, total: p.totalBytes }),
    });
    verifierGguf(partiel);
    partiel.moveSync(final);
  } catch (e) {
    try {
      if (partiel.exists) partiel.delete();
    } catch {
      // rien à nettoyer
    }
    throw e;
  }
  return nomFinal;
}

/** Référence d'un modèle du catalogue Ollama : « llama3.2:3b » = nom « llama3.2 », étiquette « 3b ». */
export type RefOllama = { espace: string; nom: string; tag: string };

const REGISTRE_OLLAMA = 'https://registry.ollama.ai/v2';
const FORME_REF = /^(?:([\w.-]+)\/)?([\w.-]+)(?::([\w.-]+))?$/;

/** Nom du fichier sous lequel un modèle Ollama est rangé (ex. « llama3.2-3b.gguf »). */
export function nomFichierPourRef(r: RefOllama): string {
  return nomSur(`${r.espace === 'library' ? '' : `${r.espace}-`}${r.nom}-${r.tag}`);
}

export function libelleRef(r: RefOllama): string {
  return `${r.espace === 'library' ? '' : `${r.espace}/`}${r.nom}:${r.tag}`;
}

/**
 * Comprend ce que la personne colle : un lien ollama.com, « ollama run llama3.2:3b », ou simplement
 * « llama3.2:3b ». Renvoie null si ce n'est pas un modèle Ollama.
 */
export function analyserRefOllama(texte: string): RefOllama | null {
  let t = texte.trim().replace(/^ollama\s+(?:run|pull)\s+/i, '');
  const lien = t.match(/^https?:\/\/(?:www\.)?ollama\.com\/(?:library\/)?([^\s?#]+)/i);
  if (lien) t = lien[1].replace(/\/+$/, '');
  else if (/^https?:\/\//i.test(t) || /\.gguf$/i.test(t)) return null;
  const m = t.match(FORME_REF);
  if (!m) return null;
  return { espace: m[1] ?? 'library', nom: m[2], tag: m[3] ?? 'latest' };
}

/**
 * Télécharge un modèle du catalogue Ollama en un clic. Les modèles d'Ollama sont de simples fichiers
 * .gguf : on lit la fiche du modèle, on repère le fichier du modèle et on le télécharge dans l'appli.
 */
export async function telechargerOllama(ref: RefOllama, o: OptionsTelechargement = {}): Promise<string> {
  const base = `${REGISTRE_OLLAMA}/${ref.espace}/${ref.nom}`;
  let reponse: Response;
  try {
    reponse = await fetch(`${base}/manifests/${ref.tag}`, {
      headers: { Accept: 'application/vnd.docker.distribution.manifest.v2+json' },
      signal: o.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new Error("Impossible de joindre le catalogue Ollama. Vérifie ta connexion internet.");
  }
  if (reponse.status === 404) {
    throw new Error(`Le modèle « ${libelleRef(ref)} » n'existe pas sur Ollama. Vérifie le nom et l'étiquette (ex. llama3.2:3b).`);
  }
  if (!reponse.ok) throw new Error(`Le catalogue Ollama a répondu une erreur (${reponse.status}). Réessaie plus tard.`);
  const fiche = (await reponse.json()) as { layers?: { mediaType?: string; digest?: string }[] };
  const couche = fiche.layers?.find((l) => l.mediaType === 'application/vnd.ollama.image.model');
  if (!couche?.digest) throw new Error("Ce modèle Ollama n'a pas de fichier .gguf utilisable.");
  return telechargerVers(`${base}/blobs/${couche.digest}`, nomFichierPourRef(ref), o);
}

/** Adresse directe d'un fichier .gguf (Hugging Face, ou n'importe quel site). */
export async function telechargerUrl(adresse: string, o: OptionsTelechargement = {}): Promise<string> {
  // Une page Hugging Face « …/blob/main/x.gguf » → le vrai fichier « …/resolve/main/x.gguf »
  const url = adresse.trim().replace(/^(https?:\/\/huggingface\.co\/.+?)\/blob\//i, '$1/resolve/');
  let chemin: string;
  try {
    chemin = new URL(url).pathname;
  } catch {
    throw new Error("Cette adresse n'est pas valide. Colle un lien qui commence par https://");
  }
  const nom = decodeURIComponent(chemin.split('/').filter(Boolean).pop() ?? '');
  if (!/\.gguf$/i.test(nom)) {
    throw new Error("Le lien doit mener à un fichier .gguf (il finit par « .gguf »), ou être un modèle Ollama comme llama3.2:3b.");
  }
  return telechargerVers(url, nomSur(nom), o);
}

/** Télécharge ce que la personne a collé : un modèle Ollama ou un lien direct vers un .gguf. */
export async function telechargerLien(texte: string, o: OptionsTelechargement = {}): Promise<string> {
  const ref = analyserRefOllama(texte);
  return ref ? telechargerOllama(ref, o) : telechargerUrl(texte, o);
}

// ---------------------------------------------------------------------------
// Modèles proposés en un clic
// ---------------------------------------------------------------------------

export type SuggestionModele = {
  /** Modèle du catalogue Ollama (ex. « llama3.2:3b »). */
  ollama: string;
  titre: string;
  description: string;
  /** Poids approximatif du téléchargement. */
  taille: string;
};

/** Petits modèles qui tiennent sur un téléphone (4 Go de mémoire ou plus). */
export const SUGGESTIONS_GGUF: SuggestionModele[] = [
  { ollama: 'qwen2.5-coder:1.5b', titre: 'Qwen2.5 Coder 1,5B', description: 'Pour le code (Codex), léger et rapide.', taille: '≈ 1 Go' },
  { ollama: 'qwen2.5-coder:3b', titre: 'Qwen2.5 Coder 3B', description: 'Pour le code, plus capable (6 Go de mémoire conseillés).', taille: '≈ 1,9 Go' },
  { ollama: 'llama3.2:1b', titre: 'Llama 3.2 1B', description: 'Discussion rapide en français.', taille: '≈ 1,3 Go' },
  { ollama: 'llama3.2:3b', titre: 'Llama 3.2 3B', description: 'Discussion plus solide (6 Go de mémoire conseillés).', taille: '≈ 2 Go' },
  { ollama: 'deepseek-r1:1.5b', titre: 'DeepSeek R1 1,5B', description: 'Raisonne avant de répondre (le raisonnement est caché).', taille: '≈ 1,1 Go' },
  { ollama: 'gemma3:1b', titre: 'Gemma 3 1B', description: 'Très léger, pour les vieux téléphones.', taille: '≈ 0,8 Go' },
];
