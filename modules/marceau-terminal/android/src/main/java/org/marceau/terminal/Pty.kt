package org.marceau.terminal

import android.os.ParcelFileDescriptor
import android.system.Os
import android.system.OsConstants
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStreamReader
import kotlin.concurrent.thread

/** Fonctions C (pty.c) pour créer un vrai pseudo-terminal. */
internal object Pty {
  init {
    System.loadLibrary("marceau_pty")
  }

  @JvmStatic
  external fun lancer(
    cmd: String,
    cwd: String,
    args: Array<String>,
    env: Array<String>,
    pid: IntArray,
    lignes: Int,
    colonnes: Int,
  ): Int

  @JvmStatic external fun redimensionner(fd: Int, lignes: Int, colonnes: Int)

  @JvmStatic external fun attendre(pid: Int): Int
}

/** Une session de terminal ouverte (téléphone, Linux ou SSH). */
internal interface Session {
  fun ecrire(texte: String)
  fun redimensionner(colonnes: Int, lignes: Int)
  fun fermer()
}

/** Programme local (sh du téléphone ou PRoot) branché sur un PTY. */
internal class SessionPty(
  private val id: String,
  commande: String,
  dossier: String,
  args: Array<String>,
  env: Array<String>,
  colonnes: Int,
  lignes: Int,
  private val surSortie: (String, String) -> Unit,
  private val surFin: (String, Int) -> Unit,
) : Session {
  private val pid: Int
  private val fd: Int
  private val pfd: ParcelFileDescriptor
  private val ecriture: FileOutputStream

  @Volatile private var terminee = false

  init {
    val p = IntArray(1)
    fd = Pty.lancer(commande, dossier, args, env, p, lignes, colonnes)
    pid = p[0]
    pfd = ParcelFileDescriptor.adoptFd(fd)
    ecriture = FileOutputStream(pfd.fileDescriptor)

    val lecture = thread(name = "pty-lecture-$id", isDaemon = true) {
      val lecteur = InputStreamReader(FileInputStream(pfd.fileDescriptor), Charsets.UTF_8)
      val tampon = CharArray(16 * 1024)
      try {
        while (true) {
          val n = lecteur.read(tampon)
          if (n < 0) break
          if (n > 0) surSortie(id, String(tampon, 0, n))
        }
      } catch (ignore: IOException) {
        // Normal quand le programme se termine (EIO).
      }
    }

    thread(name = "pty-attente-$id", isDaemon = true) {
      val code = Pty.attendre(pid)
      lecture.join(300) // laisse le temps d'afficher les derniers messages
      terminee = true
      surFin(id, code)
      try { pfd.close() } catch (ignore: IOException) {}
    }
  }

  override fun ecrire(texte: String) {
    if (terminee) return
    try {
      ecriture.write(texte.toByteArray(Charsets.UTF_8))
      ecriture.flush()
    } catch (ignore: IOException) {}
  }

  override fun redimensionner(colonnes: Int, lignes: Int) {
    if (!terminee) Pty.redimensionner(fd, lignes, colonnes)
  }

  override fun fermer() {
    if (terminee) return
    try { Os.kill(pid, OsConstants.SIGHUP) } catch (ignore: Exception) {}
    thread(isDaemon = true) {
      Thread.sleep(1500)
      if (!terminee) try { Os.kill(pid, OsConstants.SIGKILL) } catch (ignore: Exception) {}
    }
  }
}
