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

export type NomImage = keyof typeof IMAGES;
