# Export CAO du build TinyHoop MK1

Deux fichiers, **un seul et même repère** : ils se superposent sans rien régler.
Repère CAO, Z « haut », millimètres. Origine au centre de la bottom-plate, le
nez du drone vers +Y, le dessus vers +Z. Le point bas du build (dessous des
patins) est à Z −7,95 ; le point haut (support GPS) à Z 44,73.

## TinyHoop-MK1-chassis.step

Les 8 pièces carbone — 4 plaques et 4 bras — en **vraies formes B-rep** :
contour extrudé, perçages circulaires en vrais cercles. Rien n'est facetté,
Fusion retrouve des faces planes sur lesquelles esquisser et des trous
cylindriques mesurables. Chaque corps porte son nom.

Écart de position contrôlé par relecture du fichier : **0,08 mm au plus**, qui
est exactement le biseau d'affichage ajouté par le visualisateur pour adoucir
les arêtes. Le STEP, lui, a des arêtes vives — c'est ce qu'on veut en CAO.

## TinyHoop-MK1-pieces-imprimees.3mf

Les 10 pièces imprimées (covers, supports GPS / VTX / caméra ×2, patins ×4),
maillages d'origine à pleine résolution, chacune nommée, déjà placées.

Pourquoi pas dans le STEP : ces pièces n'existent que sous forme de maillages.
Un triangle coûte environ 2,4 ko en STEP, soit plus de 700 Mo pour les 305 468
triangles du build — inexploitable. Les décimer pour tenir dans un STEP leur
ferait perdre jusqu'à 2 mm. Le 3MF les garde exactes en 5,7 Mo.

Dans Fusion : *Insérer un maillage*, sans rien déplacer — les coordonnées sont
déjà les bonnes.

## À savoir

`35_footpad_final.STL` n'est pas étanche à la source : 122 arêtes libres et 3
coques distinctes. Le maillage exporté reprend le fichier tel quel. La plupart
des trancheurs réparent ça tout seuls, mais une conversion en solide dans
Fusion demandera sans doute une réparation préalable.
