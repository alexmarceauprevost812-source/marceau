/**
 * Les images de Marceau, incluses dans l'APK.
 * Pour en ajouter une : mets le fichier dans assets/images/ et ajoute une ligne ici.
 * Utilisation : <Image source={IMAGES.logoCouronne} style={{ width: 120, height: 120 }} />
 */
export const IMAGES = {
  /** Logo démon en flammes « MARCEAU » avec le drapeau du Québec (fond transparent). */
  logo: require('../assets/images/marceau-logo.webp'),
  /** Logo « M » couronné, rond, sur fond noir. */
  logoCouronne: require('../assets/images/marceau-couronne.webp'),
  /** Logo démon « TI-LEX-AL » (fond transparent). */
  tiLexAl: require('../assets/images/ti-lex-al.webp'),
  /** Avatar masqué : pouce levé. */
  avatarPouce: require('../assets/images/avatar-pouce.webp'),
  /** Avatar masqué : pose neutre. */
  avatarNeutre: require('../assets/images/avatar-neutre.webp'),
  /** Avatar masqué : signe rock. */
  avatarRock: require('../assets/images/avatar-rock.webp'),
} as const;

/** Les trois poses de l'avatar, en petit format carré (tête + main). */
export const AVATARS = {
  neutre: require('../assets/images/avatar-carre-neutre.webp'),
  pouce: require('../assets/images/avatar-carre-pouce.webp'),
  rock: require('../assets/images/avatar-carre-rock.webp'),
} as const;

export type Pose = keyof typeof AVATARS;

export type NomImage = keyof typeof IMAGES;
