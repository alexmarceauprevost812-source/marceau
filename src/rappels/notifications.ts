import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const CANAL = 'rappels';
let pret: Promise<boolean> | null = null;

// Afficher la notification même si l'application est ouverte.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Demande la permission (une seule fois) et crée le canal Android des rappels. */
export function preparerNotifications(): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(false);
  pret ??= (async () => {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CANAL, {
        name: 'Rappels de tâches',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 150, 250],
      });
    }
    const actuel = await Notifications.getPermissionsAsync();
    if (actuel.granted) return true;
    const demande = await Notifications.requestPermissionsAsync();
    return demande.granted;
  })().catch(() => false);
  return pret.then((ok) => {
    if (!ok) pret = null; // redemander la prochaine fois
    return ok;
  });
}

/** Programme une notification ; renvoie son identifiant, ou null si refusé. */
export async function programmerRappel(titre: string, texte: string, date: Date): Promise<string | null> {
  if (!(await preparerNotifications())) return null;
  return Notifications.scheduleNotificationAsync({
    content: { title: titre, body: texte, sound: true },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: CANAL },
  });
}

export async function annulerRappel(id: string | undefined) {
  if (!id || Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}

const CANAL_REVEIL = 'reveil';
let canalReveilPret = false;

/**
 * Prépare le canal « Réveil » (une seule fois) et vérifie la permission des notifications
 * À CHAQUE appel : si l'utilisateur l'a retirée dans les réglages du téléphone puis revient,
 * on ne doit pas croire, à partir d'un cache, que le réveil pourra sonner.
 */
async function preparerReveil(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    if (Platform.OS === 'android' && !canalReveilPret) {
      await Notifications.setNotificationChannelAsync(CANAL_REVEIL, {
        name: 'Réveil',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        vibrationPattern: [0, 500, 500, 500, 500, 500],
        enableVibrate: true,
      });
      canalReveilPret = true;
    }
    const actuel = await Notifications.getPermissionsAsync();
    if (actuel.granted) return true;
    const demande = await Notifications.requestPermissionsAsync();
    return demande.granted;
  } catch {
    return false;
  }
}

/**
 * Programme un réveil qui sonne CHAQUE JOUR à l'heure donnée (notification + sonnerie).
 * Renvoie l'identifiant de la notification, ou null si la permission est refusée.
 */
export async function programmerReveil(heure: number, minute: number, titre = '⏰ Réveil'): Promise<string | null> {
  if (!(await preparerReveil())) return null;
  return Notifications.scheduleNotificationAsync({
    content: { title: titre, body: "C'est l'heure de te réveiller !", sound: true },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: heure, minute, channelId: CANAL_REVEIL },
  });
}
