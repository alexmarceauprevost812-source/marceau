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
import org.tukaani.xz.XZInputStream
import java.security.MessageDigest

/**
 * Option 4 : un vrai petit Linux — le rootfs officiel **Kali NetHunter** — dans l'appli,
 * lancé avec PRoot. `apt install python3 git nodejs…` fonctionne ensuite comme sur un ordinateur,
 * avec les outils de sécurité de Kali directement dans les dépôts officiels.
 */
internal object Linux {
  private const val MARQUEUR = ".marceau-installe"
  /** Préfixe du fichier attendu dans le marqueur : distingue un Kali installé d'un ancien Alpine
   *  (versions précédentes de l'appli) qu'il faut réinstaller entièrement. */
  private const val PREFIXE_MARQUEUR = "kali-"
  private const val PAQUETS_BASE = ".marceau-paquets-base"

  private fun dossier(ctx: Context) = File(ctx.filesDir, "linux")
  private fun racine(ctx: Context) = File(dossier(ctx), "racine")
  private fun natif(ctx: Context, nom: String) = File(ctx.applicationInfo.nativeLibraryDir, nom)

  // PRoot est compilé pour Android 8+ (libandroid-shmem utilise ASharedMemory).
  fun prootDisponible(ctx: Context) =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && natif(ctx, "libproot.so").exists()

  /** Installé ET c'est bien un rootfs Kali (un ancien Alpine encore présent est traité comme non installé). */
  fun installe(ctx: Context): Boolean {
    val marqueur = File(racine(ctx), MARQUEUR)
    if (!marqueur.exists()) return false
    return try { marqueur.readText().trim().startsWith(PREFIXE_MARQUEUR) } catch (ignore: Exception) { false }
  }

  /**
   * Outils installés avec « apt install » : les paquets dpkg présents maintenant, moins
   * l'instantané des paquets déjà là juste après l'installation du rootfs (paquets de base),
   * moins les paquets qu'APT a installés lui-même comme DÉPENDANCES (« Auto-Installed » dans
   * extended_states) — sinon installer un seul outil comme nmap remplirait la liste avec ses
   * bibliothèques (libpcap…), qui ne sont pas des commandes à lancer.
   * Contrairement à une liste figée, ça reste juste même si Kali change ses paquets de base.
   */
  fun outilsInstalles(ctx: Context): List<String> {
    if (!installe(ctx)) return emptyList()
    val racine = racine(ctx)
    val base = try {
      File(racine, PAQUETS_BASE).readLines().toSet()
    } catch (ignore: Exception) {
      emptySet()
    }
    val auto = paquetsAutoInstalles(racine)
    return paquetsDpkg(racine).filterNot { it in base || it in auto }.sorted()
  }

  /** Paquets marqués « installés » dans /var/lib/dpkg/status (nom seulement, sans version). */
  private fun paquetsDpkg(racine: File): Set<String> {
    val fichier = File(racine, "var/lib/dpkg/status")
    if (!fichier.canRead()) return emptySet()
    val paquets = mutableSetOf<String>()
    var nom: String? = null
    var installe = false
    fun cloreEntree() {
      if (installe) nom?.let { paquets += it }
      nom = null
      installe = false
    }
    fichier.forEachLine { ligne ->
      when {
        ligne.startsWith("Package: ") -> { nom = ligne.removePrefix("Package: ").trim() }
        ligne.startsWith("Status: ") -> installe = ligne.contains("install ok installed")
        ligne.isBlank() -> cloreEntree()
      }
    }
    cloreEntree() // dpkg ne met pas toujours une ligne vide après la dernière entrée
    return paquets
  }

  /**
   * Paquets qu'APT a installés lui-même comme dépendances (« Auto-Installed: 1 » dans
   * /var/lib/apt/extended_states) — jamais des outils demandés explicitement par la personne.
   */
  private fun paquetsAutoInstalles(racine: File): Set<String> {
    val fichier = File(racine, "var/lib/apt/extended_states")
    if (!fichier.canRead()) return emptySet()
    val paquets = mutableSetOf<String>()
    var nom: String? = null
    var auto = false
    fun cloreEntree() {
      if (auto) nom?.let { paquets += it }
      nom = null
      auto = false
    }
    fichier.forEachLine { ligne ->
      when {
        ligne.startsWith("Package: ") -> { nom = ligne.removePrefix("Package: ").trim() }
        ligne.startsWith("Auto-Installed: ") -> auto = ligne.removePrefix("Auto-Installed: ").trim() == "1"
        ligne.isBlank() -> cloreEntree()
      }
    }
    cloreEntree()
    return paquets
  }

  /**
   * Architecture Debian/Kali correspondant au téléphone. Kali NetHunter ne publie de rootfs
   * qu'en ARM (téléphones/tablettes) : un appareil x86/x86_64 (rare, surtout des émulateurs)
   * n'a rien à télécharger — mieux vaut le dire clairement que de laisser échouer une recherche
   * de fichier qui ne trouvera jamais rien.
   */
  private fun archKali(): String =
    when (Build.SUPPORTED_ABIS.firstOrNull()) {
      "arm64-v8a" -> "arm64"
      "armeabi-v7a" -> "armhf"
      "x86_64", "x86" -> throw IOException(
        "Kali NetHunter ne publie pas de Linux intégré pour les processeurs x86 (ton téléphone : " +
          "${Build.SUPPORTED_ABIS.firstOrNull()}) — seulement pour les processeurs ARM (la grande majorité des téléphones).",
      )
      else -> throw IOException("Processeur non pris en charge : ${Build.SUPPORTED_ABIS.joinToString()}")
    }

