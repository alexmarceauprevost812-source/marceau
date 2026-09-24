// SPDX-License-Identifier: MIT
package org.marceau.terminal

import android.content.Context
import android.os.Build
import android.system.Os
import android.system.OsConstants
import java.io.BufferedInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.GZIPInputStream
import java.security.MessageDigest

/**
 * Option 4 : un vrai petit Linux (Alpine) dans l'appli, lancé avec PRoot.
 * `apk add python3 git nodejs…` fonctionne ensuite comme sur un ordinateur.
 */
internal object Linux {
  private const val MARQUEUR = ".marceau-installe"

  private fun dossier(ctx: Context) = File(ctx.filesDir, "linux")
  private fun racine(ctx: Context) = File(dossier(ctx), "racine")
  private fun natif(ctx: Context, nom: String) = File(ctx.applicationInfo.nativeLibraryDir, nom)

  // PRoot est compilé pour Android 8+ (libandroid-shmem utilise ASharedMemory).
  fun prootDisponible(ctx: Context) =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && natif(ctx, "libproot.so").exists()

  fun installe(ctx: Context) = File(racine(ctx), MARQUEUR).exists()

  /** Paquets de base d'Alpine : ce ne sont pas des outils ajoutés par la personne. */
  private val BASE = setOf("alpine-base", "alpine-baselayout", "alpine-baselayout-data", "alpine-keys",
    "alpine-release", "apk-tools", "busybox", "busybox-binsh", "libc-utils", "musl", "musl-utils", "scanelf",
    "ssl_client", "ca-certificates-bundle", "zlib", "libcrypto3", "libssl3")

  /**
   * Outils installés avec « apk add » : la liste /etc/apk/world d'Alpine (paquets demandés,
   * sans leurs dépendances), sans les paquets de base ni les contraintes de version.
   */
  fun outilsInstalles(ctx: Context): List<String> {
    val world = File(racine(ctx), "etc/apk/world")
    if (!installe(ctx) || !world.canRead()) return emptyList()
    return world.readLines()
      .map { it.trim().split(Regex("[<>=~@]"))[0] }
      .filter { it.isNotEmpty() && it !in BASE }
      .distinct()
      .sorted()
  }

  /** Architecture Alpine correspondant au téléphone. */
  private fun archAlpine(): String =
    when (Build.SUPPORTED_ABIS.firstOrNull()) {
      "arm64-v8a" -> "aarch64"
      "armeabi-v7a" -> "armv7"
      "x86_64" -> "x86_64"
      "x86" -> "x86"
      else -> throw IOException("Processeur non pris en charge : ${Build.SUPPORTED_ABIS.joinToString()}")
    }

  /** Télécharge et installe Alpine Linux (environ 4 Mo). */
  fun installer(ctx: Context, progression: (String, Int) -> Unit) {
    if (!prootDisponible(ctx)) {
      throw IOException("Le Linux intégré demande Android 8 ou plus récent, et PRoot inclus dans l'APK (voir scripts/construire-linux.sh).")
    }
    val arch = archAlpine()
    val base = "https://dl-cdn.alpinelinux.org/alpine/latest-stable/releases/$arch"
    progression("Recherche de la dernière version d'Alpine…", 0)
    val yaml = lireTexte("$base/latest-releases.yaml")
    // Le fichier et son empreinte SHA-256 (le « sha256: » qui suit « file: » dans la même entrée).
    val trouve = Regex("""file:\s*(alpine-minirootfs-[^\s]+\.tar\.gz)[\s\S]*?sha256:\s*([0-9a-fA-F]{64})""").find(yaml)
      ?: throw IOException("Version d'Alpine introuvable")
    val fichier = trouve.groupValues[1]
    val empreinte = trouve.groupValues[2].lowercase()

    val archive = File(ctx.cacheDir, fichier)
    telecharger("$base/$fichier", archive) { p -> progression("Téléchargement d'Alpine…", p) }

    progression("Vérification du fichier…", 100)
    if (sha256(archive) != empreinte) {
      archive.delete()
      throw IOException("Le fichier d'Alpine téléchargé est corrompu ou modifié (empreinte SHA-256 différente). Réessaie.")
    }

    progression("Installation des fichiers…", 100)
    val racine = racine(ctx)
    val temporaire = File(dossier(ctx), "racine-tmp")
    supprimerSansSuivre(temporaire)
    temporaire.mkdirs()
    extraireTarGz(archive, temporaire)
    archive.delete()

    File(temporaire, MARQUEUR).writeText(fichier)
    ecrireConfig(temporaire, fichier)

    supprimerSansSuivre(racine)
    if (!temporaire.renameTo(racine)) throw IOException("Impossible de finaliser l'installation")
  }

