package org.marceau.lexos

import android.content.Intent
import com.termux.app.TermuxActivity
import com.termux.app.TermuxApplication
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/** Pont entre Marceau (JS) et le terminal LexOS (fork de Termux) embarqué dans l'APK. */
class LexosTerminalModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LexosTerminal")

    // Le moteur est-il dans l'APK ? (vrai dès que le module est compilé)
    Function("disponible") { true }

    // Le bootstrap (bash, apt…) est-il installé ? Faux avant le premier lancement du terminal.
    Function("bootstrapInstalle") {
      val ctx = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      File(ctx.filesDir, "usr/bin/bash").exists()
    }

    // Ouvre le terminal LexOS (l'installation du bootstrap se fait au premier lancement).
    Function("ouvrir") {
      val ctx = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      TermuxApplication.demarrer(ctx)
      val intent = Intent(ctx, TermuxActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      ctx.startActivity(intent)
    }
  }
}
