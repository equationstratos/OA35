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

## TinyHoop-MK1-build-complet.step — 28 Mo, 18 composants nommés

Un assemblage, 18 composants :

- les 8 pièces carbone en **formes exactes** (contour extrudé, perçages en
  vrais cercles) — identiques au fichier châssis ;
- les 10 pièces imprimées en solides facettés **simplifiés**.

Écart mesuré des pièces simplifiées, distance point-surface dans les deux
sens : **0,006 à 0,030 mm en moyenne, 0,11 à 0,29 mm au pire** — soit moins
qu'une couche d'impression. Positions vérifiées par relecture du fichier :
0,082 mm au plus, qui est le biseau d'affichage du visualisateur (le STEP a
des arêtes vives).

Pourquoi simplifier : en STEP, une facette coûte environ 3 ko. Les 305 468
triangles d'origine pèseraient plus de 700 Mo. Le regroupement de sommets sur
grille fait tomber le support caméra de 92 352 à 916 triangles sans dépasser
0,21 mm d'écart — ces fichiers CAO sont pavés de triangles bien plus fins que
nécessaire. Les quatre patins ne sont écrits qu'une fois et instanciés quatre
fois.

## TinyHoop-MK1-chassis.step — 8,6 Mo

Les 8 pièces carbone seules, formes exactes, corps nommés. Faces planes sur
lesquelles esquisser, trous cylindriques mesurables. Rien n'y est approché.

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
