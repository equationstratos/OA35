# Export CAO du build TinyHoop MK1

Tous les fichiers partagent **le même repère** : CAO, Z « haut », millimètres,
origine au centre de la bottom-plate, nez du drone vers +Y. Le point bas du
build (dessous des patins) est à Z −7,95, le point haut (support d'antenne
VTX) à Z 55,19. Ils se superposent donc sans rien régler.

## Lequel prendre

**Sur mobile (Fusion Android / iOS) : `TinyHoop-MK1-build-complet.step`.**
L'appli mobile ne sait pas insérer un maillage — *Insérer un maillage* est une
commande de bureau. Un STL, un OBJ ou un 3MF téléversés depuis le téléphone
n'apparaissent donc ni dans la conception, ni dans l'arbre des composants. Ce
fichier-là contient tout, en STEP, et c'est le seul format que l'appli ouvre.

**Sur ordinateur** : `TinyHoop-MK1-chassis.step` pour le carbone en formes
exactes, plus les pièces imprimées en maillage à pleine résolution (`.3mf` ou
le ZIP de STL), insérées par *Insérer un maillage*.

## Trois corrections sur la géométrie

**Perçages moteur, les quatre bras.** Deux défauts différents dans les fichiers
fournis, une seule correction.

`arm-long1.stl` ne dessine pas les quatre trous de vis moteur : à leur place
une ouverture en croix de 10 × 10 mm qui les relie tous. `arm-short1.stl`, lui,
les dessine — mais en **oblongs** : deux lobes Ø1,85 espacés de 1,5 mm, à 45°,
pointant vers l'extérieur depuis le passage d'arbre. Ce sont ces oblongs qui
apparaissaient comme des « trous en ellipse ». Le trou y accepte donc un rayon
de montage compris entre 4,58 et 6,07 mm — c'est une lumière de réglage, pas
une erreur, mais on ne peut pas la modéliser comme un point de vissage.

