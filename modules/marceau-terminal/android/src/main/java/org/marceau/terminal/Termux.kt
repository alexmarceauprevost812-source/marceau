// SPDX-License-Identifier: MIT
package org.marceau.terminal

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.core.content.ContextCompat
import java.io.IOException
import java.util.concurrent.atomic.AtomicInteger

/**
 * Option 2 : envoyer des commandes à Termux (intent RUN_COMMAND) et récupérer le résultat.
 * Prérequis dans Termux : `allow-external-apps = true` dans ~/.termux/termux.properties.
 */
internal object Termux {
  const val PAQUET = "com.termux"
  const val PERMISSION = "com.termux.permission.RUN_COMMAND"
  private const val BASH = "/data/data/com.termux/files/usr/bin/bash"
  const val MAISON = "/data/data/com.termux/files/home"
  private val compteur = AtomicInteger(0)

  fun installe(ctx: Context) =
    try {
      ctx.packageManager.getPackageInfo(PAQUET, 0)
      true
    } catch (ignore: PackageManager.NameNotFoundException) {
      false
    }

  fun permissionAccordee(ctx: Context) =
    ContextCompat.checkSelfPermission(ctx, PERMISSION) == PackageManager.PERMISSION_GRANTED

  private fun intentionDeBase(script: String, dossier: String, arrierePlan: Boolean) =
    Intent("com.termux.RUN_COMMAND").apply {
      setClassName(PAQUET, "com.termux.app.RunCommandService")
      putExtra("com.termux.RUN_COMMAND_PATH", BASH)
      putExtra("com.termux.RUN_COMMAND_ARGUMENTS", arrayOf("-c", script))
      putExtra("com.termux.RUN_COMMAND_WORKDIR", dossier)
      putExtra("com.termux.RUN_COMMAND_BACKGROUND", arrierePlan)
    }

  private fun demarrer(ctx: Context, intention: Intent) {
    if (!installe(ctx)) throw IOException("Termux n'est pas installé.")
    if (!permissionAccordee(ctx)) throw IOException("Permission Termux refusée.")
    try {
      ctx.startService(intention)
    } catch (ignore: IllegalStateException) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(intention) else throw IOException("Termux ne répond pas.")
    }
  }

  /** Ouvre la commande dans l'appli Termux elle-même (vrai terminal plein écran). */
  fun ouvrir(ctx: Context, script: String) {
    demarrer(ctx, intentionDeBase(script, MAISON, false))
  }

  /** Lance la commande en arrière-plan ; `surResultat` reçoit stdout, stderr, code. */
  fun executer(ctx: Context, script: String, dossier: String, surResultat: (Map<String, Any?>) -> Unit) {
    val action = "${ctx.packageName}.TERMUX_RESULTAT_${compteur.incrementAndGet()}"
    val recepteur = object : BroadcastReceiver() {
      override fun onReceive(c: Context, intent: Intent) {
        try { ctx.unregisterReceiver(this) } catch (ignore: Exception) {}
        val r: Bundle? = intent.getBundleExtra("result")
        surResultat(
          mapOf(
            "stdout" to (r?.getString("stdout") ?: ""),
            "stderr" to (r?.getString("stderr") ?: ""),
            "code" to (r?.getInt("exitCode", -1) ?: -1),
            "erreur" to (r?.getString("errmsg")),
          ),
        )
      }
    }
    ContextCompat.registerReceiver(ctx, recepteur, IntentFilter(action), ContextCompat.RECEIVER_NOT_EXPORTED)

    val retour = Intent(action).setPackage(ctx.packageName)
    val drapeaux = PendingIntent.FLAG_ONE_SHOT or
      (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
    val enAttente = PendingIntent.getBroadcast(ctx, compteur.get(), retour, drapeaux)

    val intention = intentionDeBase(script, dossier, true)
    intention.putExtra("com.termux.RUN_COMMAND_PENDING_INTENT", enAttente)
    try {
      demarrer(ctx, intention)
    } catch (e: Exception) {
      try { ctx.unregisterReceiver(recepteur) } catch (ignore: Exception) {}
      throw e
    }
  }
}
