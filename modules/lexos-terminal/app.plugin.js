// SPDX-License-Identifier: GPL-3.0-only
/**
 * Plugin Expo du terminal LexOS (fork de Termux) :
 *  - déclare les sous-projets Gradle terminal-emulator, terminal-view, termux-shared (settings.gradle) ;
 *  - donne à ces sous-projets les propriétés que leur build.gradle lit (gradle.properties) ;
 *  - garde les bibliothèques natives extraites (Termux exécute ses propres programmes).
 * On ne touche jamais au dossier android/ à la main : tout passe par ce plugin (AGENTS.md).
 */
const path = require('path');
const { withSettingsGradle, withGradleProperties, withAppBuildGradle } = require('expo/config-plugins');

const MARQUE = '// lexos-terminal';

function avecSousProjets(config) {
  return withSettingsGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARQUE)) {
      const base = path.join(__dirname, 'android').replace(/\\/g, '/');
      cfg.modResults.contents += `
${MARQUE}
include ':terminal-emulator', ':terminal-view', ':termux-shared'
project(':terminal-emulator').projectDir = new File('${base}/terminal-emulator')
project(':terminal-view').projectDir = new File('${base}/terminal-view')
project(':termux-shared').projectDir = new File('${base}/termux-shared')
`;
    }
    return cfg;
  });
}

function avecPropietes(config) {
  const voulues = {
    // Lue par les build.gradle du fork (les versions de SDK viennent de rootProject.ext, géré par Expo)
    markwonVersion: '4.6.2',
  };
  return withGradleProperties(config, (cfg) => {
    for (const [key, value] of Object.entries(voulues)) {
      if (!cfg.modResults.some((p) => p.type === 'property' && p.key === key)) {
        cfg.modResults.push({ type: 'property', key, value });
      }
    }
    return cfg;
  });
}

function avecEmballage(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(`${MARQUE}: packaging + desugaring`)) {
      cfg.modResults.contents += `
${MARQUE}: packaging + desugaring
android {
    packaging {
        jniLibs {
            useLegacyPackaging = true
        }
    }
    compileOptions {
        coreLibraryDesugaringEnabled true
    }
}
dependencies {
    coreLibraryDesugaring "com.android.tools:desugar_jdk_libs:1.1.5"
}
`;
    }
    return cfg;
  });
}

module.exports = (config) => avecEmballage(avecPropietes(avecSousProjets(config)));
