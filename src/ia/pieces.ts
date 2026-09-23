import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

/** Pièce jointe d'un message : image, PDF ou fichier texte. */
export type PieceJointe = {
  id: string;
  type: 'image' | 'pdf' | 'texte';
  nom: string;
  mime: string;
  /** Fichier gardé sur le téléphone (images et PDF). */
  uri?: string;
  /** Contenu (fichiers texte). */
  texte?: string;
};

const TAILLE_MAX_TEXTE = 120_000; // caractères
const TAILLE_MAX_PDF = 20 * 1024 * 1024;
const COTE_MAX_IMAGE = 1568; // taille idéale pour la vision des IA

const EXTENSIONS_TEXTE =
  /\.(txt|md|markdown|csv|tsv|json|jsonc|xml|html?|css|scss|less|js|jsx|mjs|cjs|ts|tsx|py|rb|php|java|kt|kts|swift|c|h|cpp|hpp|cs|go|rs|dart|lua|sh|bash|zsh|ps1|bat|sql|yml|yaml|toml|ini|cfg|conf|env|gradle|properties|vue|svelte|astro|tex|srt|log|gitignore|dockerfile|makefile)$/i;

function id() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function dossierPieces(): Directory {
  const d = new Directory(Paths.document, 'pieces');
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

/** Lit une adresse web temporaire (blob:) et la convertit en data URL, qui survit au rechargement. */
async function enDataUrl(uri: string): Promise<string> {
  if (uri.startsWith('data:')) return uri;
  const blob = await (await fetch(uri)).blob();
  return new Promise((resoudre, rejeter) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resoudre(String(lecteur.result));
    lecteur.onerror = () => rejeter(lecteur.error ?? new Error('Lecture du fichier impossible.'));
    lecteur.readAsDataURL(blob);
  });
}

/** Copie un fichier temporaire dans le dossier permanent de l'appli. */
async function garder(uri: string, nom: string): Promise<string> {
  if (Platform.OS === 'web') return enDataUrl(uri);
  const source = new File(uri);
  const destination = new File(dossierPieces(), `${id()}-${nom.replace(/[^\w.-]/g, '_')}`);
  source.copySync(destination);
  return destination.uri;
}

/** Choisir une ou plusieurs photos dans la galerie. */
export async function choisirImages(): Promise<PieceJointe[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: 5,
    quality: 1,
  });
  if (res.canceled) return [];
  const pieces: PieceJointe[] = [];
  for (const a of res.assets) {
    const grand = Math.max(a.width ?? 0, a.height ?? 0) > COTE_MAX_IMAGE;
    const redim = grand
      ? [{ resize: (a.width ?? 0) >= (a.height ?? 0) ? { width: COTE_MAX_IMAGE } : { height: COTE_MAX_IMAGE } }]
      : [];
    const image = await manipulateAsync(a.uri, redim, { compress: 0.75, format: SaveFormat.JPEG });
    const nom = (a.fileName ?? 'photo').replace(/\.\w+$/, '') + '.jpg';
    pieces.push({ id: id(), type: 'image', nom, mime: 'image/jpeg', uri: await garder(image.uri, nom) });
  }
  return pieces;
}

/** Prendre une photo avec l'appareil. */
export async function prendrePhoto(): Promise<PieceJointe[]> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error("Autorise l'appareil photo dans les réglages du téléphone.");
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  if (res.canceled) return [];
  const a = res.assets[0];
  const image = await manipulateAsync(a.uri, [{ resize: { width: COTE_MAX_IMAGE } }], {
    compress: 0.75,
    format: SaveFormat.JPEG,
  });
  return [{ id: id(), type: 'image', nom: 'photo.jpg', mime: 'image/jpeg', uri: await garder(image.uri, 'photo.jpg') }];
}

/** Choisir des fichiers (texte, code, PDF, images). */
export async function choisirFichiers(): Promise<PieceJointe[]> {
  const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
  if (res.canceled) return [];
  const pieces: PieceJointe[] = [];
  for (const a of res.assets) {
    const mime = a.mimeType ?? '';
    if (mime.startsWith('image/')) {
      // Même taille maximale que pour la galerie (le sélecteur de fichiers ne donne pas les dimensions).
      const taille = await manipulateAsync(a.uri, []);
      const grand = Math.max(taille.width, taille.height) > COTE_MAX_IMAGE;
      const redim = grand
        ? [{ resize: taille.width >= taille.height ? { width: COTE_MAX_IMAGE } : { height: COTE_MAX_IMAGE } }]
        : [];
      const image = await manipulateAsync(a.uri, redim, { compress: 0.75, format: SaveFormat.JPEG });
      pieces.push({ id: id(), type: 'image', nom: a.name, mime: 'image/jpeg', uri: await garder(image.uri, a.name) });
    } else if (mime === 'application/pdf' || /\.pdf$/i.test(a.name)) {
      if ((a.size ?? 0) > TAILLE_MAX_PDF) throw new Error(`« ${a.name} » est trop gros (20 Mo maximum).`);
      pieces.push({ id: id(), type: 'pdf', nom: a.name, mime: 'application/pdf', uri: await garder(a.uri, a.name) });
    } else if (mime.startsWith('text/') || EXTENSIONS_TEXTE.test(a.name) || mime.includes('json') || mime.includes('xml')) {
      pieces.push({ id: id(), type: 'texte', nom: a.name, mime: mime || 'text/plain', texte: await lireTexte(a.uri) });
    } else {
      throw new Error(`« ${a.name} » : type de fichier non pris en charge (texte, code, PDF ou image seulement).`);
    }
  }
  return pieces;
}

async function lireTexte(uri: string): Promise<string> {
  const texte = Platform.OS === 'web' ? await (await fetch(uri)).text() : await new File(uri).text();
  return texte.length > TAILLE_MAX_TEXTE
    ? `${texte.slice(0, TAILLE_MAX_TEXTE)}\n\n[… fichier coupé : trop long]`
    : texte;
}

/** Lit un fichier gardé et le renvoie en base64 (pour l'envoyer à l'IA). */
export async function lireBase64(uri: string): Promise<string> {
  if (uri.startsWith('data:')) return uri.slice(uri.indexOf(',') + 1);
  const octets = Platform.OS === 'web' ? new Uint8Array(await (await fetch(uri)).arrayBuffer()) : await new File(uri).bytes();
  return enBase64(octets);
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Encodage base64 (sans dépendance). */
export function enBase64(o: Uint8Array): string {
  const morceaux: string[] = [];
  let tampon = '';
  let i = 0;
  for (; i + 2 < o.length; i += 3) {
    const n = (o[i] << 16) | (o[i + 1] << 8) | o[i + 2];
    tampon += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + ALPHABET[n & 63];
    if (tampon.length > 8192) {
      morceaux.push(tampon);
      tampon = '';
    }
  }
  const reste = o.length - i;
  if (reste === 1) {
    const n = o[i] << 16;
    tampon += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + '==';
  } else if (reste === 2) {
    const n = (o[i] << 16) | (o[i + 1] << 8);
    tampon += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + '=';
  }
  morceaux.push(tampon);
  return morceaux.join('');
}

/** Supprime les fichiers d'une liste de pièces (quand on efface une discussion). */
export function supprimerPieces(pieces: PieceJointe[]) {
  if (Platform.OS === 'web') return;
  for (const p of pieces) {
    try {
      if (p.uri) new File(p.uri).delete();
    } catch {
      // déjà supprimé
    }
  }
}