  /** Télécharge et installe le rootfs minimal officiel de Kali NetHunter (plusieurs centaines de Mo). */
  fun installer(ctx: Context, progression: (String, Int) -> Unit) {
    if (!prootDisponible(ctx)) {
      throw IOException("Le Linux intégré demande Android 8 ou plus récent, et PRoot inclus dans l'APK (voir scripts/construire-linux.sh).")
    }
    val arch = archKali()
    val base = "https://kali.download/nethunter-images/current/rootfs"
    progression("Recherche du fichier sur le serveur de Kali…", 0)
    // « minimal » d'abord (le plus petit) ; « full » (bien plus gros) seulement si Kali répond
    // clairement « fichier absent » (404) pour « minimal » — jamais sur une simple panne réseau
    // (coupure, délai dépassé…), qui lancerait sinon un téléchargement bien plus gros que prévu.
    fun candidat(edition: String): String? {
      val nom = "kali-nethunter-rootfs-$edition-$arch.tar.xz"
      return if (urlExisteVraiment("$base/$nom")) nom else null
    }
    val fichier = candidat("minimal") ?: candidat("full")
      ?: throw IOException("Aucun rootfs Kali trouvé pour cette architecture ($arch) sur le serveur officiel. Réessaie plus tard.")

    progression("Vérification de l'empreinte officielle…", 0)
    val verif = empreinteAttendue(base, fichier)

    val archive = File(ctx.cacheDir, fichier)
    val temporaire = File(dossier(ctx), "racine-tmp")
    // Si une étape échoue (disque plein, coupure réseau…), on efface ce qu'on a commencé à
    // écrire — l'archive téléchargée ET le rootfs à moitié extrait — pour ne pas laisser
    // plusieurs centaines de Mo inutiles, surtout gênants quand la panne vient d'un disque plein.
    try {
      telecharger("$base/$fichier", archive) { p -> progression("Téléchargement de Kali Linux…", p) }

      progression("Vérification du fichier…", 100)
      if (verif != null) {
        val (algo, empreinteAttendue) = verif
        if (empreinte(algo, archive) != empreinteAttendue) {
          throw IOException("Le fichier de Kali téléchargé est corrompu ou modifié (empreinte $algo différente). Réessaie.")
        }
      }
      // Kali ne publie pas toujours d'empreinte à côté de ce fichier (constaté sur leurs serveurs) :
      // dans ce cas on continue sans cette vérification supplémentaire — le téléchargement passe
      // quand même par une connexion chiffrée (HTTPS) vers le serveur officiel de Kali.

      progression("Installation des fichiers (ça prend un moment)…", 100)
      supprimerSansSuivre(temporaire)
      temporaire.mkdirs()
      extraireTarXz(archive, temporaire)

      File(temporaire, MARQUEUR).writeText(fichier)
      File(temporaire, PAQUETS_BASE).writeText(paquetsDpkg(temporaire).sorted().joinToString("\n"))
      ecrireConfig(temporaire)
    } catch (e: Exception) {
      archive.delete()
      supprimerSansSuivre(temporaire)
      throw e
    }
    archive.delete()

    val racine = racine(ctx)
    supprimerSansSuivre(racine)
    if (!temporaire.renameTo(racine)) throw IOException("Impossible de finaliser l'installation")
  }

  /** Numéro de la configuration écrite : on met à jour un ancien Linux quand ce numéro change. */
  private const val VERSION_CONFIG = 2
  private const val MARQUEUR_CONFIG = ".marceau-config"

  /** Écrit DNS, dépôts et la commande d'aide « outils » dans un rootfs Kali. */
  private fun ecrireConfig(racine: File) {
    File(racine, "etc").mkdirs()
    File(racine, "etc/resolv.conf").apply { delete() }.writeText("nameserver 1.1.1.1\nnameserver 8.8.8.8\n")
    File(racine, "root").mkdirs()

    // Dépôts officiels de Kali (rolling release : pas de branche à épingler comme sur Alpine).
    File(racine, "etc/apt").mkdirs()
    File(racine, "etc/apt/sources.list").writeText(
      "deb https://http.kali.org/kali kali-rolling main non-free non-free-firmware contrib\n",
    )

    File(racine, "etc/profile.d").mkdirs()
    File(racine, "etc/profile.d/marceau.sh").writeText(
      """
      |# Couleurs du terminal de Marceau : nom d'utilisateur en vert lime, le reste en blanc.
      |export PS1='\[\e[38;2;166;255;0m\]\u\[\e[38;2;255;255;255m\]@kali:\w\$ \[\e[0m\]'
      |alias ll='ls -la'
      |# « outils » : rappelle comment installer des outils (tu choisis, tu télécharges).
      |outils() {
      |  echo 'Installe un outil avec :  apt install <nom>   (ex. apt install nmap)'
      |  echo 'Mets à jour la liste des paquets une fois :  apt update'
      |  echo
      |  echo 'Réseau      : nmap tcpdump netcat-traditional dnsutils curl wget'
      |  echo 'Mots de passe: john hashcat hydra'
      |  echo 'Wi-Fi       : aircrack-ng wireless-tools'
      |  echo 'Web         : nikto sqlmap whatweb'
      |  echo 'Programmation: python3 python3-pip git nodejs npm gcc make'
      |  echo
      |  echo 'Cherche un paquet :  apt search <mot>'
      |  echo 'Sers-toi de ces outils uniquement sur TES appareils/réseaux ou avec autorisation écrite.'
      |}
      |echo 'Bienvenue dans Kali Linux. Tape  outils  pour voir comment installer des programmes.'
      |""".trimMargin() + "\n",
    )
    File(racine, MARQUEUR_CONFIG).writeText(VERSION_CONFIG.toString())
  }

