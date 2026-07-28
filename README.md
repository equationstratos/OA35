# TinyHoop MK1 — visualisation du build FPV

Viewer 3D pour modéliser le drone pièce par pièce, à partir des photos que tu
fournis. Tout est **hors-ligne** : Three.js est embarqué dans `vendor/`, il n'y
a aucune dépendance réseau ni build à lancer.

## Lancer

Ouvre `index.html` dans un navigateur. Si les modules ES sont bloqués en
`file://`, sers le dossier :

```bash
python3 -m http.server 8000
# puis http://localhost:8000
```

## Les trois onglets

| Onglet | À quoi il sert |
|--------|----------------|
| **Calibration photo** | charge la photo d'une pièce et en trace le contour au pixel près |
| **Vue 3D** | le build monté, avec la photo superposable en transparence |
| **Plan coté** | vue de dessus cotée, photo en dessous, grille 10 mm |

## Modéliser une pièce au pixel près

Le contour n'est pas dessiné à l'œil : il est **calculé sur les pixels de la
photo**.

1. onglet **Calibration photo**, dépose l'image (ou Ctrl+V, ou fichier)
2. la photo est binarisée (seuil d'Otsu automatique), puis le contour extérieur
   et chaque perçage sont suivis pixel par pixel
3. règle si besoin : seuil, simplification, lissage, aire mini d'un perçage
4. l'échelle se cale toute seule sur les **motifs de perçage normalisés**
   (voir ci-dessous) ; à défaut, saisis la longueur réelle de la pièce
5. **Appliquer au modèle** : la géométrie 3D est reconstruite depuis le tracé

Précision mesurée en aller-retour (la pièce est rendue en silhouette, puis
retracée, et le résultat comparé à la source) :

| | |
|---|---|
| écart moyen au contour source | **0,28 px** (94 µm) |
| écart maximum | 1,23 px (412 µm) |
| boîte englobante restituée | à 0,9 px près sur 313 px |

### L'échelle, sans rien mesurer

Mettre une pièce à l'échelle par sa longueur hors-tout suppose de connaître
cette longueur. À défaut on la devine — et **deux pièces calibrées séparément
ne s'emboîtent pas**, leurs perçages tombent à côté.

Les châssis FPV portent en revanche des motifs de fixation normalisés : le
carré de 20 × 20 mm des contrôleurs de vol, celui de 25,5 × 25,5, parfois
16 × 16 ou 30,5 × 30,5. L'outil cherche ces carrés dans les perçages tracés et
en déduit l'échelle exacte.

Un carré isolé reste ambigu — il peut correspondre à plusieurs standards. Mais
quand des carrés de **tailles différentes désignent la même échelle**, ils se
confirment mutuellement : ce n'est plus une supposition. L'échelle n'est
appliquée d'office que dans ce cas ; sinon les candidats sont proposés et c'est
toi qui tranches.

Sur la plaque 01, quatre lectures indépendantes convergent :

| carré mesuré | standard | longueur impliquée |
|---|---|---|
| 22,94 mm | 20 × 20 | 91,5 mm |
| 23,06 mm | 20 × 20 | 91,1 mm |
| 29,37 mm | 25,5 × 25,5 | 91,2 mm |

D'où **91,2 mm ± 0,3** — et non les 105 mm supposés au départ, soit 13 %
d'erreur. Après recalage, les carrés du modèle mesurent 19,95 / 20,08 / 25,52 /
25,52 mm : les deux standards à 0,08 mm près, ce qui vaut vérification.

Effet sur l'assemblage : sur deux pièces mises à l'échelle par ce moyen, une
paire de perçages correspondants se superpose à **0,01 mm**, contre 4,25 mm
quand l'une gardait une longueur devinée.

### Le lissage

Un contour tracé au pixel est en escalier, et les irrégularités de la photo y
ajoutent de petites entailles. Le lissage cherche **le filtre le plus fort qui
reste dans la tolérance demandée** : on gomme le bruit sans jamais s'écarter de
la forme réelle au-delà d'une limite connue et affichée.

Le réglage est en millimètres *sur la pièce*, donc il ne dépend pas de la
résolution de la photo. Les découpes reçoivent une tolérance bornée à 5 % de
leur propre taille : sans cela, la même valeur absolue transformerait un
octogone en cercle.

La pièce 01 est livrée lissée à 0,80 mm de tolérance : contour ramené de 3976 à
150 points, écart réel 188 µm en moyenne, 678 µm au pire.

> À la résolution de la photo d'origine (268 px pour 105 mm, soit 0,39 mm par
> pixel), c'est la limite de ce que l'image peut dire de la pièce. Pour un
> contour à la fois lisse **et** fidèle au dixième, il faut une photo plus
> définie — le reste de la chaîne suit sans changement.

### Vérifier la conformité

Coche **Photo en transparence** : la photo se superpose au modèle, à l'échelle
et parfaitement recalée (le calage vient du tracé lui-même, il n'y a rien à
ajuster à la main). Tout écart se voit immédiatement, en 3D comme sur le plan
coté.

### Réglages du traçage

