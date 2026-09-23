/*
 * Pseudo-terminal (PTY) pour le Terminal de Marceau.
 *
 * Un PTY fait croire au programme lancé (sh, proot, vim…) qu'il parle à un vrai
 * écran de terminal : couleurs, curseur, Ctrl+C, redimensionnement, etc.
 */
#define _GNU_SOURCE
#include <jni.h>
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/wait.h>
#include <termios.h>
#include <unistd.h>

static char *copier_chaine(JNIEnv *env, jstring s) {
  if (s == NULL) return NULL;
  const char *c = (*env)->GetStringUTFChars(env, s, NULL);
  char *copie = strdup(c);
  (*env)->ReleaseStringUTFChars(env, s, c);
  return copie;
}

/* Copie un tableau Java de chaînes en tableau C terminé par NULL. */
static char **copier_tableau(JNIEnv *env, jobjectArray tab) {
  jsize n = tab ? (*env)->GetArrayLength(env, tab) : 0;
  char **res = calloc((size_t) n + 1, sizeof(char *));
  for (jsize i = 0; i < n; i++) {
    jstring s = (jstring) (*env)->GetObjectArrayElement(env, tab, i);
    res[i] = copier_chaine(env, s);
    (*env)->DeleteLocalRef(env, s);
  }
  return res;
}

static void liberer_tableau(char **tab) {
  if (!tab) return;
  for (char **p = tab; *p; p++) free(*p);
  free(tab);
}

static void lancer_erreur(JNIEnv *env, const char *message) {
  jclass cls = (*env)->FindClass(env, "java/io/IOException");
  char tampon[512];
  snprintf(tampon, sizeof tampon, "%s : %s", message, strerror(errno));
  (*env)->ThrowNew(env, cls, tampon);
}

JNIEXPORT jint JNICALL
Java_org_marceau_terminal_Pty_lancer(JNIEnv *env, jclass cls, jstring jcmd, jstring jcwd,
                                     jobjectArray jargs, jobjectArray jenv, jintArray jpid,
                                     jint lignes, jint colonnes) {
  int ptm = open("/dev/ptmx", O_RDWR | O_CLOEXEC);
  if (ptm < 0) {
    lancer_erreur(env, "Impossible d'ouvrir /dev/ptmx");
    return -1;
  }
  char nom_pts[64];
  if (grantpt(ptm) || unlockpt(ptm) || ptsname_r(ptm, nom_pts, sizeof nom_pts)) {
    lancer_erreur(env, "Impossible de préparer le terminal");
    close(ptm);
    return -1;
  }

  /* UTF-8, pas de contrôle de flux (Ctrl+S/Ctrl+Q). */
  struct termios tios;
  tcgetattr(ptm, &tios);
  tios.c_iflag |= IUTF8;
  tios.c_iflag &= ~(IXON | IXOFF);
  tcsetattr(ptm, TCSANOW, &tios);

  struct winsize taille = {.ws_row = (unsigned short) lignes, .ws_col = (unsigned short) colonnes};
  ioctl(ptm, TIOCSWINSZ, &taille);

  /* Toutes les copies JNI se font AVANT fork : l'enfant ne doit plus toucher à la JVM. */
  char *cmd = copier_chaine(env, jcmd);
  char *cwd = copier_chaine(env, jcwd);
  char **args = copier_tableau(env, jargs);
  char **vars = copier_tableau(env, jenv);

  pid_t pid = fork();
  if (pid < 0) {
    lancer_erreur(env, "fork a échoué");
    close(ptm);
    free(cmd); free(cwd); liberer_tableau(args); liberer_tableau(vars);
    return -1;
  }

  if (pid == 0) {
    /* --- Processus enfant --- */
    sigset_t tous;
    sigfillset(&tous);
    sigprocmask(SIG_UNBLOCK, &tous, NULL);
    for (int s = 1; s < 32; s++) signal(s, SIG_DFL);

    close(ptm);
    setsid();
    int pts = open(nom_pts, O_RDWR);
    if (pts < 0) _exit(1);
    ioctl(pts, TIOCSCTTY, 0);
    dup2(pts, 0);
    dup2(pts, 1);
    dup2(pts, 2);

    /* Ferme tous les autres descripteurs hérités de l'appli. */
    DIR *d = opendir("/proc/self/fd");
    if (d) {
      int fd_dir = dirfd(d);
      struct dirent *e;
      while ((e = readdir(d)) != NULL) {
        int fd = atoi(e->d_name);
        if (fd > 2 && fd != fd_dir) close(fd);
      }
      closedir(d);
    }

    clearenv();
    for (char **v = vars; v && *v; v++) putenv(*v);

    if (cwd && chdir(cwd) != 0) {
      dprintf(2, "Dossier inaccessible : %s (%s)\r\n", cwd, strerror(errno));
    }
    execvp(cmd, args);
    dprintf(2, "Impossible de lancer %s : %s\r\n", cmd, strerror(errno));
    _exit(127);
  }

  /* --- Processus parent (l'appli) --- */
  free(cmd); free(cwd); liberer_tableau(args); liberer_tableau(vars);
  jint p = (jint) pid;
  (*env)->SetIntArrayRegion(env, jpid, 0, 1, &p);
  return ptm;
}

JNIEXPORT void JNICALL
Java_org_marceau_terminal_Pty_redimensionner(JNIEnv *env, jclass cls, jint fd, jint lignes, jint colonnes) {
  struct winsize taille = {.ws_row = (unsigned short) lignes, .ws_col = (unsigned short) colonnes};
  ioctl(fd, TIOCSWINSZ, &taille);
}

/* Attend la fin du processus : code de sortie (>= 0) ou -signal. */
JNIEXPORT jint JNICALL
Java_org_marceau_terminal_Pty_attendre(JNIEnv *env, jclass cls, jint pid) {
  int statut;
  while (waitpid(pid, &statut, 0) < 0) {
    if (errno != EINTR) return -1;
  }
  if (WIFEXITED(statut)) return WEXITSTATUS(statut);
  if (WIFSIGNALED(statut)) return -WTERMSIG(statut);
  return 0;
}