  /** Numéro de la configuration écrite : on met à jour un ancien Linux quand ce numéro change. */
  private const val VERSION_CONFIG = 1
  private const val MARQUEUR_CONFIG = ".marceau-config"

  /** Branche du dépôt correspondant à la version installée, ex. « v3.22 » (et non « latest-stable »
   *  qui bougerait vers une nouvelle version incompatible avec le rootfs déjà en place). */
  private fun brancheAlpine(fichier: String): String {
    val v = Regex("""alpine-minirootfs-(\d+)\.(\d+)""").find(fichier)
    return if (v != null) "v${v.groupValues[1]}.${v.groupValues[2]}" else "latest-stable"
  }

  /** Écrit DNS, dépôts (épinglés) et la commande d'aide « outils » dans un rootfs. */
  private fun ecrireConfig(racine: File, fichier: String) {
    File(racine, "etc").mkdirs()
    File(racine, "etc/resolv.conf").apply { delete() }.writeText("nameserver 1.1.1.1\nnameserver 8.8.8.8\n")
    File(racine, "root").mkdirs()

    // Dépôts Alpine complets (main + community) : des milliers d'outils installables à la
    // demande avec « apk add » (nmap, python3, git, nodejs, hydra, john…). Épinglés à la
    // version installée pour éviter une mise à niveau partielle vers une nouvelle version.
    val branche = brancheAlpine(fichier)
    File(racine, "etc/apk").mkdirs()
    File(racine, "etc/apk/repositories").writeText(
      "https://dl-cdn.alpinelinux.org/alpine/$branche/main\n" +
        "https://dl-cdn.alpinelinux.org/alpine/$branche/community\n",
    )

    File(racine, "etc/profile.d").mkdirs()
    File(racine, "etc/profile.d/marceau.sh").writeText(
      """
      |export PS1='\[\e[38;5;208m\]linux\[\e[0m\]:\w \$ '
      |alias ll='ls -la'
      |# « outils » : rappelle comment installer des outils (tu choisis, tu télécharges).
      |outils() {
      |  echo 'Installe un outil avec :  apk add <nom>   (ex. apk add nmap)'
      |  echo 'Mets à jour la liste des paquets une fois :  apk update'
      |  echo
      |  echo 'Réseau      : nmap tcpdump netcat-openbsd bind-tools curl wget'
      |  echo 'Mots de passe: john hashcat hydra'
      |  echo 'Wi-Fi       : aircrack-ng wireless-tools'
      |  echo 'Web         : nikto sqlmap whatweb'
      |  echo 'Programmation: python3 py3-pip git nodejs npm gcc make'
      |  echo
      |  echo 'Cherche un paquet :  apk search <mot>'
      |  echo 'Sers-toi de ces outils uniquement sur TES appareils/réseaux ou avec autorisation écrite.'
      |}
      |echo 'Bienvenue dans Linux. Tape  outils  pour voir comment installer des programmes.'
      |""".trimMargin() + "\n",
    )
    File(racine, MARQUEUR_CONFIG).writeText(VERSION_CONFIG.toString())
  }

  /** Met à jour la config d'un Linux déjà installé avant cette version de l'appli. */
  private fun migrerConfig(ctx: Context) {
    val racine = racine(ctx)
    val marqueur = File(racine, MARQUEUR_CONFIG)
    if (marqueur.exists() && marqueur.readText().trim() == VERSION_CONFIG.toString()) return
    val fichier = try { File(racine, MARQUEUR).readText().trim() } catch (ignore: Exception) { "" }
    try { ecrireConfig(racine, fichier) } catch (ignore: Exception) {}
  }

  private fun sha256(f: File): String {
    val md = MessageDigest.getInstance("SHA-256")
    f.inputStream().use { entree ->
      val tampon = ByteArray(64 * 1024)
      while (true) {
        val n = entree.read(tampon)
        if (n < 0) break
        md.update(tampon, 0, n)
      }
    }
    return md.digest().joinToString("") { "%02x".format(it) }
  }

  fun supprimer(ctx: Context) {
    supprimerSansSuivre(dossier(ctx))
  }

  /**
   * Suppression récursive qui ne suit JAMAIS les liens symboliques : dans le Linux,
   * « /bin » ou « /lib » pointent vers des chemins absolus qui, vus d'Android,
   * désigneraient les dossiers du téléphone.
   */
  private fun supprimerSansSuivre(f: File) {
    val st = try { Os.lstat(f.path) } catch (ignore: Exception) { return }
    if (OsConstants.S_ISDIR(st.st_mode)) {
      f.listFiles()?.forEach { supprimerSansSuivre(it) }
    }
    f.delete()
  }

