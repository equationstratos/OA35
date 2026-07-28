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

Précision mesurée sur une image de contrôle (silhouette de 156 × 318 px) :

| | |
|---|---|
| écart moyen au contour source | **0,22 px** (73 µm) |
| écart maximum | 1,38 px (454 µm) |
| boîte englobante restituée | à 0,2 px près sur 318 px |

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
| Lissage | passes de Chaikin, gomme l'escalier des pixels |
| Perçage mini | ignore les taches plus petites que N px² |
| Arrondir perçages ≤ N px | les petits trous deviennent des cercles parfaits ; au-delà le tracé brut est gardé, pour ne pas déformer un octogone ou une lumière |
| Forcer la symétrie G/D | moyenne les deux moitiés, utile si la prise de vue est légèrement de travers |

Bonne photo = vue de dessus, à plat, fond clair uni, pièce sombre, sans
perspective ni ombre portée marquée. La résolution n'a pas besoin d'être
énorme, mais plus elle est haute, plus le contour est fin.

### Figer un tracé

**Exporter le contour** génère un module JS contenant les coordonnées tracées,
en pixels de l'image. Déposé dans `js/parts/`, il rend le modèle indépendant
de la photo.

## Ce qui est modélisé

| # | Pièce | Matière | Cotes |
|---|-------|---------|-------|
| 01 | Plaque inférieure châssis | Carbone 3K sergé 2,0 mm | calées sur la longueur réelle saisie |

Tant qu'aucune photo n'a été appliquée, la pièce 01 utilise un contour de
secours saisi à la main (marqué **à calibrer** dans le panneau) : il donne la
bonne allure générale mais **n'est pas conforme au pixel** — c'est le tracé
photo qui fait foi.

## Ajouter la pièce suivante

1. créer `js/parts/0N-<nom>.js` exportant `build()`, `meta`, et si la pièce est
   plate `buildFromTrace()` pour profiter de la calibration photo
   (`meta.stackHeight` = altitude de la pièce dans le build, en mm)
2. l'importer dans `js/parts/index.js` et l'ajouter à `PARTS`

Elle apparaît automatiquement dans le panneau latéral, avec sa case
d'affichage, ses cotes et sa place dans la vue éclatée.

## Arborescence

```
index.html                 interface
css/style.css
js/main.js                 scène, éclairage, UI, calque photo
js/calibrate.js            chargement photo, pilotage du tracé, export
js/blueprint.js            plan coté 2D + photo en dessous
js/lib/trace.js            binarisation, suivi de contour, simplification
js/lib/geom.js             pixels -> mm, congés, symétrie, extrusion
js/lib/materials.js        carbone sergé 2x2 généré au runtime
js/parts/01-bottom-plate.js
vendor/three/              Three.js r160 (embarqué)
```
