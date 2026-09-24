// SPDX-License-Identifier: MIT
/**
 * Plugin Expo du Terminal : évite un conflit de fichiers en double
 * (module-info.class) entre les bibliothèques SSH (JSch) et Bouncy Castle.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const MARQUE = '// marceau-terminal: packaging';

module.exports = function withMarceauTerminal(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARQUE)) {
      cfg.modResults.contents += `
${MARQUE}
android {
    packaging {
        resources {
            excludes += ["META-INF/versions/**/module-info.class", "META-INF/versions/9/OSGI-INF/MANIFEST.MF"]
        }
    }
}
`;
    }
    return cfg;
  });
};
