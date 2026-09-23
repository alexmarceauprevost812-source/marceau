import { Platform } from 'react-native';

/** Police à chasse fixe pour le code. */
export const POLICE_CODE = Platform.select({ ios: 'Menlo', default: 'monospace' });
