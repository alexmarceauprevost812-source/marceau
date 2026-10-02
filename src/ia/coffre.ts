import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Où ranger les secrets (clés API, jeton GitHub) : toujours SUR l'appareil de la personne.
 *
 * - Android / iOS : le coffre sécurisé du système (Keystore / Keychain).
 * - Web : expo-secure-store n'existe pas (son module web est vide, chaque appel échoue), donc la
 *   clé n'était jamais gardée et il fallait la retaper à chaque visite. On utilise le stockage
 *   local du navigateur : la clé reste dans CE navigateur, sur CET ordinateur.
 *
 * Marceau n'a aucun serveur : la clé ne part que vers le fournisseur d'IA choisi, au moment
 * d'une requête (OpenCode, Anthropic, OpenAI…), jamais vers nous.
 */
const web = Platform.OS === 'web';

function stockage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null; // navigation privée stricte, stockage bloqué…
  }
}

export async function lireSecret(cle: string): Promise<string | null> {
  if (web) {
    try {
      return stockage()?.getItem(cle) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(cle).catch(() => null);
}

export async function ecrireSecret(cle: string, valeur: string): Promise<void> {
  if (web) {
    try {
      stockage()?.setItem(cle, valeur);
    } catch {
      // stockage plein ou bloqué : la clé reste utilisable pour cette visite seulement
    }
    return;
  }
  await SecureStore.setItemAsync(cle, valeur).catch(() => {});
}

export async function effacerSecret(cle: string): Promise<void> {
  if (web) {
    try {
      stockage()?.removeItem(cle);
    } catch {
      // rien à effacer
    }
    return;
  }
  await SecureStore.deleteItemAsync(cle).catch(() => {});
}
