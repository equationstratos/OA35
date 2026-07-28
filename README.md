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
4. saisis la **longueur réelle** de la pièce — c'est la seule mesure physique
   nécessaire, tout le reste en découle
5. **Appliquer au modèle** : la géométrie 3D est reconstruite depuis le tracé

Précision mesurée en aller-retour (la pièce est rendue en silhouette, puis
retracée, et le résultat comparé à la source) :

| | |
|---|---|
| écart moyen au contour source | **0,28 px** (94 µm) |
| écart maximum | 1,23 px (412 µm) |
| boîte englobante restituée | à 0,9 px près sur 313 px |

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
| Longueur réelle | l'échelle de la pièce |
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

## Ce qui est modélisé

| # | Pièce | Matière | Cotes |
|---|-------|---------|-------|
| 01 | Plaque inférieure châssis | Carbone 3K sergé 2,0 mm | 105,0 × 62,7 mm, 29 perçages |

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
js/lib/trace.js            binarisation, suivi de contour, simplification
js/lib/geom.js             pixels -> mm, congés, symétrie, extrusion
js/lib/materials.js        carbone sergé 2x2 généré au runtime
js/parts/01-bottom-plate.js
vendor/three/              Three.js r160 (embarqué)
```
