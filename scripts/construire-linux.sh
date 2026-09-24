#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
#
# Compile le moteur du mini-Linux du Terminal À PARTIR DU CODE SOURCE :
#   - PRoot (fork Termux)       — GPL-2.0-or-later
#   - talloc                    — LGPL-3.0-or-later
#   - libandroid-shmem          — BSD-3-Clause
#
# Les programmes sont placés dans le module natif sous forme de « lib*.so » : Android
# n'autorise à exécuter que les programmes livrés dans l'APK de cette façon.
#
# Utilisation :
#   bash scripts/construire-linux.sh            télécharge, vérifie et compile (NDK Android requis)
#   bash scripts/construire-linux.sh --sources  télécharge et vérifie seulement, puis prépare
#                                               l'archive des sources (publiée avec chaque APK)
#
# Lancé automatiquement pendant la construction de l'APK (hook eas-build-post-install).
# S'il échoue, l'APK se construit quand même : l'onglet Linux indiquera qu'il est indisponible.

set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
TRAVAIL="${MARCEAU_TRAVAIL:-$RACINE/build/linux}"
SOURCES="$TRAVAIL/sources"
JNILIBS="$RACINE/modules/marceau-terminal/android/src/main/jniLibs"
API=26 # libandroid-shmem utilise ASharedMemory (Android 8+)

# ---- Sources épinglées (version + empreinte SHA-256) -----------------------------------
PROOT_VERSION=5.1.107.94
PROOT_URL="https://github.com/termux/proot/archive/v${PROOT_VERSION}.zip"
PROOT_SHA256=3fa4c57253463c3d595984d997b407b0b6bdb46d290b2a111959a2efd609e839

TALLOC_VERSION=2.4.3
TALLOC_URL="https://www.samba.org/ftp/talloc/talloc-${TALLOC_VERSION}.tar.gz"
TALLOC_SHA256=dc46c40b9f46bb34dd97fe41f548b0e8b247b77a918576733c528e83abd854dd

SHMEM_VERSION=0.7
SHMEM_URL="https://github.com/termux/libandroid-shmem/archive/refs/tags/v${SHMEM_VERSION}.tar.gz"
SHMEM_SHA256=1e5ff8459bc0a8c229dd8a94b27d119987e09ef3414331c2b5ebfff20b98e867

# Dossier Android → cible du compilateur du NDK
declare -A CIBLES=(
  [arm64-v8a]=aarch64-linux-android
  [armeabi-v7a]=armv7a-linux-androideabi
  [x86_64]=x86_64-linux-android
  [x86]=i686-linux-android
)

info() { echo "[linux] $*"; }
avertir() { echo "[linux] ATTENTION : $*" >&2; }

# ---- Téléchargement vérifié -------------------------------------------------------------
telecharger() { # url fichier sha256
  local url="$1" fichier="$SOURCES/$2" attendu="$3"
  if [ ! -f "$fichier" ] || [ "$(sha256sum "$fichier" | cut -d' ' -f1)" != "$attendu" ]; then
    info "Téléchargement de $2"
    curl -fsSL --retry 3 -o "$fichier.tmp" "$url" || { avertir "téléchargement impossible : $url"; return 1; }
    mv "$fichier.tmp" "$fichier"
  fi
  local obtenu
  obtenu="$(sha256sum "$fichier" | cut -d' ' -f1)"
  if [ "$obtenu" != "$attendu" ]; then
    avertir "$2 : empreinte SHA-256 différente ($obtenu), fichier refusé"
    rm -f "$fichier"
    return 1
  fi
}

telecharger_tout() {
  mkdir -p "$SOURCES"
  telecharger "$PROOT_URL" "proot-${PROOT_VERSION}.zip" "$PROOT_SHA256" &&
    telecharger "$TALLOC_URL" "talloc-${TALLOC_VERSION}.tar.gz" "$TALLOC_SHA256" &&
    telecharger "$SHMEM_URL" "libandroid-shmem-${SHMEM_VERSION}.tar.gz" "$SHMEM_SHA256"
}

