package org.marceau.terminal

import android.content.Context
import com.jcraft.jsch.ChannelShell
import com.jcraft.jsch.JSch
import com.jcraft.jsch.JSchException
import java.io.File
import java.io.IOException
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
    session.setConfig("StrictHostKeyChecking", "no") // accepte un nouveau serveur, refuse une clé changée
    session.setConfig("PreferredAuthentications", "publickey,password,keyboard-interactive")
    session.setServerAliveInterval(30_000)
    try {
      session.connect(15_000)
    } catch (e: JSchException) {
      throw IOException(messageClair(e), e)
    }

    canal = session.openChannel("shell") as ChannelShell
    canal.setPtyType("xterm-256color")
    canal.setPtySize(colonnes, lignes, 0, 0)
    canal.setEnv("LANG", "C.UTF-8")
    val lecture = canal.inputStream
    ecriture = canal.outputStream
    canal.connect(10_000)

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

  companion object {
    /** Oublie les empreintes enregistrées (après une réinstallation de l'ordinateur). */
    fun oublierServeurs(ctx: Context) {
      File(ctx.filesDir, "ssh_known_hosts").delete()
    }
  }
}
