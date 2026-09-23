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