# ---- Archive des sources (obligation de la GPL et de la LGPL) ---------------------------
preparer_archive_sources() {
  local dossier="$TRAVAIL/marceau-sources-linux"
  rm -rf "$dossier"
  mkdir -p "$dossier"
  cp "$SOURCES"/*.zip "$SOURCES"/*.tar.gz "$dossier/"
  cp "$0" "$dossier/construire-linux.sh"
  cat > "$dossier/LISEZ-MOI.md" <<EOF
# Code source des programmes libres inclus dans l'APK de Marceau

L'APK de Marceau contient des programmes compilés à partir de ces sources, sans modification,
avec le script \`construire-linux.sh\` (également inclus) :

| Programme | Version | Licence | Source d'origine |
| --- | --- | --- | --- |
| PRoot (fork Termux) | ${PROOT_VERSION} | GPL-2.0-or-later | ${PROOT_URL} |
| talloc | ${TALLOC_VERSION} | LGPL-3.0-or-later | ${TALLOC_URL} |
| libandroid-shmem | ${SHMEM_VERSION} | BSD-3-Clause | ${SHMEM_URL} |

Dans l'APK : \`lib/<processeur>/libproot.so\` (PRoot, avec talloc et libandroid-shmem liés
statiquement) et \`libproot-loader*.so\` (le chargeur de PRoot).

Pour recompiler : installer le NDK Android, puis \`bash construire-linux.sh\` depuis le dépôt Marceau.
Le texte complet des licences se trouve dans chaque archive (fichiers COPYING / LICENSE).
EOF
  tar -czf "$TRAVAIL/marceau-sources-linux.tar.gz" -C "$TRAVAIL" marceau-sources-linux
  info "Archive des sources : $TRAVAIL/marceau-sources-linux.tar.gz"
}

# ---- NDK Android -----------------------------------------------------------------------
trouver_ndk() {
  local candidat
  for candidat in "${ANDROID_NDK_HOME:-}" "${ANDROID_NDK_ROOT:-}" "${ANDROID_NDK_LATEST_HOME:-}" "${ANDROID_NDK:-}"; do
    [ -n "$candidat" ] && [ -d "$candidat/toolchains/llvm" ] && { echo "$candidat"; return 0; }
  done
  for base in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" /usr/local/lib/android/sdk "$HOME/Android/Sdk"; do
    [ -n "$base" ] && [ -d "$base/ndk" ] || continue
    candidat="$(ls -d "$base"/ndk/*/ 2>/dev/null | sort -V | tail -1)"
    [ -n "$candidat" ] && [ -d "$candidat/toolchains/llvm" ] && { echo "${candidat%/}"; return 0; }
  done
  return 1
}