  /** Met à jour la config d'un Linux déjà installé avant cette version de l'appli. */
  private fun migrerConfig(ctx: Context) {
    val racine = racine(ctx)
    val marqueur = File(racine, MARQUEUR_CONFIG)
    if (marqueur.exists() && marqueur.readText().trim() == VERSION_CONFIG.toString()) return
    try { ecrireConfig(racine) } catch (ignore: Exception) {}
  }

  /**
   * Empreinte officielle du fichier, si Kali en publie une : essaie plusieurs conventions vues sur
   * leurs serveurs (un fichier `<archive>.sha512sum`/`.sha256sum` à côté de l'archive, sinon un
   * fichier récapitulatif `SHA512SUMS`/`SHA256SUMS` dans le même dossier). `null` si aucune de ces
   * conventions ne répond (ça arrive : leurs serveurs ne publient pas toujours ce fichier) — dans
   * ce cas l'appelant installe quand même, sans cette vérification supplémentaire.
   */
  private fun empreinteAttendue(base: String, fichier: String): Pair<String, String>? {
    fun motEmpreinte(texte: String) =
      Regex("""\b[0-9a-fA-F]{64,128}\b""").find(texte)?.value?.lowercase()

    for ((suffixe, algo) in listOf(".sha512sum" to "SHA-512", ".sha256sum" to "SHA-256")) {
      val trouve = try { motEmpreinte(lireTexte("$base/$fichier$suffixe")) } catch (ignore: Exception) { null }
      if (trouve != null) return algo to trouve
    }
    for ((nom, algo) in listOf("SHA512SUMS" to "SHA-512", "SHA256SUMS" to "SHA-256")) {
      val ligne = try {
        lireTexte("$base/$nom").lines().firstOrNull { it.contains(fichier) }
      } catch (ignore: Exception) {
        null
      }
      val trouve = ligne?.let { motEmpreinte(it) }
      if (trouve != null) return algo to trouve
    }
    return null
  }

  private fun empreinte(algo: String, f: File): String {
    val md = MessageDigest.getInstance(algo)
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
      // bash (shell par défaut de Kali) : historique et édition de ligne, contrairement à dash (/bin/sh).
      "/bin/bash", "-l",
    )
    return Triple(proot, args, env.toTypedArray())
  }

  // ---------- Outils ----------

  /**
   * Le fichier existe-t-il vraiment (HEAD, sans télécharger le contenu) ? `true` pour 200-299,
   * `false` seulement pour un 404 (Kali dit clairement « ce fichier n'existe pas »). Toute autre
   * panne (coupure réseau, délai dépassé, erreur serveur…) est relancée comme une vraie erreur —
   * jamais traitée comme « n'existe pas », ce qui déclencherait à tort un repli sur un fichier
   * bien plus gros (« full ») à la moindre instabilité du réseau mobile.
   */
  private fun urlExisteVraiment(url: String): Boolean {
    val cnx = URL(url).openConnection() as HttpURLConnection
    cnx.requestMethod = "HEAD"
    cnx.connectTimeout = 15_000
    cnx.readTimeout = 15_000
    try {
      val code = cnx.responseCode
      if (code in 200..299) return true
      if (code == 404) return false
      throw IOException("Réponse inattendue du serveur de Kali (HTTP $code)")
    } finally {
      cnx.disconnect()
    }
  }

  /** Lit un petit fichier texte, avec des délais d'attente (réseau mobile instable). */
  private fun lireTexte(url: String): String {
    val cnx = URL(url).openConnection() as HttpURLConnection
    cnx.connectTimeout = 20_000
    cnx.readTimeout = 30_000
    try {
      if (cnx.responseCode != 200) throw IOException("Serveur de Kali injoignable (HTTP ${cnx.responseCode})")
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

  /** Extrait une archive .tar.xz en gardant liens symboliques et permissions. */
  private fun extraireTarXz(archive: File, dest: File) {
    XZInputStream(BufferedInputStream(FileInputStream(archive), 64 * 1024)).use { entree ->
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
