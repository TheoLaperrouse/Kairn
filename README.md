# Kairn — entraînement trail & ultra-trail

Kairn génère et suit un plan de préparation **spécifique au trail** : périodisation, D+ hebdomadaire, sorties longues et back-to-back, renforcement guidé, import des activités de la montre et nutrition de course.

## Démarrer

```bash
npm install
npm run dev          # API sur :3000, front sur :5173 (proxy /api)
```

Ouvre <http://localhost:5173>, crée un compte et laisse-toi guider : objectif (presets UTMB, CCC, Diagonale des Fous, Templiers, SaintéLyon… ou course perso), profil, compléments vélo et renfo.

**Depuis ton téléphone** : sur le même réseau Wi-Fi, ouvre `http://<ip-de-l-ordinateur>:5173` (ou `:3000` en production) et connecte-toi avec le même compte. Les sessions sont rattachées au compte : tout est synchronisé, et la page *Réglages → Appareils connectés* liste les appareils et permet d'en révoquer un.

**Installer l'application** : une fois Kairn déployé en HTTPS (VPS ou Pi ci-dessous), ouvre son adresse sur le téléphone puis *Réglages → Kairn sur ton téléphone* : bouton *Installer* sur Android, *Partager → Sur l'écran d'accueil* sur iPhone. L'app s'ouvre en plein écran, garde la dernière version de ton plan et la séance guidée consultables sans réseau, et peut envoyer des rappels. Sur l'IP locale en `http://`, le navigateur n'autorise ni l'installation ni le mode hors ligne.

### Déployer sur un VPS (une commande)

Il te faut un VPS Debian ou Ubuntu (OVH, Scaleway, Hetzner… quelques euros par mois) accessible en SSH avec ta clé.

```bash
./deploy/deploy.sh debian@51.38.12.34
# ou avec ta clé perso et ton propre domaine :
SSH_KEY=~/.ssh/id_ed25519_perso ./deploy/deploy.sh debian@51.38.12.34 kairn.mondomaine.fr
```

Le script fait tout, et peut être relancé à chaque mise à jour sans perte de données :

1. **Première fois** : installe Docker, ouvre uniquement SSH/HTTP/HTTPS (ufw) et active les mises à jour de sécurité automatiques.
2. Envoie le code, crée `deploy/.env` sur le serveur (domaine, URL publique) s'il n'existe pas.
3. Construit et démarre Kairn derrière **Caddy**, qui obtient le certificat **HTTPS Let's Encrypt** automatiquement.
4. Sans domaine, utilise `51-38-12-34.sslip.io`, un nom gratuit qui pointe vers l'IP du VPS (HTTPS valide).
5. Vérifie que l'app répond et affiche son adresse.

La base SQLite vit dans un volume Docker, et une **sauvegarde quotidienne** est écrite dans `~/kairn/deploy/backups` (14 jours conservés). Pour Strava ou d'autres réglages, édite `~/kairn/deploy/.env` sur le serveur puis relance le script.

### Déployer sur une Raspberry Pi à la maison (Cloudflare Tunnel)

La Pi reste derrière ta box, sans aucun port ouvert : un **Cloudflare Tunnel** sortant publie `https://kairn.mondomaine.fr` (HTTPS géré par Cloudflare). Il faut **Ubuntu Server 64 bits** sur la Pi et un domaine géré par Cloudflare.

1. Copie ta clé SSH sur la Pi : `ssh-copy-id ubuntu@192.168.1.11`.
2. Dans Cloudflare : *Zero Trust → Networks → Tunnels → Create a tunnel* (type Cloudflared), copie le jeton, puis ajoute un *Public hostname* `kairn.mondomaine.fr` → service `HTTP`, URL `kairn:3000`.
3. Premier déploiement :

```bash
TUNNEL_TOKEN=eyJ... ./deploy/pi/deploy.sh ubuntu@192.168.1.11 kairn.mondomaine.fr
```

Les fois suivantes, la même commande sans `TUNNEL_TOKEN`. L'image est construite **sur ton PC** pour ARM64 (émulation QEMU activée au besoin), puis envoyée à la Pi par SSH : une Pi 3 n'a pas assez de mémoire pour compiler le front. La configuration vit dans `~/kairn/.env` sur la Pi, les sauvegardes quotidiennes dans `~/kairn/backups`.