  /** Commande qui lance le shell Linux avec PRoot. */
  fun commande(ctx: Context): Triple<String, Array<String>, Array<String>> {
    // Met à jour un Linux installé avant cette version (dépôts épinglés, commande « outils »).
    migrerConfig(ctx)
    val dossier = dossier(ctx)
    // PRoot compilé par scripts/construire-linux.sh contient talloc et libandroid-shmem
    // (liés statiquement). Pour un ancien APK qui les avait en bibliothèques séparées,
    // libtalloc.so est rendue visible sous son nom attendu (libtalloc.so.2).
    // Le lien est recréé à chaque fois : le dossier natif change à chaque mise à jour.
    val lib = File(dossier, "lib").apply { mkdirs() }
    val talloc = File(lib, "libtalloc.so.2")
    talloc.delete()
    if (natif(ctx, "libtalloc.so").exists()) {
      Os.symlink(natif(ctx, "libtalloc.so").absolutePath, talloc.absolutePath)
    }
    val tmp = File(ctx.cacheDir, "proot").apply { mkdirs() }

    val env = mutableListOf(
      "LD_LIBRARY_PATH=${lib.absolutePath}:${ctx.applicationInfo.nativeLibraryDir}",
      "PROOT_LOADER=${natif(ctx, "libproot-loader.so").absolutePath}",
      "PROOT_TMP_DIR=${tmp.absolutePath}",
      "PROOT_NO_SECCOMP=1",
      "HOME=/root",
      "TERM=xterm-256color",
    )
    val loader32 = natif(ctx, "libproot-loader32.so")
    if (loader32.exists()) env += "PROOT_LOADER_32=${loader32.absolutePath}"

    val proot = natif(ctx, "libproot.so").absolutePath
    val args = arrayOf(
      proot,
      "--kill-on-exit",
      "--link2symlink",
      "-0",
      "-r", racine(ctx).absolutePath,
      "-b", "/dev",
      "-b", "/proc",
      "-b", "/sys",
      "-b", "${Telephone.maison(ctx).absolutePath}:/telephone",
      "-w", "/root",
      // Environnement propre pour le Linux (sans les variables d'Android).
      "/usr/bin/env", "-i",
      "HOME=/root",
      "TERM=xterm-256color",
      "COLORTERM=truecolor",
      "LANG=C.UTF-8",
      "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      "/bin/sh", "-l",
    )
    return Triple(proot, args, env.toTypedArray())
  }

  // ---------- Outils ----------

  /** Lit un petit fichier texte, avec des délais d'attente (réseau mobile instable). */
  private fun lireTexte(url: String): String {
    val cnx = URL(url).openConnection() as HttpURLConnection
    cnx.connectTimeout = 20_000
    cnx.readTimeout = 30_000
    try {
      if (cnx.responseCode != 200) throw IOException("Serveur d'Alpine injoignable (HTTP ${cnx.responseCode})")
      return cnx.inputStream.bufferedReader().use { it.readText() }
    } finally {
      cnx.disconnect()
    }
  }

  private fun telecharger(url: String, dest: File, progression: (Int) -> Unit) {
    val cnx = URL(url).openConnection() as HttpURLConnection
    cnx.connectTimeout = 20_000
    cnx.readTimeout = 60_000
    try {
      if (cnx.responseCode != 200) throw IOException("Téléchargement impossible (HTTP ${cnx.responseCode})")
      val total = cnx.contentLengthLong
      var recu = 0L
      var dernier = -1
      cnx.inputStream.use { entree ->
        FileOutputStream(dest).use { sortie ->
          val tampon = ByteArray(64 * 1024)
          while (true) {
            val n = entree.read(tampon)
            if (n < 0) break
            sortie.write(tampon, 0, n)
            recu += n
            if (total > 0) {
              val p = (recu * 100 / total).toInt()
              if (p != dernier) { dernier = p; progression(p) }
            }
          }
        }
      }
    } finally {
      cnx.disconnect()
    }
  }

  private fun lireComplet(entree: InputStream, tampon: ByteArray, taille: Int = tampon.size): Boolean {
    var lu = 0
    while (lu < taille) {
      val n = entree.read(tampon, lu, taille - lu)
      if (n < 0) return false
      lu += n
    }
    return true
  }

  private fun lireDonnees(entree: InputStream, taille: Long): ByteArray {
    val donnees = ByteArray(taille.toInt())
    if (!lireComplet(entree, donnees)) throw IOException("Archive tronquée")
    sauter(entree, (512 - taille % 512) % 512)
    return donnees
  }

