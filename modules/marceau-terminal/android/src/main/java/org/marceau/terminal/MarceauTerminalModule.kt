// SPDX-License-Identifier: MIT
package org.marceau.terminal

import android.content.Context
import android.os.Build
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import kotlin.concurrent.thread

/**
 * Le Terminal de Marceau :
 *  - « Téléphone » : shell Android (option 1)
 *  - « Termux »    : commandes envoyées à l'appli Termux (option 2)
 *  - « SSH »       : terminal vers un ordinateur (option 3)
 *  - « Linux »     : Kali Linux intégré (rootfs officiel NetHunter) avec PRoot (option 4)
 */
class MarceauTerminalModule : Module() {
  private val sessions = ConcurrentHashMap<String, Session>()

  private val ctx: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  /**
   * Numéro de la session en cours pour chaque id. Une session remplacée ou fermée peut encore
   * écrire ou se terminer un peu plus tard : on ignore alors ses messages, pour ne pas
   * afficher sa sortie ni annoncer la fin de la session qui l'a remplacée.
   */
  private val generations = ConcurrentHashMap<String, Long>()
  private val compteur = AtomicLong(0)

  /** Réserve l'id pour une nouvelle session et ferme l'ancienne. */
  private fun nouvelleGeneration(id: String): Long {
    val generation = compteur.incrementAndGet()
    generations[id] = generation
    sessions.remove(id)?.fermer()
    return generation
  }

  private fun actuelle(id: String, generation: Long) = generations[id] == generation

  private fun surSortie(generation: Long): (String, String) -> Unit = { id: String, texte: String ->
    if (actuelle(id, generation)) sendEvent("onSortie", mapOf("id" to id, "donnees" to texte))
  }

  private fun surFin(generation: Long): (String, Int) -> Unit = { id: String, code: Int ->
    if (generations.remove(id, generation)) {
      sessions.remove(id)
      sendEvent("onFin", mapOf("id" to id, "code" to code))
    }
  }

  /** Enregistre la session, sauf si elle a été fermée ou remplacée entre-temps. */
  private fun publier(id: String, generation: Long, session: Session): Boolean {
    sessions[id] = session
    if (actuelle(id, generation)) return true
    sessions.remove(id, session)
    session.fermer()
    return false
  }

  private fun ouvrirPty(id: String, commande: Triple<String, Array<String>, Array<String>>, dossier: String, colonnes: Int, lignes: Int) {
    val generation = nouvelleGeneration(id)
    val (cmd, args, env) = commande
    publier(id, generation, SessionPty(id, cmd, dossier, args, env, colonnes, lignes, surSortie(generation), surFin(generation)))
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
    Function("outilsLinux") { Linux.outilsInstalles(ctx) }

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
      // La connexion peut durer plusieurs secondes : si l'utilisateur annule (fermer) ou
      // relance entre-temps, la session obtenue est fermée au lieu d'être publiée.
      val generation = nouvelleGeneration(id)
      thread(name = "connexion-ssh") {
        try {
          val session = SessionSsh(id, ctx, options, colonnes, lignes, surSortie(generation), surFin(generation))
          if (publier(id, generation, session)) promise.resolve(null)
          else promise.reject("ERR_SSH", "Connexion annulée", null)
        } catch (e: Exception) {
          generations.remove(id, generation)
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
      generations.remove(id)
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
      generations.clear()
      sessions.values.forEach { it.fermer() }
      sessions.clear()
    }
  }
}
