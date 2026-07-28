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

## Ce qui est déjà modélisé

| # | Pièce | Matière | Cotes |
|---|-------|---------|-------|
| 01 | Plaque inférieure châssis | Carbone 3K sergé 2,0 mm | 102,6 × 50,2 mm, 18 perçages |

L'onglet **Plan coté** affiche la vue de dessus avec grille 10 mm et cotes —
c'est là qu'on vérifie la fidélité au pixel près par rapport à la photo.

## Comment les cotes sont calées

Le contour et les perçages sont saisis **en pixels de la photo source**
(268 × 371 px, origine en haut à gauche, Y vers le bas) dans
`js/parts/01-bottom-plate.js`. Une seule constante fixe l'échelle :

```js
export const REF_LENGTH_MM = 105.0;  // longueur hors-tout réelle de la plaque
```

Le rapport de forme reste donc exact quelle que soit l'échelle : si la plaque
fait 98 mm et non 105, change cette valeur et **toutes** les cotes suivent.

Contrôle de cohérence à l'échelle actuelle (1 px = 0,3221 mm) :

- gros trous Ø22 px → **Ø7,1 mm** (silent-blocs)
- petits trous Ø7 px → **Ø2,25 mm** (vis M2)
- octogone 48 px entre plats → **15,5 mm**

## Corriger une cote

Tout est dans un seul fichier par pièce, en pixels, avec un commentaire par
point :

```js
const HALF_OUTLINE_PX = [
  { px: 134, py: 72,  r: 9,  note: "fond de l'échancrure avant (sur l'axe)" },
  { px: 152, py: 40,  r: 20, note: "flanc interne de l'oreille avant droite" },
  ...
];
```

- `px` / `py` : coordonnées en pixels de la photo
- `r` : rayon de congé en pixels (`0` = angle vif)
- seul le **demi-profil droit** est saisi ; `mirrorHalf()` génère la symétrie,
  donc la pièce est parfaitement symétrique par construction

Idem pour `BIG_HOLES_PX`, `M2_HOLES_PX`, `SQUARE_CUT_PX`, `SLOT_CUT_PX` et
`OCTAGON_CUT_PX`.

## Ajouter la pièce suivante

1. créer `js/parts/0N-<nom>.js` exportant `build()`, `blueprint()` et `meta`
   (`meta.stackHeight` = altitude de la pièce dans le build, en mm)
2. l'importer dans `js/parts/index.js` et l'ajouter à `PARTS`

Elle apparaît automatiquement dans le panneau latéral, avec sa case
d'affichage, ses cotes et sa place dans la vue éclatée.

## Arborescence

```
index.html               interface
css/style.css
js/main.js               scène, éclairage, UI
js/blueprint.js          plan coté 2D
js/lib/geom.js           pixels -> mm, congés, symétrie, extrusion
js/lib/materials.js      carbone sergé 2x2 généré au runtime
js/parts/01-bottom-plate.js
vendor/three/            Three.js r160 (embarqué)
```