Les quatre bras portent maintenant **quatre perçages ronds Ø1,85 à 6,00 mm du
passage d'arbre**, sur les diagonales à 45° — soit un carré de 8,49 mm de côté,
12,0 mm en diagonale. Cette cote-là n'est pas choisie au hasard : **les quatre
perçages Ø2,0 du patin sont exactement à 6,00 mm de son centre**. Vis moteur,
bras et patin tombent donc sur le même motif, ce qui n'était pas le cas avant
(le carré relevé au centre des oblongs faisait 7,48 mm de côté, soit 0,71 mm
d'écart radial avec le patin sur chaque vis).

Les quatre patins ont été recalés dessus par ajustement rigide : l'écart
résiduel mesuré sur le build assemblé est de **0,05 à 0,20 mm** contre 0,54 à
0,89 mm avant, et ce qui reste vient du recalage automatique de l'assemblage,
pas de la géométrie.

**Chanfrein.** Les contours étaient relevés sur la face supérieure des STL, qui
porte un chanfrein de 0,08 mm : le contour y était 0,16 mm trop petit et chaque
perçage 0,2 mm trop grand, soit 2,3 % de matière en moins sur chaque plaque.
Ils sont maintenant relevés à mi-épaisseur. Le biseau d'affichage du
visualisateur, qui compensait par hasard cette erreur en poussant la matière
vers l'extérieur, a été retiré : l'aire de chaque plaque est exacte au
dixième de mm².

**Coin avant gauche de la plaque supérieure.** Le fichier `top-plate.stl` ne
porte pas, à gauche, le perçage M2 avant qu'il porte à droite : à la place, une
**encoche rectangulaire ouverte sur le chant**, dans laquelle on retrouve
l'arc du perçage. Le défaut est dans le fichier lui-même, pas dans le relevé —
il est identique à cinq hauteurs de coupe. Le coin a été rendu symétrique de
son homologue droit, et le perçage refermé à sa place miroir (Ø1,92, sur l'axe
de symétrie de la plaque, mesuré à x = 0,102 dans son repère). Le contour est
maintenant symétrique à **0,082 mm près en moyenne, 0,25 mm au pire**, et la
plaque s'appuie sur toute la longueur des deux épaulements de caméra au lieu
d'un seul.

## Contacts verticaux

Le plan `tinyhoop-mk1-plan-corrige.json` pose l'empilement prêt à visser :

| interface | jeu |
| --- | --- |
| joues de caméra sur la plaque inférieure | 0,000 mm |
| plaque supérieure sur les deux joues de caméra | 0,000 mm |
| chant avant de la plaque contre la lèvre des joues | 0,000 / 0,017 mm |
| support GPS sur la plaque supérieure | 0,000 mm |
| support d'antenne VTX sur la plaque intermédiaire | 0,000 mm |

Les quatre capots (voir plus bas) sont laissés à leur pose d'origine : ils
attendent d'être placés flanc par flanc.

### La plaque supérieure était posée sur la lèvre, pas sur l'épaulement

Chaque joue de caméra porte, tout en haut, **un épaulement plat à Z 28,690**
(4,4 × 17,9 mm, une face franche de 65,6 mm² par joue) et, devant lui, **une
lèvre de 0,6 mm d'épaisseur qui remonte 1,75 mm plus haut, jusqu'à 30,44**.
C'est un logement classique : la plaque s'assied sur l'épaulement, la lèvre
lui sert de butée avant.

Le plan posait la plaque à 30,442, c'est-à-dire **sur le sommet de la lèvre** —
d'où la plaque qui semblait chevaucher le support caméra, en appui sur un
chant de 0,6 mm et 1,75 mm de vide sous elle. Elle descend maintenant à
28,690 : contact **0,000 mm sur les deux joues**, dessus de plaque à 30,690,
soit 0,25 mm au-dessus de la lèvre.

### Calage horizontal : la lèvre en butée, et l'axe du châssis

La plaque est désormais posée sur deux références franches plutôt que sur un
seul perçage :

- **son chant avant bute sur la lèvre des deux joues** — 0,000 mm à droite,
  0,017 mm à gauche, ce qui fixe sa position en profondeur ;
- **son axe de symétrie est sur celui du châssis** (x = −0,10, moyenne des dix
  couples de perçages symétriques de la plaque inférieure et de la plaque
  intermédiaire), ce qui fixe sa position en largeur.

Le support GPS a suivi la même translation ; ses deux oreilles retombent à
0,178 mm des perçages avant de la plaque.

**Ces pièces sont sur-contraintes : six vis, et les six trous ne peuvent pas
tomber en face en même temps.** Voici les écarts, mesurés :

| vis | écart |
| --- | --- |
| avant gauche, plaque → joue gauche | 0,635 mm |
| avant droite, plaque → joue droite | 0,633 mm |
| arrière 1, plaque → plaque intermédiaire (×2) | 0,695 / 0,699 mm |
| arrière 2, plaque → plaque intermédiaire (×2) | 0,935 / 0,922 mm |

C'est le meilleur compromis possible sans déformer une pièce : caler la plaque
sur ses seuls perçages arrière les ramènerait à 0,15 mm mais porterait l'avant
à 1,19 mm, et le chant entrerait de 0,8 mm dans la lèvre. Le compromis retenu
est symétrique gauche/droite et n'a **aucune** interférence. Les perçages de la
plaque font Ø1,9 pour des M2 : il faudra une pointe de lime ou une mèche de
2,5 sur les quatre trous arrière au montage. L'écart vient des pièces livrées,
pas du plan.

### Le support GPS reposait 1,61 mm au-dessus de la plaque

Son encombrement descend à 32,44, mais ce point bas est un ergot situé
**10 mm en avant du bord de la plaque**, dans le vide. Sa vraie face d'appui —
171,9 mm² — est 1,61 mm plus haut. Elle est maintenant plaquée sur le dessus
de la plaque : jeu 0,000 mm, aucune interpénétration (mesuré sur les 63 096
sommets de la pièce).

### Chaque fichier de capot contient DEUX coques

C'est l'explication de tout ce qui coinçait. `oasisfly35DC-Cover-01.stl` et
`oasisfly35 DC-Cover-02.stl` ne contiennent pas un capot chacun mais **deux
coques distinctes, un flanc gauche et un flanc droit**, écartées de 33,5 mm
pour le cover 01 et de 23,6 mm pour le cover 02. Vérifié par découpe en
composantes connexes : deux volumes séparés, identiques au miroir près
(5 478 facettes et 2 303,8 mm³ chacun pour le cover 01).

Chargées d'un bloc, les deux coques formaient **une seule pièce rigide dont
l'écartement était figé**. D'où l'impasse : aucune position ne la faisait
entrer dans le châssis sans traverser une plaque, et il était impossible de
poser un flanc sans l'autre.

Les coques ont été **séparées à la source** — `cover-01-gauche.stl`,
`cover-01-droite.stl`, `cover-02-gauche.stl`, `cover-02-droite.stl`, obtenus
par découpe en composantes connexes, sans la moindre retouche de géométrie —
et chacune est maintenant une pièce à part entière du visualisateur :
*Cover 01 gauche*, *Cover 01 droit*, *Cover 02 gauche*, *Cover 02 droit*.

Elles sont replacées **dans leur sens d'origine** (aucune rotation) et à leur
position d'origine, chaque coque décalée de l'écart entre son propre centre et
celui de la paire — le modèle est donc, au pixel près, celui du fichier de
départ, mais les quatre flancs se déplacent maintenant séparément.

### Le support d'antenne VTX, et le conflit qui reste

Il n'est pas mal placé en X/Y : ses deux bossages Ø4 tombent à **0,003 et
0,064 mm** des M2 de la plaque intermédiaire. C'est sur ces deux perçages-là
qu'il se visse, et il y est reposé, pied à 6,75 sur la plaque intermédiaire.

Reste que ses montants culminent à **31,25**, alors que la plaque supérieure
est à sa vraie place, dessous à 28,69. Deux d'entre eux la traversent donc de
**2,56 mm** — le troisième, le plus en arrière, passe derrière le bord de la
plaque et ne gêne pas. Le poser sous la plaque enterrerait tout son pied dans
la plaque intermédiaire (mesuré : 837 sommets dans la matière). À arbitrer :
raccourcir les deux montants de 2,56 mm, ou reculer le support d'une dizaine
de millimètres.

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

## TinyHoop-MK1-build-complet.step — 20 corps nommés

*(et sa version allégée `TinyHoop-MK1-build-leger.step`, 23 Mo : même contenu,
mêmes couleurs, mêmes positions, maillages plus grossiers — écart jusqu'à
0,55 mm au lieu de 0,29. Elle existe parce que 44 Mo ne passent pas par la
messagerie.)*

Un assemblage de 20 corps nommés :

- les 8 pièces carbone en **formes exactes** (contour extrudé, perçages en
  vrais cercles) — identiques au fichier châssis ;
- les 12 pièces imprimées en solides facettés **simplifiés** (les capots
  comptent pour quatre depuis leur séparation en flancs gauche et droit).

Écart mesuré des pièces simplifiées, distance point-surface dans les deux
sens : **0,006 à 0,030 mm en moyenne, 0,11 à 0,29 mm au pire** — soit moins
qu'une couche d'impression. Version allégée : 0,017 à 0,076 mm en moyenne,
0,55 mm au pire. Positions vérifiées par relecture du fichier : **0,000 mm**
sur les huit pièces carbone, 0,067 mm au plus sur les pièces imprimées (l'effet
de leur simplification sur leur encombrement).

Pourquoi simplifier : en STEP, une facette coûte environ 3 ko. Les 305 468
triangles d'origine pèseraient plus de 700 Mo. Le regroupement de sommets sur
grille fait tomber le support caméra de 92 352 à 916 triangles sans dépasser
0,21 mm d'écart — ces fichiers CAO sont pavés de triangles bien plus fins que
nécessaire.

## TinyHoop-MK1-chassis.step — 7,8 Mo

Les 8 pièces carbone seules, formes exactes, corps nommés, teintées carbone.
Faces planes sur lesquelles esquisser, trous cylindriques mesurables. Rien n'y
est approché.

## Les 12 pièces imprimées, maillages à pleine résolution

Même contenu dans deux formats, positions vérifiées à 0,000 mm :

- `TinyHoop-MK1-pieces-imprimees-STL.zip` — douze STL binaires, un par pièce,
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