# ---- Compilation pour un processeur ------------------------------------------------------
construire_abi() { # abi
  local abi="$1" cible="${CIBLES[$1]}"
  local cc="$OUTILS/${cible}${API}-clang"
  local dep="$TRAVAIL/$abi/dep" src="$TRAVAIL/$abi/src"
  rm -rf "$TRAVAIL/$abi"
  mkdir -p "$dep/lib" "$dep/include/sys" "$src"
  [ -x "$cc" ] || { avertir "$abi : compilateur introuvable ($cc)"; return 1; }

  export CC="$cc" AR="$OUTILS/llvm-ar" RANLIB="$OUTILS/llvm-ranlib"
  unset CFLAGS CPPFLAGS LDFLAGS

  # talloc (bibliothèque statique)
  tar -xzf "$SOURCES/talloc-${TALLOC_VERSION}.tar.gz" -C "$src"
  (
    cd "$src/talloc-${TALLOC_VERSION}" || exit 1
    cat > cross-answers.txt <<'EOF'
Checking uname sysname type: "Linux"
Checking uname machine type: "dontcare"
Checking uname release type: "dontcare"
Checking uname version type: "dontcare"
Checking simple C program: OK
building library support: OK
Checking for large file support: OK
Checking for -D_FILE_OFFSET_BITS=64: OK
Checking for WORDS_BIGENDIAN: OK
Checking for C99 vsnprintf: OK
Checking for HAVE_SECURE_MKSTEMP: OK
rpath library support: OK
-Wl,--version-script support: FAIL
Checking correct behavior of strtoll: OK
Checking correct behavior of strptime: OK
Checking for HAVE_IFACE_GETIFADDRS: OK
Checking for HAVE_IFACE_IFCONF: OK
Checking for HAVE_IFACE_IFREQ: OK
Checking getconf LFS_CFLAGS: OK
Checking for large file support without additional flags: OK
Checking for working strptime: OK
Checking for HAVE_SHARED_MMAP: OK
Checking for HAVE_MREMAP: OK
Checking for HAVE_INCOHERENT_MMAP: OK
Checking getconf large file support flags work: OK
EOF
    ./configure --prefix="$dep" --disable-rpath --disable-python \
      --cross-compile --cross-answers=cross-answers.txt >configure.log 2>&1 &&
      make >make.log 2>&1 &&
      "$AR" rcs "$dep/lib/libtalloc.a" "$(find bin/default -name 'talloc.c.*.o' | sort | head -1)" &&
      cp talloc.h "$dep/include/"
  ) || { avertir "$abi : échec de talloc (voir $src/talloc-${TALLOC_VERSION}/*.log)"; return 1; }

  # libandroid-shmem (bibliothèque statique)
  tar -xzf "$SOURCES/libandroid-shmem-${SHMEM_VERSION}.tar.gz" -C "$src"
  (
    cd "$src/libandroid-shmem-${SHMEM_VERSION}" || exit 1
    "$CC" -fPIC -std=gnu11 -O2 -c shmem.c -o shmem.o &&
      "$AR" rcs "$dep/lib/libandroid-shmem.a" shmem.o &&
      cp shm.h "$dep/include/sys/shm.h"
  ) || { avertir "$abi : échec de libandroid-shmem"; return 1; }

  # PRoot
  (cd "$src" && unzip -q "$SOURCES/proot-${PROOT_VERSION}.zip") || return 1
  local proot="$src/proot-${PROOT_VERSION}/src"
  export CPPFLAGS="-I$dep/include -DARG_MAX=131072 -DVERSION=\\\"${PROOT_VERSION}\\\""
  export LDFLAGS="-L$dep/lib -Wl,--no-as-needed -llog -landroid"
  local options=(
    -C "$proot" proot V=1
    PROOT_UNBUNDLE_LOADER=/marceau PROOT_WITH_LIBANDROID_SHMEM=true
    STRIP="$OUTILS/llvm-strip" OBJCOPY="$OUTILS/llvm-objcopy" OBJDUMP="$OUTILS/llvm-objdump"
  )
  if ! make "${options[@]}" >"$src/proot.log" 2>&1; then
    # Le chargeur 32 bits (programmes 32 bits dans le Linux) est facultatif : on réessaie sans.
    make -C "$proot" clean >/dev/null 2>&1
    make "${options[@]}" HAS_LOADER_32BIT= >"$src/proot.log" 2>&1 ||
      { avertir "$abi : échec de PRoot (voir $src/proot.log)"; tail -20 "$src/proot.log" >&2; return 1; }
  fi

  local sortie="$JNILIBS/$abi"
  rm -rf "$sortie"
  mkdir -p "$sortie"
  cp "$proot/proot" "$sortie/libproot.so"
  cp "$proot/loader/loader" "$sortie/libproot-loader.so"
  [ -f "$proot/loader/loader-m32" ] && cp "$proot/loader/loader-m32" "$sortie/libproot-loader32.so"
  info "✓ $abi"
}

# ---- Programme principal ------------------------------------------------------------------
if ! telecharger_tout; then
  avertir "sources indisponibles : l'onglet Linux du Terminal sera indisponible dans cet APK."
  exit 0
fi

if [ "${1:-}" = "--sources" ]; then
  preparer_archive_sources
  exit 0
fi

if ! NDK="$(trouver_ndk)"; then
  avertir "NDK Android introuvable : l'onglet Linux du Terminal sera indisponible dans cet APK."
  exit 0
fi
OUTILS="$NDK/toolchains/llvm/prebuilt/linux-x86_64/bin"
info "NDK : $NDK"
command -v python3 >/dev/null || { avertir "python3 requis pour compiler talloc"; exit 0; }

reussi=0
for abi in arm64-v8a armeabi-v7a x86_64 x86; do
  construire_abi "$abi" && reussi=$((reussi + 1))
done
[ "$reussi" -gt 0 ] || avertir "aucune compilation réussie : l'onglet Linux du Terminal sera indisponible dans cet APK."
exit 0
