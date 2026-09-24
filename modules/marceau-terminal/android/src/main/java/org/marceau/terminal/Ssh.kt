// SPDX-License-Identifier: MIT
package org.marceau.terminal

import android.content.Context
import com.jcraft.jsch.ChannelShell
import com.jcraft.jsch.JSch
import com.jcraft.jsch.JSchException
import com.jcraft.jsch.UserInfo
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.io.InputStreamReader
import java.io.OutputStream
import kotlin.concurrent.thread

/** Option 3 : terminal SSH vers un ordinateur (Ubuntu, serveur, Raspberry Pi…). */
internal class SessionSsh(
  private val id: String,
  ctx: Context,
  options: Map<String, Any?>,
  colonnes: Int,
  lignes: Int,
  private val surSortie: (String, String) -> Unit,
  private val surFin: (String, Int) -> Unit,
) : Session {
  private val session: com.jcraft.jsch.Session
  private val canal: ChannelShell
  private val ecriture: OutputStream

  init {
    val hote = (options["hote"] as? String)?.trim().orEmpty()
    val utilisateur = (options["utilisateur"] as? String)?.trim().orEmpty()
    val port = (options["port"] as? Number)?.toInt() ?: 22
    val motDePasse = options["motDePasse"] as? String
    val cle = options["cle"] as? String
    val phrase = options["phrase"] as? String
    if (hote.isEmpty() || utilisateur.isEmpty()) throw IOException("Adresse ou utilisateur manquant")

    val jsch = JSch()
    // Empreintes des serveurs déjà vus : un serveur dont la clé change est refusé.
    jsch.setKnownHosts(File(ctx.filesDir, "ssh_known_hosts").apply { if (!exists()) createNewFile() }.absolutePath)
    if (!cle.isNullOrBlank()) {
      jsch.addIdentity("marceau", cle.trim().toByteArray(), null, phrase?.takeIf { it.isNotEmpty() }?.toByteArray())
    }
    session = jsch.getSession(utilisateur, hote, port)
    if (!motDePasse.isNullOrEmpty()) session.setPassword(motDePasse)
    // « ask » + réponse automatique : un nouveau serveur est accepté et son empreinte enregistrée,
    // un serveur dont la clé a changé est refusé. (Avec « no », JSch accepte aussi une clé changée.)
    session.setConfig("StrictHostKeyChecking", "ask")
    session.userInfo = AccepterNouveauServeur
    session.setConfig("PreferredAuthentications", "publickey,password,keyboard-interactive")
    session.setServerAliveInterval(30_000)
    try {
      session.connect(15_000)
    } catch (e: JSchException) {
      throw IOException(messageClair(e), e)
    }

    val (ouvert, lecture, sortie) = ouvrirShell(colonnes, lignes)
    canal = ouvert
    ecriture = sortie

    surSortie(id, "\u001b[2mConnecté à $utilisateur@$hote — empreinte ${session.hostKey.getFingerPrint(jsch)}\u001b[0m\r\n")

    thread(name = "ssh-$id", isDaemon = true) {
      val lecteur = InputStreamReader(lecture, Charsets.UTF_8)
      val tampon = CharArray(16 * 1024)
      try {
        while (true) {
          val n = lecteur.read(tampon)
          if (n < 0) break
          if (n > 0) surSortie(id, String(tampon, 0, n))
        }
      } catch (ignore: IOException) {}
      val code = canal.exitStatus
      canal.disconnect()
      session.disconnect()
      surFin(id, code)
    }
  }

  /**
   * Ouvre le shell sur la connexion établie. En cas d'échec, la connexion est fermée :
   * sinon elle resterait ouverte (avec son fil de maintien) sans que personne ne la tienne.
   */
  private fun ouvrirShell(colonnes: Int, lignes: Int): Triple<ChannelShell, InputStream, OutputStream> {
    var ouvert: ChannelShell? = null
    try {
      val c = session.openChannel("shell") as ChannelShell
      ouvert = c
      c.setPtyType("xterm-256color")
      c.setPtySize(colonnes, lignes, 0, 0)
      c.setEnv("LANG", "C.UTF-8")
      // Les flux se prennent avant connect(), sinon le début de la sortie peut être perdu.
      val lecture = c.inputStream
      val sortie = c.outputStream
      c.connect(10_000)
      return Triple(c, lecture, sortie)
    } catch (e: Exception) {
      ouvert?.disconnect()
      session.disconnect()
      throw if (e is JSchException) IOException(messageClair(e), e) else e
    }
  }

  private fun messageClair(e: JSchException): String {
    val m = e.message.orEmpty()
    return when {
      m.contains("Auth fail", true) || m.contains("Auth cancel", true) -> "Identifiants refusés (mot de passe ou clé)."
      m.contains("HostKey has been changed", true) ->
        "La clé du serveur a changé depuis la dernière connexion. Par sécurité, la connexion est refusée. " +
          "Si c'est normal (ordi réinstallé), oublie ce serveur dans les réglages SSH."
      m.contains("timeout", true) || m.contains("timed out", true) -> "Pas de réponse de l'ordinateur (adresse, réseau ou pare-feu ?)."
      m.contains("refused", true) -> "Connexion refusée : le serveur SSH est-il démarré (sudo systemctl start ssh) ?"
      m.contains("UnknownHost", true) -> "Adresse introuvable."
      else -> m
    }
  }

  override fun ecrire(texte: String) {
    try {
      ecriture.write(texte.toByteArray(Charsets.UTF_8))
      ecriture.flush()
    } catch (ignore: IOException) {}
  }

  override fun redimensionner(colonnes: Int, lignes: Int) {
    try { canal.setPtySize(colonnes, lignes, 0, 0) } catch (ignore: Exception) {}
  }

  override fun fermer() {
    thread(isDaemon = true) {
      canal.disconnect()
      session.disconnect()
    }
  }

  /**
   * Réponses automatiques de JSch : oui seulement à « serveur jamais vu, continuer ? ».
   * Non à tout le reste, dont « la clé a changé, remplacer l'ancienne ? ».
   */
  private object AccepterNouveauServeur : UserInfo {
    override fun getPassphrase(): String? = null
    override fun getPassword(): String? = null
    override fun promptPassword(message: String?): Boolean = false
    override fun promptPassphrase(message: String?): Boolean = false
    override fun promptYesNo(message: String?): Boolean =
      message != null && message.contains("can't be established") && !message.contains("HAS CHANGED")
    override fun showMessage(message: String?) {}
  }

  companion object {
    /** Oublie les empreintes enregistrées (après une réinstallation de l'ordinateur). */
    fun oublierServeurs(ctx: Context) {
      File(ctx.filesDir, "ssh_known_hosts").delete()
    }
  }
}
