package org.marceau.terminal

import android.content.Context
import android.os.Build
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.ConcurrentHashMap
import kotlin.concurrent.thread

/**
 * Le Terminal de Marceau :
 *  - « Téléphone » : shell Android (option 1)
 *  - « Termux »    : commandes envoyées à l'appli Termux (option 2)
 *  - « SSH »       : terminal vers un ordinateur (option 3)
 *  - « Linux »     : Alpine Linux intégré avec PRoot (option 4)
 */
class MarceauTerminalModule : Module() {
  private val sessions = ConcurrentHashMap<String, Session>()

  private val ctx: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun surSortie(id: String, texte: String) {
    sendEvent("onSortie", mapOf("id" to id, "donnees" to texte))
  }

  private fun surFin(id: String, code: Int) {
    sessions.remove(id)
    sendEvent("onFin", mapOf("id" to id, "code" to code))
  }

  private fun ouvrirPty(id: String, commande: Triple<String, Array<String>, Array<String>>, dossier: String, colonnes: Int, lignes: Int) {
    sessions.remove(id)?.fermer()
    val (cmd, args, env) = commande
    sessions[id] = SessionPty(id, cmd, dossier, args, env, colonnes, lignes, ::surSortie, ::surFin)
  }

  override fun definition() = ModuleDefinition {
    Name("MarceauTerminal")

    Events("onSortie", "onFin", "onLinux")

    Function("infos") {
      mapOf(
        "abi" to (Build.SUPPORTED_ABIS.firstOrNull() ?: "?"),
        "prootDisponible" to Linux.prootDisponible(ctx),
        "linuxInstalle" to Linux.installe(ctx),
        "termuxInstalle" to Termux.installe(ctx),
        "termuxPermission" to Termux.permissionAccordee(ctx),
        "maison" to Telephone.maison(ctx).absolutePath,
      )
    }

    // ---------- Option 1 : téléphone ----------
    AsyncFunction("ouvrirTelephone") { id: String, colonnes: Int, lignes: Int ->
      ouvrirPty(id, Telephone.commande(ctx), Telephone.maison(ctx).absolutePath, colonnes, lignes)
    }

    // ---------- Option 4 : Linux ----------
    AsyncFunction("installerLinux") { promise: Promise ->
      thread(name = "installation-linux") {
        try {
          Linux.installer(ctx) { etape, pourcent ->
            sendEvent("onLinux", mapOf("etape" to etape, "pourcent" to pourcent))
          }
          promise.resolve(null)
        } catch (e: Exception) {
          promise.reject("ERR_LINUX", e.message ?: "Installation impossible", e)
        }
      }
    }

    AsyncFunction("supprimerLinux") {
      Linux.supprimer(ctx)
    }

    AsyncFunction("ouvrirLinux") { id: String, colonnes: Int, lignes: Int ->
      ouvrirPty(id, Linux.commande(ctx), "/", colonnes, lignes)
    }

    // ---------- Option 3 : SSH ----------
    AsyncFunction("ouvrirSsh") { id: String, options: Map<String, Any?>, colonnes: Int, lignes: Int, promise: Promise ->
      thread(name = "connexion-ssh") {
        try {
          sessions.remove(id)?.fermer()
          sessions[id] = SessionSsh(id, ctx, options, colonnes, lignes, ::surSortie, ::surFin)
          promise.resolve(null)
        } catch (e: Exception) {
          promise.reject("ERR_SSH", e.message ?: "Connexion impossible", e)
        }
      }
    }

    AsyncFunction("oublierServeursSsh") {
      SessionSsh.oublierServeurs(ctx)
    }

    // ---------- Commun ----------
    AsyncFunction("ecrire") { id: String, texte: String ->
      sessions[id]?.ecrire(texte)
    }

    Function("redimensionner") { id: String, colonnes: Int, lignes: Int ->
      sessions[id]?.redimensionner(colonnes, lignes)
    }

    Function("fermer") { id: String ->
      sessions.remove(id)?.fermer()
    }

    // ---------- Option 2 : Termux ----------
    AsyncFunction("termux") { script: String, dossier: String, promise: Promise ->
      try {
        Termux.executer(ctx, script, dossier.ifEmpty { Termux.MAISON }) { resultat -> promise.resolve(resultat) }
      } catch (e: Exception) {
        promise.reject("ERR_TERMUX", e.message ?: "Termux ne répond pas", e)
      }
    }

    AsyncFunction("ouvrirDansTermux") { script: String ->
      Termux.ouvrir(ctx, script)
    }

    OnDestroy {
      sessions.values.forEach { it.fermer() }
      sessions.clear()
    }
  }
}