### Docker sur ta machine

```bash
docker compose up -d --build   # http://localhost:3000
```

```bash
npm test             # tests du domaine, de l'API HTTP et du front
npm run typecheck
```

## Ce que fait l'application

| Domaine | Détail |
|---|---|
| **Objectif** | Catégorie calculée sur le km-effort (1 km + 100 m D+), à la manière de l'ITRA (XS → XXL). Estimation du temps de course selon le niveau et la technicité du terrain. |
| **Plan** | Phases Foncier → Développement → Spécifique → Affûtage → Course, cycles 3:1 avec semaines allégées, progression du volume jusqu'au pic plafonné par tes heures disponibles. Séances trail : côtes, seuil en montée, rando-course avec bâtons, technique de descente, sorties longues avec blocs allure course, back-to-back pour les ultras, simulation de nuit si la course en comporte. Le D+ est adapté au terrain dont tu disposes (montagne / collines / plat avec escaliers et tapis incliné). | Les distances et D+ des séances suivent ta vitesse réelle (médiane de tes sorties des 6 dernières semaines), et chaque séance explique son rôle dans la préparation.
| **Compléments** | Vélo (endurance, force en côte) et renforcement, au choix, 1 ou 2 fois par semaine. |
| **Renforcement** | 25 exercices et 6 routines adaptées aux phases (fondations, excentrique pour les descentes, pliométrie, chevilles…). **Séance guidée** plein écran pour faire les exercices en même temps que l'écran : démo en boucle, compteur de répétitions au tempo, minuteurs, repos, annonces vocales, écran maintenu allumé. |
| **Démos** | Chaque exercice est démontré par un athlète animé aux proportions réelles, en tenue de trail, avec les muscles sollicités qui s'allument à l'effort. |
| **Films Claude Motion** | 6 films « planche anatomique » (un par catégorie) dont chaque exercice occupe un passage de 4 s qui boucle sans à-coup. Voir `apps/web/public/motion/README.md` pour exporter les MP4 ; sans eux, l'app affiche la même animation calculée en direct. |
| **Activités** | Import FIT / GPX / TCX par glisser-déposer, dédoublonnage par empreinte, rattachement automatique à la séance prévue du jour (qui passe en « faite »). Profil altimétrique, D+ lissé. |
| **Analyse des sorties** | Trace détaillée (altitude, FC) lue dans les fichiers et récupérée chez Strava, y compris pour l’historique. Zones cardiaques (FC de réserve ou % FC max), montées et descentes détectées avec leur VAM, dérive cardiaque, comparaison à la séance prévue (durée, temps en zone d’effort, D+, charge) avec un verdict, une note sur 100 et un conseil pour la séance suivante (allègement en un clic si la séance clé arrive trop tôt). |
| **Progression en montée** | Meilleure VAM tenue 5, 10, 20 et 30 min, semaine après semaine, avec record et tendance ; records annoncés dans l’analyse de la sortie. |
| **Bilan hebdomadaire** | Page `/bilan` : volume face aux cibles du plan, séances clés, répartition de l’intensité, forme et fraîcheur, meilleures performances, points d’attention (trop d’intensité, plan trop ambitieux deux semaines de suite, fatigue…) et aperçu de la semaine suivante. |
| **Notifications** | Web Push sans service tiers ni dépendance : séance du jour le matin (seulement les jours de séance), analyse d’une sortie dès sa synchronisation, bilan le dimanche soir, à l’heure et dans le fuseau de chacun. Sur iPhone, Kairn doit être ajouté à l’écran d’accueil (iOS 16.4+). |
| **Agenda** | Lien d’abonnement iCalendar privé et révocable : chaque séance dans Google Agenda, Apple Calendrier ou Outlook, mise à jour automatiquement. |
| **Charge** | Modèle forme / fatigue / fraîcheur (CTL 42 j, ATL 7 j, TSB), TRIMP si la FC est connue, **projection jusqu'au jour de course** à partir des séances prévues. |
| **Plan de course** | Import du GPX officiel : profil découpé en montées / descentes / portions roulantes, ravitos placés depuis les waypoints, temps de passage et heure d'arrivée à chaque point (modèle d'allure selon ton niveau, la technicité et la fatigue), marges sur les barrières horaires, sections de nuit, et ce qu'il faut emporter entre chaque ravito. Fiche imprimable. |
| **Plan adaptatif** | Séance clé manquée → déplacée sur un créneau sûr des jours suivants (jamais deux séances dures d'affilée, jamais pendant l'affûtage) ou abandonnée. Maladie / blessure / indisponibilité → séances annulées ou remplacées par du sans-impact, puis reprise progressive (50 → 90 % du volume, sans intensité). Chaque modification est expliquée dans un journal. |
| **Bilan du matin** | Sommeil, courbatures, fatigue, motivation, stress, FC de repos et VFC comparées à ta moyenne sur 14 jours → score de forme, feu vert / orange / rouge, alertes (début d'infection, surcharge sur 3 jours) et allègement de la séance du jour en un clic. |
| **Séances sur la montre** | Chaque séance de course ou de vélo s'exporte en fichier FIT « workout » (échauffement, répétitions, récupérations, zones cardiaques de la montre). À copier dans `GARMIN/NewFiles`, ou envoi direct de la séance / de la semaine si `GARMIN_NEWFILES_DIR` est configuré. |
| **Nutrition** | Catégorie dédiée : recettes maison (veille, avant, pendant, boissons, récup) avec macros et sodium, et calculateur de stratégie de course heure par heure (glucides 60-90 g/h, sodium 500-700 mg/L, caféine, alternance sucré/salé). |

## Garmin : ce qui est possible

L'API **Garmin Connect Developer Program** n'accepte plus de nouvelles demandes d'accès (programme suspendu en 2026, sans date de réouverture), y compris pour un usage personnel. Kairn propose donc trois voies, derrière le même port `ActivityProvider` / `ActivityFileParser` :

1. **Garmin → Strava → Kairn** (automatique) : Garmin Connect synchronise vers Strava, dont l'API reste ouverte aux applications personnelles. Renseigne `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET`, puis *Activités → Connecter Strava*. Ensuite, plus rien à faire : en HTTPS, Kairn s'abonne au **webhook Strava** au démarrage et importe chaque nouvelle sortie dès sa publication ; une **synchronisation périodique** (`STRAVA_SYNC_INTERVAL_MIN`, 30 min par défaut) rattrape ce qui aurait été manqué pendant une coupure.
2. **Dossier surveillé** (automatique, sans compte tiers) : `GARMIN_WATCH_DIR` pointe vers `GARMIN/Activity` de la montre branchée en USB, ou vers un dossier synchronisé ; `GARMIN_WATCH_EMAIL` désigne le compte Kairn qui reçoit les activités.
3. **Glisser-déposer** des `.FIT` exportés depuis Garmin Connect.

Si Garmin rouvre son programme, il suffira d'ajouter un adaptateur `GarminConnectProvider` à côté de `StravaActivityProvider`.

## Architecture

Monorepo npm (workspaces) en TypeScript strict.

```
apps/api            Node 24 · Fastify 5 · SQLite (node:sqlite) — architecture hexagonale
  src/domain          Règles métier pures, sans dépendance : objectif, périodisation, séances,
                      charge d'entraînement, ravitaillement, comptes
  src/application     Ports (interfaces) et cas d'usage (services applicatifs)
  src/infrastructure  Adaptateurs : SQLite, HTTP, parseurs FIT/GPX/TCX, Strava, dossier Garmin,
                      scrypt, catalogue d'exercices et de recettes
  src/main.ts         Racine de composition : seul endroit qui câble adaptateurs et cas d'usage
  test/               Vitest : domaine, et API HTTP de bout en bout sur une base en mémoire

apps/web            Vue 3 · Vite · Pinia · Vue Router
  src/domain          Modèles, cinématique des démos, formatage
  src/application     Port TrainingApi + stores Pinia (cas d'usage côté client)
  src/infrastructure  Adaptateur HTTP
  src/ui              Vues, composants, thème « Aube alpine » clair/sombre
```

Sécurité des comptes : mots de passe hachés avec scrypt, jetons de session aléatoires stockés **uniquement sous forme d'empreinte SHA-256**, cookie `HttpOnly` + `SameSite=Lax`, limitation des tentatives de connexion, réponses identiques pour un compte inconnu ou un mauvais mot de passe, toutes les données filtrées par utilisateur.

> Les informations de ce plan sont indicatives et ne remplacent pas l'avis d'un médecin ou d'un entraîneur.