| Réglage | Effet |
|---------|-------|
| Seuil noir/blanc | sépare la pièce du fond ; Otsu par défaut |
| Simplification | tolérance Douglas-Peucker, en px (0 = aucun point supprimé) |
| Lissage, écart max | en **mm sur la pièce** : le contour est lissé au maximum tout en restant dans cet écart du tracé brut |
| Perçage mini | ignore les taches plus petites que N px² |
| Arrondir perçages ≤ N px | les petits trous deviennent des cercles parfaits ; au-delà le tracé brut est gardé, pour ne pas déformer un octogone ou une lumière |
| Forcer la symétrie G/D | moyenne les deux moitiés, utile si la prise de vue est légèrement de travers |

Bonne photo = vue de dessus, à plat, fond clair uni, pièce sombre, sans
perspective ni ombre portée marquée. La résolution n'a pas besoin d'être
énorme, mais plus elle est haute, plus le contour est fin.

### Créer une pièce depuis l'outil

Une fois le tracé fait, renseigne en bas du panneau :

| Champ | Rôle |
|-------|------|
| Nom de la pièce | son libellé dans le panneau latéral |
| Longueur réelle | l'échelle de la pièce, calée d'office sur les motifs de perçage quand ils la confirment |
| Rôle dans le châssis | donne l'épaisseur d'après la fiche technique |
| Épaisseur | l'épaisseur extrudée |
| Hauteur dans le build | son altitude dans l'empilement, en mm (0 = plaque du bas) |

puis **Créer la pièce**. Elle est ajoutée au build, apparaît dans la liste avec
ses cotes et sa case d'affichage, et est **conservée dans le navigateur** :
elle est toujours là au rechargement. La croix ✕ sur sa fiche la supprime.

Aucun fichier à écrire : le tracé et les métadonnées vivent dans le stockage
local du navigateur. Pour rendre une pièce permanente dans le dépôt, passe par
**Exporter le contour** ci-dessous.

Les deux autres boutons :

- **Remplacer la pièce 01** — écrase la géométrie de la plaque livrée avec le
  projet par le tracé courant, sans créer de pièce supplémentaire
- **Oublier la photo** — efface la photo mémorisée ; les pièces déjà créées
  sont conservées

### Figer un tracé

**Exporter le contour** génère un module JS contenant les coordonnées tracées,
en pixels de l'image. Déposé dans `js/parts/`, il rend le modèle indépendant
de la photo.

## Le châssis

Fiche technique du fabricant, dans `js/frame-spec.js`. C'est la **seule source
de cotes absolues** du projet : tout le reste est mesuré sur les photos.

| | |
|---|---|
| Modèle | Sub250 OasisFly35 DC |
| Empattement | 175 mm |
| Plaque inférieure | 1,5 mm |
| Plaque intermédiaire | 2,5 mm |
| Plaque supérieure | 2,0 mm |
| Bras | 3,5 mm |

Choisir le **rôle** d'une pièce à sa création lui donne son épaisseur : elle
n'est pas à saisir deux fois. L'empattement servira de contrôle une fois les
bras modélisés — c'est la diagonale d'axe moteur à axe moteur.

## Ce qui est modélisé

| # | Pièce | Matière | Cotes |
|---|-------|---------|-------|
| 01 | Plaque intermédiaire | Carbone 3K sergé 2,5 mm | 91,2 × 54,4 mm, 29 perçages |

> La pièce 01 porte les deux motifs de fixation du contrôleur de vol, ce qui
> désigne la plaque intermédiaire (2,5 mm). Si c'en est une autre, corriger
> `THICKNESS_MM` dans `js/parts/contour-piece-01.js` d'après le tableau
> ci-dessus.

La géométrie de la pièce 01 vient du tracé de sa photo, figé dans
`js/parts/contour-piece-01.js`. Pour la mettre à jour : refaire un tracé,
**Exporter le contour**, et remplacer ce fichier — `01-bottom-plate.js` n'a pas
à changer.

> Le fichier exporté ne contient que des **données** (`OUTLINE_PX`, `HOLES_PX`,
> `BBOX`). Il ne remplace pas `01-bottom-plate.js`, qui est le module de la
> pièce et fournit `build()`, `blueprint()` et `meta` : c'est lui qui lit les
> données du contour.

## Ajouter une pièce

Deux voies, au choix :

- **depuis l'outil** — onglet Calibration, *Créer la pièce* (voir plus haut).
  Rien à coder, la pièce est stockée dans le navigateur.
- **dans le dépôt** — créer `js/parts/0N-<nom>.js` exportant `build()`, `meta`,
  et si la pièce est plate `buildFromTrace()` pour profiter de la calibration
  photo (`meta.stackHeight` = altitude de la pièce dans le build, en mm), puis
  l'importer dans `js/parts/index.js` et l'ajouter à `PARTS`.

Dans les deux cas elle apparaît dans le panneau latéral avec sa case
d'affichage et ses cotes, et se pose **à côté des pièces déjà créées** dans la
vue 3D.

## Disposition des pièces

Deux modes, via **Pièces côte à côte** dans le panneau Affichage :

