# Export CAO du build TinyHoop MK1

Tous les fichiers partagent **le même repère** : CAO, Z « haut », millimètres,
origine au centre de la bottom-plate, nez du drone vers +Y. Le point bas du
build (dessous des patins) est à Z −7,95, le point haut (support GPS) à
Z 44,73. Ils se superposent donc sans rien régler.

## Lequel prendre

**Sur mobile (Fusion Android / iOS) : `TinyHoop-MK1-build-complet.step`.**
L'appli mobile ne sait pas insérer un maillage — *Insérer un maillage* est une
commande de bureau. Un STL, un OBJ ou un 3MF téléversés depuis le téléphone
n'apparaissent donc ni dans la conception, ni dans l'arbre des composants. Ce
fichier-là contient tout, en STEP, et c'est le seul format que l'appli ouvre.

**Sur ordinateur** : `TinyHoop-MK1-chassis.step` pour le carbone en formes
exactes, plus les pièces imprimées en maillage à pleine résolution (`.3mf` ou
le ZIP de STL), insérées par *Insérer un maillage*.

## Deux corrections sur la géométrie

**Perçages moteur des bras arrière.** Le fichier `arm-long1.stl` fourni ne
dessine pas les quatre trous de vis moteur : à leur place une ouverture en
croix de 10 × 10 mm qui les relie tous. Le bras avant, lui, porte le motif
complet — quatre M2 sur un carré de 7,48 mm plus un passage d'arbre Ø4,25. Ce
motif a été rétabli sur les bras arrière, centré sur la croix, aux mêmes
positions de vis. C'est une modification volontaire du fichier d'origine : les
quatre bras portent maintenant le même montage moteur.

**Chanfrein.** Les contours étaient relevés sur la face supérieure des STL, qui
porte un chanfrein de 0,08 mm : le contour y était 0,16 mm trop petit et chaque
perçage 0,2 mm trop grand, soit 2,3 % de matière en moins sur chaque plaque.
Ils sont maintenant relevés à mi-épaisseur. Le biseau d'affichage du
visualisateur, qui compensait par hasard cette erreur en poussant la matière
vers l'extérieur, a été retiré : l'aire de chaque plaque est exacte au
dixième de mm².

## Contacts verticaux

Le plan `tinyhoop-mk1-plan-corrige.json` pose l'empilement prêt à visser :

| interface | jeu |
| --- | --- |
| joues de caméra sur la plaque inférieure | 0,000 mm |
| plaque supérieure sur les deux joues de caméra | 0,000 mm |
| support GPS sur la plaque supérieure | 0,000 mm |

Reste un conflit qui vient des pièces elles-mêmes : le support d'antenne VTX
fait 24,50 mm et son pied repose sur la plaque intermédiaire (dessus à 6,75),
donc il monte à 31,25 — alors que les joues de caméra plafonnent à 30,44. Il
dépasse de **0,81 mm** sous la plaque supérieure. Le poser sous la plaque
enterrerait tout son pied dans la plaque intermédiaire (mesuré : 837 sommets
dans la matière), on l'a donc laissé sur son pied. À arbitrer : raccourcir le
support de 0,81 mm, ou surélever les joues d'autant.

## Couleurs

| corps | teinte |
| --- | --- |
| les 8 pièces carbone | `#1E2126`, gris graphite très sombre |
| covers, support GPS, support VTX, les 4 patins | `#0A33A0`, bleu roi (TPU) |
| les 2 supports de cage caméra | **aucune** — à choisir plus tard |

Un STEP ne transporte **pas de texture**, seulement des couleurs unies
(`COLOUR_RGB`). Le tissage carbone 3K sergé 2×2 du visualisateur ne peut donc
pas suivre dans le fichier : le carbone y est une teinte plate. Dans Fusion,
appliquer l'apparence « Fibre de carbone » de la bibliothèque par-dessus prend
deux clics.

Les pièces sont écrites en corps libres et non en assemblage instancié : sur
cette version d'OpenCASCADE, dès qu'on passe par des composants instanciés, le
rédacteur STEP perd une des deux couleurs (vérifié sur un cas réduit). Le
fichier pèse plus lourd — les quatre patins y sont écrits quatre fois — mais
il arrive teinté.

## TinyHoop-MK1-build-complet.step — 44 Mo, 18 corps nommés

*(et sa version allégée `TinyHoop-MK1-build-leger.step`, 23 Mo : même contenu,
mêmes couleurs, mêmes positions, maillages plus grossiers — écart jusqu'à
0,55 mm au lieu de 0,29. Elle existe parce que 44 Mo ne passent pas par la
messagerie.)*


- les 8 pièces carbone en **formes exactes** (contour extrudé, perçages en
  vrais cercles) — identiques au fichier châssis ;
- les 10 pièces imprimées en solides facettés **simplifiés**.

Écart mesuré des pièces simplifiées, distance point-surface dans les deux
sens : **0,006 à 0,030 mm en moyenne, 0,11 à 0,29 mm au pire** — soit moins
qu'une couche d'impression. Version allégée : 0,017 à 0,076 mm en moyenne,
0,55 mm au pire. Positions vérifiées par relecture du fichier :
0,082 mm au plus, qui est le biseau d'affichage du visualisateur (le STEP a
des arêtes vives).

Pourquoi simplifier : en STEP, une facette coûte environ 3 ko. Les 305 468
triangles d'origine pèseraient plus de 700 Mo. Le regroupement de sommets sur
grille fait tomber le support caméra de 92 352 à 916 triangles sans dépasser
0,21 mm d'écart — ces fichiers CAO sont pavés de triangles bien plus fins que
nécessaire.

## TinyHoop-MK1-chassis.step — 8,6 Mo

Les 8 pièces carbone seules, formes exactes, corps nommés, teintées carbone.
Faces planes sur lesquelles esquisser, trous cylindriques mesurables. Rien n'y
est approché.

## Les 10 pièces imprimées, maillages à pleine résolution

Même contenu dans deux formats, positions vérifiées à 0,000 mm :

- `TinyHoop-MK1-pieces-imprimees-STL.zip` — dix STL binaires, un par pièce,
  déjà placés. *Insérer un maillage*, tout sélectionner d'un coup, ne toucher
  à aucun réglage de la boîte de dialogue.
- `TinyHoop-MK1-pieces-imprimees.3mf` — un seul fichier, corps nommés.

## À savoir

Les noms de corps sont sans accent : un fichier STEP est de l'ISO-8859-1, les
caractères accentués n'y survivent pas d'un logiciel à l'autre.

`35_footpad_final.STL` n'est pas étanche à la source : 122 arêtes libres, 3
coques distinctes. Le patin arrive donc en plusieurs corps dont certains
surfaciques, dans le STEP comme dans les maillages. Les trancheurs réparent ça
tout seuls ; une conversion en solide dans Fusion demandera une réparation.
