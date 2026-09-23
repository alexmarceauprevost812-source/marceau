package org.marceau.terminal

import android.content.Context
import java.io.File

/** Option 1 : le shell d'Android (/system/bin/sh), sans root. */
internal object Telephone {
  fun maison(ctx: Context): File = File(ctx.filesDir, "maison").apply { mkdirs() }

  fun commande(ctx: Context): Triple<String, Array<String>, Array<String>> {
    val maison = maison(ctx)
    // Fichier de démarrage du shell (modifiable par l'utilisateur).
    val rc = File(maison, ".mkshrc")
    if (!rc.exists()) {
      rc.writeText(
        """
        |# Démarrage du terminal Marceau (shell du téléphone)
        |PS1='marceau:${'$'}{PWD#${'$'}HOME/} ${'$'} '
        |alias ll='ls -la'
        |cd "${'$'}HOME"
        |""".trimMargin(),
      )
    }
    val env = HashMap(System.getenv())
    env["HOME"] = maison.absolutePath
    env["ENV"] = rc.absolutePath
    env["TMPDIR"] = ctx.cacheDir.absolutePath
    env["TERM"] = "xterm-256color"
    env["LANG"] = "C.UTF-8"
    val vars = env.map { (k, v) -> "$k=$v" }.toTypedArray()
    return Triple("/system/bin/sh", arrayOf("sh", "-i"), vars)
  }
}