- **côte à côte** (par défaut) — les pièces sont alignées et posées à plat,
  sans se recouvrir : c'est la vue de travail quand on modélise pièce par pièce
- **assemblage** — décochée, les perçages deviennent cliquables et les pièces
  se placent les unes sur les autres (voir ci-dessous). Le curseur **Vue
  éclatée** les écarte verticalement pour inspecter le montage.

Le cadrage suit : les boutons ISO / Dessus / Avant / Côté choisissent une
direction, la distance est calculée pour que tout le build tienne dans l'image,
quel que soit le nombre de pièces.

## Assembler par les perçages

En mode assemblage, chaque perçage porte un anneau cliquable.

1. **clique un trou de la pièce de référence**, puis **le trou correspondant
   sur la pièce à placer** : celle-ci vient s'y superposer, trou sur trou
2. **clique une 2e paire** : la pièce pivote autour de la première pour aligner
   la seconde

Deux paires suffisent à placer une pièce plane : la première fixe la position,
la seconde l'orientation. La pièce se pose **au contact** de sa référence
(ou à sa *Hauteur dans le build* si tu en as saisi une).

Détails qui comptent à l'usage :

- **l'ordre des clics** — le premier trou d'une paire désigne la référence, le
  second la pièce qui bouge ; pour la 2e paire, l'ordre n'a plus d'importance,
  la pièce déjà ancrée est reconnue
- **les plaques empilées se masquent** : quand deux perçages se superposent à
  l'écran, c'est celui de *l'autre* pièce qui est retenu, pas celui du dessus —
  sans quoi la seconde paire serait souvent impossible à viser
- **l'écart résiduel est affiché** après la 2e paire. S'il dépasse le dixième,
  c'est que les deux entraxes ne sont pas identiques : l'outil aligne la
  direction, il n'invente pas une correspondance qui n'existe pas
- l'assemblage est **conservé dans le navigateur** ; *Réinitialiser
  l'assemblage* remet les pièces sur l'établi

Une pièce pas encore assemblée reste à sa place sur l'établi plutôt que d'aller
à l'origine : sinon les pièces se recouvriraient et deviendraient impossibles
à viser.

## Exporter une pièce

Deux boutons sur la fiche de chaque pièce :

- **STL** — la géométrie 3D, en millimètres, pièce à plat dans son propre
  repère : l'orientation attendue par un logiciel de CAO ou un trancheur, pas
  celle de l'assemblage. Le STL n'ayant pas d'unité, le millimètre est la
  convention universelle et c'est déjà celle du modèle.
- **Module JS** — un fichier autonome à déposer dans `js/parts/`, contenant le
  tracé en millimètres et exposant la même interface que les pièces livrées
  avec le projet. Il ne reste qu'à l'importer dans `js/parts/index.js` et à
  l'ajouter au tableau `PARTS`. C'est le moyen de faire passer une pièce du
  stockage du navigateur au dépôt.

## Recalibrer une pièce existante

Une pièce créée avant l'arrivée du calage sur les perçages garde son échelle
estimée : ses trous ne tombent pas en face de ceux des autres pièces.

- **Recalibrer** sur la fiche d'une pièce, ou **Recalibrer les pièces** dans le
  panneau Assemblage pour toutes à la fois
- l'échelle est relue sur les **motifs normalisés de la pièce elle-même**, donc
  sans sa photo ni aucune mesure
- le placement d'assemblage de la pièce est effacé au passage : il avait été
  calculé à l'ancienne échelle et n'a plus de sens

Trois réponses possibles, distinguées parce qu'elles appellent des suites
différentes : *recalée* (avec l'ancienne et la nouvelle longueur), *déjà à
l'échelle*, ou *motifs non concluants* — dans ce dernier cas les carrés
détectés ne se confirment pas entre eux et rien n'est modifié ; il faut alors
retracer la pièce depuis sa photo.

Le sélecteur de **rôle** sur chaque fiche remet l'épaisseur d'après la fiche
technique du châssis.

## Récupérer une pièce supprimée

- pièce créée depuis l'outil : elle vit dans le stockage local du navigateur,
  la supprimer est définitif — refais le tracé, c'est l'affaire de quelques
  secondes
- pièce du dépôt : `git checkout js/parts/01-bottom-plate.js` la restaure

## Arborescence

```
index.html                 interface
css/style.css
js/main.js                 scène, éclairage, UI, calque photo
js/calibrate.js            chargement photo, pilotage du tracé, export
js/blueprint.js            plan coté 2D + photo en dessous
js/assembly.js             contraintes de perçages, placement, sélection
js/frame-spec.js           fiche technique du châssis : empattement, épaisseurs
js/lib/trace.js            binarisation, suivi de contour, simplification
js/lib/patterns.js         motifs de perçage normalisés, calage de l'échelle
js/lib/geom.js             pixels -> mm, congés, symétrie, extrusion
js/lib/materials.js        carbone sergé 2x2 généré au runtime
js/parts/01-bottom-plate.js
vendor/three/              Three.js r160 (embarqué)
```