  private fun sauter(entree: InputStream, n: Long) {
    var reste = n
    val tampon = ByteArray(8192)
    while (reste > 0) {
      val lu = entree.read(tampon, 0, minOf(reste, tampon.size.toLong()).toInt())
      if (lu < 0) throw IOException("Archive tronquée")
      reste -= lu
    }
  }

  private fun texte(b: ByteArray, debut: Int, longueur: Int): String {
    var fin = debut
    while (fin < debut + longueur && b[fin] != 0.toByte()) fin++
    return String(b, debut, fin - debut, Charsets.UTF_8)
  }

  private fun octal(b: ByteArray, debut: Int, longueur: Int): Long {
    val t = texte(b, debut, longueur).trim()
    return if (t.isEmpty()) 0 else t.toLong(8)
  }

  /** Chemin sûr à l'intérieur de `dest` (refuse les « .. »). */
  private fun cheminSur(dest: File, nom: String): File? {
    var propre = nom.trimEnd('/')
    while (propre.startsWith("./") || propre.startsWith("/")) propre = propre.removePrefix("./").removePrefix("/")
    if (propre.isEmpty() || propre == ".") return null
    if (propre.split('/').any { it == ".." }) return null
    return File(dest, propre)
  }

  /** Extrait une archive .tar.gz en gardant liens symboliques et permissions. */
  private fun extraireTarGz(archive: File, dest: File) {
    GZIPInputStream(BufferedInputStream(FileInputStream(archive), 64 * 1024)).use { entree ->
      val entete = ByteArray(512)
      var nomPax: String? = null
      var lienPax: String? = null
      val liensDurs = mutableListOf<Pair<File, File>>()

      while (lireComplet(entree, entete)) {
        if (entete.all { it == 0.toByte() }) break
        var nom = texte(entete, 0, 100)
        val mode = octal(entete, 100, 8).toInt()
        val taille = octal(entete, 124, 12)
        val type = entete[156].toInt().toChar()
        var lien = texte(entete, 157, 100)
        if (texte(entete, 257, 6).startsWith("ustar")) {
          val prefixe = texte(entete, 345, 155)
          if (prefixe.isNotEmpty()) nom = "$prefixe/$nom"
        }

        when (type) {
          'x' -> { // en-tête PAX : nom ou lien longs
            val pax = String(lireDonnees(entree, taille), Charsets.UTF_8)
            for (ligne in pax.split('\n')) {
              val kv = ligne.substringAfter(' ', "")
              if (kv.startsWith("path=")) nomPax = kv.removePrefix("path=")
              if (kv.startsWith("linkpath=")) lienPax = kv.removePrefix("linkpath=")
            }
            continue
          }
          'L' -> { nomPax = String(lireDonnees(entree, taille), Charsets.UTF_8).trimEnd('\u0000'); continue }
          'K' -> { lienPax = String(lireDonnees(entree, taille), Charsets.UTF_8).trimEnd('\u0000'); continue }
          'g' -> { lireDonnees(entree, taille); continue }
        }
        nomPax?.let { nom = it }
        lienPax?.let { lien = it }
        nomPax = null
        lienPax = null

        val cible = cheminSur(dest, nom)
        if (cible == null) {
          sauter(entree, (taille + 511) / 512 * 512)
          continue
        }
        when (type) {
          '5' -> {
            cible.mkdirs()
            Os.chmod(cible.absolutePath, (mode and 0x1FF) or 0x1C0)
          }
          '2' -> {
            cible.parentFile?.mkdirs()
            cible.delete()
            Os.symlink(lien, cible.absolutePath)
          }
          '1' -> cheminSur(dest, lien)?.let { liensDurs += cible to it }
          '0', '\u0000', '7' -> {
            cible.parentFile?.mkdirs()
            cible.delete()
            FileOutputStream(cible).use { sortie ->
              var reste = taille
              val tampon = ByteArray(64 * 1024)
              while (reste > 0) {
                val n = entree.read(tampon, 0, minOf(reste, tampon.size.toLong()).toInt())
                if (n < 0) throw IOException("Archive tronquée")
                sortie.write(tampon, 0, n)
                reste -= n
              }
            }
            sauter(entree, (512 - taille % 512) % 512)
            Os.chmod(cible.absolutePath, (mode and 0x1FF) or 0x180)
            continue
          }
        }
        // Types sans données utiles (ou ignorés) : on saute leur contenu éventuel.
        if (type != '0') sauter(entree, (taille + 511) / 512 * 512)
      }

      // Liens « durs » : copiés (PRoot les gère mal sur Android).
      for ((cible, source) in liensDurs) {
        if (source.isFile) {
          cible.parentFile?.mkdirs()
          source.copyTo(cible, overwrite = true)
          if (source.canExecute()) cible.setExecutable(true, false)
        }
      }
    }
  }
}
