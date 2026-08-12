# TinyHoop MK1 — visualisation du build FPV

Viewer 3D pour modéliser le drone pièce par pièce, à partir des photos que tu
fournis. Tout est **hors-ligne** : Three.js est embarqué dans `vendor/`, il n'y
a aucune dépendance réseau ni build à lancer.

## Lancer

Ouvre `index.html` dans un navigateur. Après un `git pull`, force le
rechargement (Ctrl+Maj+R) : le navigateur garde les modules en cache et
continuerait sinon à servir l'ancienne version. Si les modules ES sont bloqués en
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

Les châssis FPV portent en revanche des motifs de fixation normalisés, de deux
familles : les platines de contrôleur de vol (20 × 20, 25,5 × 25,5, 16 × 16,
30,5 × 30,5) et les fixations moteur (6, 9, 12, 16, 19 mm). Les secondes sont
indispensables aux bras, qui ne portent aucun motif de la première. L'outil
cherche ces carrés dans les perçages tracés et en déduit l'échelle.

La référence d'échelle est la **plus grande dimension** de la pièce, pas sa
hauteur dans la photo : un bras photographié en paysage serait sinon calé sur
sa largeur et sortirait cinq fois trop grand.

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

### Quand les motifs ne suffisent pas

Un bras ne porte souvent qu'**un seul carré**, celui du moteur. Or un carré
isolé est ambigu : 6, 9, 12, 16 ou 19 mm conviennent tous, et l'échelle qui en
découle varie du simple au triple. L'outil ne tranche donc pas tout seul — il
affiche **ÉCHELLE NON CONFIRMÉE**, propose les lectures possibles, et attend.

C'est important pour une configuration *dead cat*, où les bras avant et arrière
n'ont pas la même longueur : sans cet avertissement, la deuxième pièce héritait
en silence de la longueur de la première, et deux bras différents finissaient
identiques.

Le motif retenu est mémorisé : sur la pièce suivante, la lecture qui repose sur
le même standard remonte en tête, annotée. Quatre bras qui partagent le même
carré moteur ne risquent donc pas de recevoir deux standards différents.

Une pièce dont l'échelle n'a pas été confirmée porte la mention **échelle non
confirmée** sur sa fiche, jusqu'à ce qu'un motif soit choisi ou la dimension
saisie à la main.

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
| Plus grande dimension | l'échelle de la pièce — longueur ou largeur selon son orientation sur la photo. Calée d'office sur les motifs de perçage quand plusieurs se confirment |
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
| Configuration | dead cat, **bras arrière plus longs** |
| Empattement | 175 mm |
| Plaque inférieure | 1,5 mm |
| Plaque intermédiaire | 2,5 mm |
| Plaque supérieure | 2,0 mm |
| Bras | 3,5 mm |

Choisir le **rôle** d'une pièce à sa création lui donne son épaisseur : elle
n'est pas à saisir deux fois. Les bras avant et arrière sont deux rôles
distincts, de même épaisseur mais de longueurs différentes — les confondre
reviendrait à en perdre un.

L'empattement servira de contrôle une fois les bras modélisés : c'est la
diagonale d'axe moteur à axe moteur, et en dead cat les quatre moteurs forment
un rectangle, pas un carré.

### Le chanfrein

Sur la pièce réelle, l'angle d'usinage des joues du support caméra accroche la
lumière et dessine un filet clair tout autour du contour et des ouvertures.
Le visualiseur le rend, et **ce n'est pas le même objet que les arêtes
surlignées** :

| | |
|---|---|
| **Arêtes surlignées** | calque de lecture, bleu, sur toutes les pièces. La case du menu Affichage l'allume et l'éteint. |
| **Chanfrein** | caractéristique de la pièce. Seules celles qui le déclarent en portent un — aujourd'hui les deux joues caméra, **qui sont en aluminium usiné** et dont l'arête accroche vraiment la lumière. **Il reste visible quand la case est décochée.** |

Décocher une aide à la lecture ne doit pas effacer une arête réellement
chanfreinée : c'est toute la différence entre les deux.

Menu **Affichage** : **Couleur du chanfrein** et **Intensité du chanfrein**,
conservées d'une session à l'autre. Il ne s'efface qu'en mode fil, où la pièce
n'est plus qu'un maillage et où un filet de contour n'aurait plus de sens.

Pour en donner un à une autre pièce, il suffit de lui passer `chamfer: true`
dans son module.

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

## Le plan de build livré

`tinyhoop-mk1-plan.json` — le build monté, à charger par **Plan ▾ → Importer**.
Il place les **vingt-sept pièces** : le châssis, les covers, les supports, les
patins, puis les quatre moteurs et les quatre hélices.

Les moteurs n'y sont pas posés à vue. Chaque bras porte, au centre de ses
quatre perçages M2, un **dégagement d'arbre de Ø4,25** : c'est lui qui donne
l'axe. Le moteur est posé dessus, sur la face supérieure du bras (y = 4,25),
et l'hélice à 11,75 mm au-dessus — le dessus du moyeu de cloche.

Ce que ce calage donne comme contrôle, une fois les quatre axes placés :

| | |
|---|---|
| Rectangle moteur | 139,7 × 101,6 mm |
| Diagonale (empattement) | **172,7 mm** |
| Fiche technique | 175 mm |
| Écart | 2,3 mm, soit 1,3 % |

C'est l'usage annoncé de l'empattement — *« il servira de contrôle une fois
les bras modélisés »*. Les 1,3 % qui restent viennent du placement des bras
dans le plan, pas de la géométrie des pièces : au montage, le visualiseur
recale de lui-même 15 pièces sur leurs perçages, de 0,40 mm au maximum.

Écart entre axes voisins : **101,6 mm** pour des hélices de 88,9 — les disques
ne se recouvrent pas, il reste 12,7 mm entre bouts de pales.

### Il s'installe tout seul, une fois

**À la première visite, la page s'ouvre sur le drone monté.** Le plan est
installé d'office, et le build s'affiche assemblé plutôt que rangé sur
l'établi : c'est le drone qu'on vient voir.

Trois précautions, parce qu'écraser le travail de quelqu'un est le pire défaut
qu'un outil puisse avoir :

- rien n'est installé s'il y a **déjà des placements** en mémoire ;
- un **jeton** est posé, si bien qu'un plan effacé exprès reste effacé — vider
  l'assemblage ne le fait pas revenir à la prochaine ouverture ;
- tout est **enveloppé** : fichier absent, JSON illisible, stockage refusé, la
  page s'ouvre quand même, simplement sur l'établi comme avant.

Aucun de ses placements n'est marqué « à la main ». Ce drapeau fige une pièce
partout, animation d'assemblage comprise, et la migration des anciens plans
efface justement les placements qui le portent : le plan livré y perdait
quatre positions — covers, top-plate et support GPS — à peine chargé.

> L'ancien `tinyhoopmk1plancorrige (2).json` a été **supprimé** : il désignait
> encore les covers par `cover-01` et `cover-02`, identifiants disparus depuis
> que chaque flanc est une pièce à lui.

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

### Sélectionner et manipuler une pièce

Un clic sur une pièce — dans la vue 3D ou sur sa fiche — la sélectionne : elle
se souligne en orange, et une barre d'actions apparaît sous la vue.

Ce clic **solde aussi les surbrillances** de la contrainte précédente. Après un
ancrage, la paire de perçages reste en vert le temps de la seconde paire ; dès
que tu cliques ailleurs, l'alignement est acquis et les repères s'éteignent.
Un clic dans le vide désélectionne tout.

| Action | Effet |
|--------|-------|
| **⇋ Miroir** | symétrie gauche/droite de la pièce. Le tracé lui-même est retourné, pas l'échelle de l'objet : une mise à l'échelle négative retournerait les normales et fausserait l'éclairage et les ombres. Les perçages changent donc de place — l'alignement est à reprendre. |
| **⬆ Dessus** / **⬇ Dessous** | pose la pièce d'un côté ou de l'autre de celle sur laquelle elle a été assemblée, au contact. Inactifs tant que la pièce n'a pas été assemblée : sans référence, « dessus » ne veut rien dire. |

Miroir et côté sont conservés avec le reste de l'assemblage.

Une pièce pas encore assemblée reste à sa place sur l'établi plutôt que d'aller
à l'origine : sinon les pièces se recouvriraient et deviendraient impossibles
à viser.

### Changer l'habillage d'un cover

Les **covers latéraux** (pièces 10 et 11) existent en neuf habillages. Clique
sur le cover — dans la vue 3D ou sur sa fiche — et une ligne **Habillage**
s'ajoute en haut de la barre d'actions. Le fichier est chargé au moment où tu
le demandes, pas au démarrage ; la pièce garde sa place, sa rotation et sa
teinte, et chaque côté choisit le sien.

Ce ne sont pas des pièces en plus : ce sont les deux mêmes covers qu'avant, à
qui on donne le choix de leur habillage. Le build compte toujours vingt pièces.

Le cover ne bouge pas d'un habillage à l'autre — même place, même sens. Deux
choses s'y opposaient : les deux exports fournis n'ont pas leur longueur sur le
même axe (un quart de tour de recalage remet les habillages dans le repère du
cover 01), et le rangement automatique de l'établi espace les pièces selon leur
taille, ce qui décalait un habillage plus long.

La pièce garde donc sa place à l'instant du changement, mais **son plan n'est
pas modifié** : elle reste libre, et suit l'assemblage et le désassemblage
comme n'importe quelle autre. Marquer sa position « placée à la main » la
figerait partout, y compris en vue assemblée.

| Habillage | Ce qu'il change | Matière |
|-----------|-----------------|---------|
| **Cover 01** | coque fournie, version courte (71,9 mm) — montée par défaut | 2,30 cm³ |
| **Side guard** | coque fournie, version longue (104,7 mm), avec la queue et l'ouïe ovale | 2,746 cm³ |
| **Nid d'abeille** | percé, 13 alvéoles de 5,2 mm entre plats, cloisons 1,7 mm | −17,5 % |
| **Persiennes** | percé, 8 fentes obliques de 2,7 mm à 62° | −17,3 % |
| **Treillis** | percé, 18 triangles alternés, cloisons 2,2 mm | −12,1 % |
| **Skull** | relief plein, crâne de face, 0,66 mm de saillie | +2,5 % |
| **Shark** | relief plein, requin de profil sur 44 mm, 0,62 mm | +4,5 % |
| **Circuit** | relief plein, routage de circuit imprimé, pistes de 0,9 mm | +0,1 % |
| **Carbone tressé** | relief plein, tissage à ±45° sur toute la joue, 0,46 mm | +2,5 % |

Les deux premiers sont les fichiers fournis. Les sept autres dérivent du side
guard et partagent au micron près son encombrement (104,66 × 17,62 × 29,87 mm),
son épaisseur de paroi (1,55 mm) et toutes ses surfaces de montage : le motif
s'arrête à 0,9 mm des bords, et ni les ergots, ni les épaulements, ni le
perçage ovale arrière ne sont touchés. Un habillage se substitue donc à un
autre sans rien changer au reste du châssis.

Les pourcentages de matière sont donnés par rapport au side guard, pas au
cover 01 : les sept motifs en dérivent tous.

Les percés ouvrent la joue **là seulement où la coque est une paroi simple** de
0,9 à 2,6 mm — nervures et zones épaisses sont exclues par construction. Les
reliefs, eux, ne percent rien : c'est la face externe (celle qui ne porte pas
les nervures) qui est déplacée vers l'extérieur par un champ de hauteur.
L'épaisseur locale ne peut qu'augmenter.

### Le cache de vis caméra

Pièces 22 et 23, une par joue. Le dos de la joue support caméra porte un
**lamage de 2 mm de fond sur 425 mm²** : le cache le remplit à fleur de la
jante, sans rien ajouter hors-tout.

| | |
|---|---|
| Encombrement | 33,4 × 4,9 × 21,7 mm |
| Volume | 0,890 cm³ — 1,10 g en PLA |
| Jeu latéral | 0,15 mm |

Il ne tient pas par simple emboîtement : **deux crochets traversent l'ouverture
d'objectif et reprennent 0,55 mm sur la face avant**, avec une fente de 3,6 mm
entre eux pour qu'ils fléchissent à la pose. Un dégagement Ø5,6 sur 1,1 mm est
creusé au-dessus du perçage Ø4,5, pour que le cache vienne à fleur même si une
tête de vis dépasse du fond de poche.

Le maillage est fermé — chaque arête sert exactement deux fois — et l'écart au
modèle est de **0,010 mm au maximum**, mesuré sommet par sommet après
allègement. C'est le fichier tel qu'il sort du bouton **⬇ STL** de la fiche.

Le cache **suit sa joue** : il n'a pas de place à lui dans le châssis, donc en
vue assemblée il se pose dessus au lieu de rester sur l'établi. Il voyage avec
elle à l'assemblage comme au désassemblage. Sur l'établi il garde son propre
créneau, c'est là qu'on le regarde seul ; et si tu le déplaces aux curseurs,
ta position l'emporte.

### Les habillages de top plate

La top-plate existe en **quatre habillages**, choisis au clic comme ceux des
covers — chaque famille a son propre sélecteur.

| Habillage | Ce qu'il est |
|---|---|
| **Origine** | la plaque **tracée** du fichier fourni — contour et perçages |
| **Nid d'abeille** | alvéoles de 5,4 mm, cloisons 1,15 mm, grand hexagone central |
| **Skull** | motif crâne, mis aux proportions de la plaque, lettrage conservé |
| **Vector** | motif vector, même traitement |

Les trois motifs sont dessinés sur **le contour et les perçages de la plaque de
référence** : ils se vissent au même endroit, 30,6 × 104,88 × 2,0 mm.

Deux corrections leur sont communes, héritées d'un défaut du fichier fourni :

- **le haut est rendu symétrique.** Le fichier porte une patte pleine à droite
  et un crochet ouvert à gauche. Il manquait donc la matière à gauche, et y
  percer ne produisait rien — c'est ce qui laissait le trou incomplet. La patte
  de droite est recopiée en miroir au-dessus de y = 42.
- **le sixième perçage.** Matière rétablie, le trou manquant est percé en
  (−13,17 ; 49,05). Les six sont percés **en dernier**, après la matière rendue
  au bord et un anneau franc de 1,6 mm autour de chacun : aucune découpe de
  motif ne peut plus les entamer, pas même celui qui ne passe qu'à 2,22 mm du
  contour.

Sur les motifs, seules les découpes larges sont élargies de 0,30 mm ; le
lettrage garde sa cote, sinon ses traits fins se referment.

> Limite connue : l'onglet **Plan coté** montre toujours le contour de la
> plaque tracée, quel que soit l'habillage affiché en 3D. Les habillages sont
> des maillages, ils n'ont ni contour ni perçages extraits.

### Le stick pad

Pièce 24, en **TPU souple** — la seule pièce non rigide du build. Il empêche la
batterie de glisser sur la top-plate et reprend ses découpes : les deux fentes
de sangle et le logo.

| | |
|---|---|
| Encombrement | 30,5 × 69,6 × 1,5 mm |
| Volume | 2,015 cm³ |

C'est sur ces découpes qu'il se cale, pas sur des perçages. Les quatre
ouvertures appariées donnent **aucune mise à l'échelle à faire** — les cotes
concordent à 0,4 mm près — mais un **décalage de 4,4 mm** dans le sens de la
longueur, très resserré d'une découpe à l'autre (dispersion 0,06 mm). Le pad
est donc porté par la top-plate avec ce décalage, et la suit à l'assemblage
comme au désassemblage.

Les contours du fichier fourni étaient facettés — 242 points pour tout le
pourtour. Mais **la moitié de ce pourtour est rectiligne** (100 mm de segments
droits sur 200), et un lissage uniforme arrondissait ces droites. Seuls les
congés sont donc redensifiés, les longs segments restent des droites exactes :
écart au tracé d'origine **0,082 mm au pire**, 0,012 mm en moyenne.

Les deux fixations étaient des **trous de serrure** — une poche circulaire de
Ø3,4 ouverte sur le bord par un couloir. Elles sont désormais **fermées en
cercles pleins**, à l'aplomb des perçages de la plaque (±12,4 ; à 4,4 mm de
décalage près, ce qui confirme le calage par un chemin indépendant).

### Les habillages de support GPS

Le support GPS avant (pièce 12) existe en **cinq habillages**, choisis au clic
comme ceux des covers et des top plates — chaque famille a son sélecteur.

| Habillage | Ce qu'il est | Volume |
|---|---|---|
| **Origine** | la coque fournie | 1,977 cm³ |
| **Blindé** | toit à deux pans, arête faîtière franche d'un bout à l'autre, nez cassé | 2,122 cm³ |
| **Cyber** | la même coque, gravée de quatre ouïes obliques | 2,263 cm³ |
| **Mecha** | blindage à gradins, la section se rétreint par paliers francs | 2,644 cm³ |
| **Stealth** | arête en travers et pans fuyants, façon verrière d'appareil furtif | 2,338 cm³ |

Les quatre dessins sont construits **en demi-espaces** : une coque définie par
des plans donne des facettes franches et des arêtes vives, pas des bosses
molles — c'est ce qui les met dans la ligne des bras et des joues du châssis.

Ce qui est **fonctionnel** est identique dans les cinq : la semelle et ses deux
oreilles percées sont reprises telles quelles du fichier fourni, et la place du
module est creusée à l'identique. Le support se visse au même endroit et reçoit
le même module, quel que soit l'habillage.

Deux garde-fous ont demandé un vrai travail, chacun vérifié pièce par pièce :

- **la place du module.** Elle n'est pas une cavité fermée — le support est
  ouvert par le dessous et par les fentes de son toit —, si bien qu'un
  remplissage depuis l'extérieur y entre librement : les premières coques
  sortaient **pleines**, elles auraient bouché le logement. La règle retenue se
  mesure au lieu de se supposer : dans chaque tranche horizontale, l'air enfermé
  par le pourtour de matière est du logement ; on garde le plus gros bloc — les
  gorges du toit forment elles aussi des boucles fermées, et perçaient la coque
  neuve — et on le prolonge vers le bas, ce qui rend le couloir d'entrée du
  module. **1,765 cm³** ainsi protégés, et le contrôle final compte zéro
  cellule de matière ajoutée dedans.
- **l'accès aux vis.** Les deux perçages des oreilles traversent la pièce de
  part en part (Ø2 mm en −13,26 ; 19,76 et 12,46 ; 19,77). Une coque qui monte
  au-dessus les enterre : le support serait joli et invissable. Chaque dessin
  creuse donc au-dessus d'eux un **puits de 5,6 mm de côté**, comme le lamage
  que porte déjà la pièce d'origine.

Les coques sont **évidées à 1,2 mm de paroi**, et leur creux débouche dans le
logement : rien n'est emprisonné à l'impression. Chaque fichier est vérifié
**fermé** — chaque arête sert exactement deux fois —, sans triangle dégénéré,
d'un seul tenant et sans poche d'air fermée. C'est le fichier tel qu'il sort du
bouton **⬇ STL** de la fiche.

### Les moteurs et les hélices

Pièces 25 à 28 et 29 à 32. **Ce sont les deux seules pièces du build qui ne
soient ni importées d'un STL ni tracées sur une photo : elles sont dessinées**,
cote par cote, dans `js/lib/motor.js` et `js/lib/prop.js`. Un moteur ne se
livre pas en fichier CAO, et le voxeliser depuis une photo aurait arrondi
toutes ses arêtes.

| | Moteur | Hélice |
|---|---|---|
| Référence | Sub250 1804, 3450 KV | tripale 3,5″ × 2,5 |
| Encombrement | 23,0 × 23,0 × 15,1 mm | Ø 88,9 × 9,1 mm |
| Fixation | M2, entraxe 12 × 12 mm | alésage Ø5 |

**Le moteur est relevé sur les photos du fabricant** : la cloche à six
ouvertures cerclées d'un liseré turquoise, le moyeu en relief avec son téton
d'arbre et ses quatre perçages sur un Ø6,2, le fût gravé *Sub250 / 1804 / KV*,
le stator à douze dents bobiné de cuivre qu'on aperçoit par les ouvertures,
l'embase en croix à quatre pattes et les trois fils plats. Le KV est lu sur la
photo, où le fût porte « 34.. » — la seule valeur en 34xx du catalogue.

Deux détails valent d'être expliqués :

- **le liseré turquoise n'est pas une couleur peinte sur une arête.** C'est un
  second plateau, percé plus petit et posé un demi-millimètre sous le plateau
  noir. Vu de dessus : la tranche noire descend, puis une bande turquoise, puis
  le vide — exactement ce que montre la pièce.
- **le lettrage est peint dans une texture générée au vol.** Aucun fichier
  externe : le visualiseur fonctionne hors-ligne, et changer de référence
  moteur ne demande que deux chaînes de caractères.

**Le moyeu se visse en T.** Un trou au centre — le passage de l'arbre — et un
de chaque côté, sur le même cercle de Ø6,2 que les quatre perçages du dessus de
cloche : l'hélice prend donc deux d'entre eux, diamétralement opposés. C'est ce
que montre la photo du moyeu, et c'est cohérent avec le moteur, qui offre
quatre trous pour deux vis.

> **La forme des pales, elle, n'a pas de photo de référence.** Sa taille est déduite du
> châssis — un OasisFly**35** de 175 mm d'empattement tourne en 3,5 pouces, et
> un 1804 à 3450 KV est motorisé pour ça. Le dessin est donc générique : la
> combinaison la plus courante sur ce format. Envoie une photo des tiennes et
> elle se refait, tout est paramétré en haut de `js/lib/prop.js`.

La pale est une **surface réglée** : une section de profil est calculée à
chaque rayon — corde, épaisseur, vrillage, flèche — et les sections voisines
sont cousues entre elles. Le vrillage suit la loi d'une hélice à pas constant,
donc l'angle diminue avec le rayon ; il est simplement **borné sous 11,5 mm de
rayon**, sinon la pale se dresserait à la verticale au pied, là où une vraie
hélice n'a plus qu'une patte de raccordement.

Les deux sens de rotation sont **deux maillages**, pas un miroir : le vrillage
et la flèche changent de signe. Un miroir de maillage aurait retourné les
normales et l'hélice serait sortie noire.

Les pales sont **légèrement translucides** (opacité 0,62). Un disque de 89 mm
masque le bras et le moteur qu'il coiffe ; à peine transparent, il les laisse
lire au travers sans cesser d'être une pale. Cette opacité est une propriété
de la matière, pas un réglage d'affichage : le calque photo la fantomise
davantage, et en sortant du calque elle la retrouve — sans quoi décocher le
calque rendait les hélices opaques pour de bon.

#### Les fils moteur

Ils **se posent sur le bras et partent vers le centre du drone**, en nappe de
trois, pour passer sous le cover jusqu'aux deux fentes de la plaque inférieure
(5,5 × 17,7 mm, en ±5,6 ; 22,65). C'est un repère à ne pas se tromper : le
moteur partage le repère de son bras, lequel s'étend vers son −Z local avec le
moteur au bout. « Vers le centre » est donc son +Z local, soit le −Y du repère
de dessin du moteur.

Leur longueur est **différente à l'avant et à l'arrière** — 44 mm contre 62 —,
et c'est pour ça qu'il y a deux maillages de moteur et non un : sur ce dead-cat
les bras arrière font 101,7 mm contre 79,6 à l'avant, et un brin unique pendait
dans le vide d'un côté ou s'arrêtait à mi-bras de l'autre.

> Le brin s'arrête au bord du châssis, là où il plonge. Le passage dans la
> fente elle-même n'est pas modélisé : sur une vraie machine, cette portion
> dépend de la façon dont chacun range ses fils.

Ces deux pièces sont **multi-matières** — six matières pour le moteur, deux
pour l'hélice, sur un seul maillage par plages de faces. Le sélecteur de
couleur ne touche que ce qui se repeint : on peut changer la teinte d'une
cloche, pas celle d'un bobinage de cuivre.

#### L'entraxe de fixation, corrigé par les bras

Le moteur a d'abord été dessiné avec le carré de **12 × 12 mm** annoncé
partout pour ce format. Les bras disent autre chose : leurs quatre perçages
moteur sont espacés de **8,486 mm** en X comme en Z — soit √2 × 6, donc des
trous sur un **cercle de Ø12**, à 45°. Avec le carré, le moteur ne se vissait
sur rien. C'est la cote des bras qui fait foi, elle est mesurée sur le fichier
fourni ; le moteur a été refait dessus.

Chaque bras porte aussi, au centre exact de ces quatre perçages, un trou de
**Ø4,25** — le dégagement d'arbre. C'est lui qui donne l'axe moteur, sans
avoir à moyenner quoi que ce soit.

#### L'accouplement moteur-hélice

Sur les photos, l'arbre qui dépasse de la cloche est un **téton de Ø2,1**, pas
l'arbre fileté M5 habituel de ce format. L'alésage de l'hélice a donc été mis
à Ø2,4 pour que les deux pièces s'emmanchent réellement dans le visualiseur,
plutôt que de laisser un trou de Ø5 flotter au-dessus d'un téton de Ø2. C'est
une déduction, pas un relevé : elle se corrigera avec les photos des hélices.

> Leur bouton **⬇ STL** exporte bien la géométrie, mais ce n'est **pas une
> pièce imprimable** : un moteur et une hélice s'achètent, et leurs volumes se
> chevauchent au lieu de former un solide fermé. Les pièces du châssis, elles,
> restent vérifiées fermées.

### L'électronique DJI O4 Pro

Caméra, air unit et les deux antennes VTX. Ces quatre-là ne sont ni des pièces
du châssis ni des impressions : ce sont les composants que le drone embarque,
et le châssis n'existe que pour les porter. Leurs maillages viennent des
**fichiers STEP des constructeurs**, repris tels quels et jamais redessinés
(dépôt `equationstratos/stratosdrones`, `oasis30/ref/vendor_step/`).

| Pièce | Cotes lues sur le maillage | Fichier source |
|---|---|---|
| Caméra O4 Pro | 25,44 × **23,30** × 20,01 mm, tourillons Ø 2,14 | `DJI_O4_PRO_CAM.step` |
| Air Unit O4 Pro | 33,42 carré × 13,01 mm, fixation **25,5 × 25,5** | `DJI_O4_AIR_UNIT_PRO.step` |
| Antenne O4 Pro | fourreau Ø 3,50, **85 mm** utiles | `DJI_O4_Pro_Antenna_v1.step` |

La finesse de maillage est pilotée par la **courbure**, pas par une taille
unique : une face plate n'a pas besoin de mille triangles, un congé de rayon
1 mm si. À qualité égale cela divise le poids par cinq — c'est ce qui permet de
garder l'objectif net sans faire exploser la page.

Ce qui est **retiré** des fichiers d'origine : les 148 mm de nappe droite de la
caméra (dans le drone elle est pliée), le connecteur MMCX de l'antenne (il
n'est pas au support, il est branché sur l'air unit), et les cartes, blindages
et micro-connecteurs enfermés dans les coques — invisibles une fois montés, et
ils coûtaient l'essentiel du maillage.

**Elles ne se peignent pas.** Une livrée repeint le châssis, pas la caméra :
leur matière porte `fixedTint`, et le sélecteur de couleur comme les livrées
passent leur chemin. **Elles ne se vissent pas au sachet** non plus
(`noFastener`) : leurs perçages sont ceux du constructeur.

#### Où chacune se loge

Aucune n'a de place à elle dans le plan : chacune **suit la pièce qui la
porte**, et si on déplace cette pièce, elle suit.

**Les antennes.** Le support d'antenne VTX porte quatre perçages, et il fallait
trouver les bons. Deux fûts verticaux Ø 3,99 le traversent de part en part
(entraxe 21) : ce sont eux qui le vissent au châssis. Deux canaux Ø 2,89, eux,
partent du cœur de la pièce et s'ouvrent en **V** sur sa face inclinée — ce
sont les logements d'antenne. Leur axe a été ajusté aux moindres carrés sur
les faces du perçage (292 et 278 facettes, écart au cylindre 0,03 mm), et le
résultat est parfaitement symétrique — c'est ce qui confirme la lecture :

| | gauche | droite |
|---|---|---|
| inclinaison sur la verticale | 55,5° | 55,2° |
| ouverture latérale | −32,9° | +32,7° |
| recul | +52,5° | +52,2° |

Le fourreau fait Ø 3,50 pour un alésage de Ø 2,89 : c'est voulu, la matière
serre le fourreau. Les 10 mm enterrés ne se voient pas ; le reste sort en V,
comme sur le drone monté.

**Et la tête va au bout, pas dans le trou.** La première conversion coupait le
STEP à z = 9 pour écarter « le connecteur MMCX » — sauf que c'est la TÊTE de
l'antenne qui est de ce côté-là du fichier, et le connecteur à l'autre bout.
L'antenne sortait donc du support par son fourreau nu, capuchon en moins et à
l'envers. Le profil du brin, relevé section par section, ne laisse aucun doute :

| z dans le STEP | Ø | ce que c'est |
|---|---|---|
| −12,25 → 5,5 | 14,5 | la **tête**, calotte arrondie |
| 5,5 → 44,5 | 3,50 | le **fourreau** |
| 44,5 → 94 | 1,50 | le **coaxial**, puis le MMCX |

La conversion garde donc tête et fourreau, coupe le coaxial — il descend dans
le drone, pas dans l'alésage — et retourne le tout : fourreau à z = 0, tête
vers l'extérieur.

**L'air unit** va dans la baie **arrière**, centrée à z = +53,4. La plaque
intermédiaire porte deux baies, chacune percée aux deux standards (20 × 20 et
25,5 × 25,5) ; celle de l'avant, à z = +12,0, tombe pile sur le serrage des
bras, donc sur le centre de gravité — c'est la place du contrôleur de vol, pas
celle de l'émetteur. Un **demi-tour** amène le connecteur de nappe face à la
caméra ; sans lui la nappe partirait vers la queue et devrait faire le tour du
drone. L'USB-C se retrouve alors sur le flanc droit, où il est accessible.

**La caméra** est portée par la plaque de fond — l'origine du build — et non
par les joues, dont le repère est tourné de 88° et retourné. Son centre est
visé à (0 ; 15,0 ; −33,0), objectif affleurant le nez des joues à z = −45,3.
Elle bascule de **15°** vers le haut : ce n'est pas une cote du châssis, la
caméra se règle au montage, elle est serrée entre les deux joues et rien ne
fixe son angle.

#### La cage manque de 1,5 mm

Mesuré, pas supposé. Le passage libre entre les faces intérieures des deux
joues s'ouvre en V vers l'arrière — **20,95 mm** à z = −18, **22,62 mm** à
z = −42 — alors que la caméra en fait **23,30** sur toute sa longueur. Résultat
au droit de la caméra :

| z | largeur caméra | passage entre joues | serrage par côté |
|---|---|---|---|
| −26 | 20,18 | 21,51 | −0,67 (jeu) |
| −32 | 23,40 | 21,93 | **+0,74** |
| −38 | 23,15 | 22,34 | +0,40 |
| −44 | 22,59 | 22,76 | −0,09 (jeu) |

Les congés de la coque sauvent les extrémités ; au plus serré la caméra entre
de **0,74 mm dans chaque joue**. Le châssis étant vendu *pour* l'O4 Pro
(plaques 1,5 / 2,5 / 2,0 mm et bras 3,5 mm, toutes vérifiées sur le modèle),
la cage réelle est forcément plus large : il manque environ **1,2 mm par joue**
au placement actuel. Deux causes possibles, et je ne peux pas trancher depuis
le fichier — les joues sont posées avec un lacet de 2° qui ferme la cage à
l'avant, et leur écartement vient d'un placement à la main. La caméra est donc
posée à ses cotes exactes, sans mise à l'échelle : c'est la cage qui bougera si
on décide de la corriger.

### La protection d'antenne, en TPU

Une **cage fendue** qui coiffe la tête de l'antenne, prolongée par un **fût
conique creux** qui descend sur le fourreau. C'est elle qui encaisse le crash à
la place de l'antenne : la tête d'une O4 Pro est ce qui touche le sol en premier
quand le drone se retourne.

Elle est dessinée **sur l'antenne**, pas à vue — les cotes intérieures viennent
du maillage du STEP constructeur :

| | mesuré sur l'antenne | retenu pour la pièce |
|---|---|---|
| fourreau | Ø 3,53 | alésage du fût **Ø 4,0** |
| tête | Ø 14,53 × 20,75 | logement **Ø 15,0 × 23,0** |

Hors tout : **Ø 18,0 × 49,3 mm**, paroi 1,5, fond de choc 2,6.

Les **fentes** ne sont pas décoratives, et elles sont sur la pièce réelle : le
TPU doit pouvoir s'ouvrir pour laisser passer la tête à l'enfilage, une cage
pleine ferait cage de Faraday autour d'une antenne, et la matière économisée
est de la masse en moins au bout d'un bras de levier. Leurs extrémités sont
rondes — un angle vif serait l'amorce de déchirure.

Le générateur est [`tools/protection-antenne.py`](tools/protection-antenne.py) :
révolutions, congés et booléens sous OpenCASCADE, puis un maillage piloté par
la courbure. Il **vérifie le solide fermé** avant d'écrire — chaque arête doit
appartenir exactement à deux triangles — et sort en échec sinon.

```
  protection d'antenne : 18 354 triangles, 896 Kio
     encombrement  Ø 18,03 × 49,25 mm
     arêtes libres 0 / 27 531  → FERMÉE
```

Dans le visualisateur, elle est portée par l'antenne, qui est elle-même portée
par son support : **trois maillons**. Les pièces portées se résolvent donc
maintenant dans l'ordre de la chaîne — traitées dans l'ordre du registre, la
protection était placée avant que son antenne n'ait quitté l'établi, et
recopiait une position périmée à cinq cents millimètres du drone.

### La détection, par colonne

**Détecter et poser** raisonnait par PAIRES : chaque perçage bas cherchait un
perçage haut, et tous les couples possibles devenaient des fixations. Sur un
empilage de trois pièces, cela en donnait **trois pour un seul trou** — plaque
vers bras, bras vers plaque intermédiaire, et par-dessus le marché plaque vers
plaque avec une entretoise de 3,5 mm inventée là où c'est le **bras** qui
remplit l'écart. Un curseur d'espacement minimal masquait le problème en n'en
gardant qu'une, au hasard. Ce curseur a disparu : il n'a plus lieu d'être.

La détection raisonne maintenant **par colonne**. Tous les perçages alignés à
la verticale forment un empilage ; la colonne se découpe à chaque vide, et
chaque étage reçoit **une** vis, qui traverse tout ce qui est au-dessus et mord
dans la pièce du bas. S'il reste de l'air entre deux étages de plaques, c'est
là — et là seulement — qu'une entretoise se dresse.

Ce que ça donne sur ce châssis, sans une seule fixation laissée sans vis :

| | |
|---|---|
| 8 × **M2×8** | plaque inférieure → intermédiaire, **en serrant le bras** (1,5 + 3,5 + 2,5), **par le dessous** |
| 8 × **M2×7** + entretoise 1 mm | clamp-plate → intermédiaire |
| 4 × **M2×8/M2×6** + entretoise 21,94 mm | l'étage de la top-plate |
| 16 × **M2×10** | les moteurs, par le dessous |
| le reste | joues caméra, support VTX, support GPS, stick pad |

Quatre règles ont été nécessaires, toutes tirées de défauts constatés :

- **la sonde voit les deux faces** le temps de la mesure. Les matières sont en
  face avant : un rayon lancé vers le bas ne rencontrait que les surfaces
  tournées vers le haut. La joue caméra annonçait 12 à 24 mm de matière à
  traverser, le support VTX 15, et l'outil réclamait des M2×16 à M2×26 qui
  n'existent pas au sachet. Mesures corrigées : 4,1 et 3,0 mm ;
- **un pied de fixation est mince** — au-delà de 8 mm, le perçage aligné est
  autre chose. Les trous d'axe d'une joue caméra, à vingt-cinq millimètres du
  plan de pose, tombent en projection sur les perçages de la plaque ;
- **une entretoise ne se dresse qu'entre deux plaques**, et sur la plaque la
  plus proche en dessous. Un flanc de cover clipsé s'intercale dans la colonne
  sans rien porter, et la top-plate y perdait ses entretoises ;
- **tous les perçages ne sont pas des taraudages.** Le support VTX se fixe par
  deux trous de Ø3,99 — hors de toute plage de filetage. Le filetage se lit sur
  le perçage le plus étroit de la colonne, les autres ne font que laisser
  passer.

### La sonde prend le pied, pas le premier rayon venu

La sonde tire vingt-quatre rayons autour de chaque perçage — trois couronnes,
huit directions — pour mesurer l'épaisseur que la vis doit traverser. Elle
gardait le **premier** échantillon exploitable, et le résultat dépendait donc de
l'angle tiré : sur une joue de support caméra, le rayon qui longe la joue
DEBOUT traverse vingt millimètres de matière verticale quand son voisin, tombé
sur le pied couché, en traverse quatre. Les deux sont vrais ; un seul intéresse
la vis. Les deux joues, qui sont pourtant la même pièce en miroir, mesuraient
**4,12 et 21,50 mm au même perçage**.

La vis ne serre que ce qui touche la pièce d'en dessous. On garde donc les
échantillons dont le dessous est le plus bas — ceux qui posent vraiment — et,
parmi eux, **le plus mince** : c'est le pied. Un plancher de 1 mm écarte les
éclats de chanfrein.

Effet : les quatre pieds du support caméra mesurent maintenant la même chose
des deux côtés, et **trois fixations qui manquaient sous le nez du drone**
reviennent — leurs 14 à 21 mm dépassaient la traverse maximale et les faisaient
écarter.

> Un rayon qui frôle un triangle dégénéré fait tomber Three.js :
> `Triangle.getInterpolation` y rend `null` et le raycaster lit aussitôt `.dot`
> dessus. Avec un seul rayon le cas ne se présentait jamais ; avec vingt-quatre,
> si. Un échantillon perdu n'est pas grave, il en reste vingt-trois — la sonde
> passe outre plutôt que d'emporter le démarrage.

### Le sens de vissage : ce qui pose sur le plancher monte par le dessous

Une colonne qui s'arrête sur la **plaque de fond** ne peut pas se visser par le
dessus. Il faudrait traverser tout le châssis pour ne mordre que 1,5 mm de
carbone, et la tête resterait plantée au milieu de l'électronique. On visse par
le dessous — **tête sous le plancher, tige vers le haut** —, comme les vis
moteur, et comme on le fait sur la machine réelle : c'est la seule face du
drone qu'on atteigne librement une fois l'empilage monté.

La règle est **géométrique**, pas nominative : le détecteur cherche la plaque la
plus basse du build et retourne toute fixation dont l'étage pose dessus. Sur ce
châssis, cela fait **9 vis** :

| | |
|---|---|
| 8 × **M2×8** | sous la bottom-plate, à travers le bras, filet dans la plaque intermédiaire |
| 1 × **M2×6** | sous la bottom-plate, filet dans le support caméra |

**Les longueurs ne bougent pas**, et c'est attendu : traverser 1,5 + 3,5 pour
mordre 2,5 revient au même que traverser 3,5 + 2,5 pour mordre 1,5. C'est bien
le même M2×8 — seul le sens change. Ce qui change dans le modèle, c'est le plan
d'appui de la tête (la face **inférieure** du plancher au lieu de la face
supérieure de la pièce haute) et les deux épaisseurs, qui s'échangent : la vis
traverse tout l'étage sauf sa pièce du haut, et mord dans celle-là.

La nomenclature les sort sous leur propre ligne, **Vis de châssis — par le
DESSOUS**, à côté de celle des vis moteur.

### Les vis moteur

Elles sont à part dans tout le build, et la nomenclature les sort de la masse
sous leur propre ligne, **Vis moteur — par le DESSOUS**.

| | |
|---|---|
| Nombre | 4 par moteur, **16** en tout |
| Longueur | **M2×10** |
| Sens | tête **sous** le patin, filet dans la semelle du moteur |
| Provenance | livrées **avec les moteurs** |

**Elles montent par le dessous**, et c'est ce qui les rendait introuvables : le
détecteur de visserie ne savait poser qu'une vis par le dessus, tête sur la
pièce haute. Appliqué au moteur, il plantait une tête au sommet de la cloche.
Une pièce peut désormais déclarer qu'elle se visse par en dessous ; le couple
est alors lu à l'envers — la vis traverse la pièce basse et mord dans la haute.

**Elles ne prennent pas que le bras.** Les quatre trous du patin sont sur le
même cercle de Ø12 que ceux du moteur : la même vis prend la bride du patin,
traverse le bras, puis se visse dans la semelle. D'où la longueur :

    2,5 mm de patin + 3,5 mm de bras + 3,4 mm de taraudage = 9,4 → M2×10

**Le sachet du châssis n'a pas cette longueur** — il saute de M2×8 à M2×12.
C'est normal, et c'est dit dans la fiche : les vis moteur viennent avec les
moteurs. Les laisser puiser dans le sachet vidait les vis longues au détriment
des fixations qui en ont besoin, et laissait douze moteurs sur seize sans vis.

### Les vis d'hélice

Deux par hélice, dans les perçages latéraux du moyeu — le trou central, lui,
n'est pas une fixation mais le passage de l'arbre, et rien n'a été ajouté pour
l'exclure : le moteur n'a aucun perçage en face, et un perçage seul ne fait pas
une colonne.

| | |
|---|---|
| Nombre | 2 par hélice, **8** en tout |
| Longueur | **M2×8** |
| Ce qu'elle traverse | 6,2 de moyeu d'hélice + 1,8 de prise dans la cloche |
| Provenance | livrées **avec les moteurs** |

Deux choses ont dû être corrigées pour que ces vis existent.

**Les deux motifs ne se faisaient pas face.** Les quatre taraudages du moyeu
moteur étaient dessinés à 45°, l'hélice a ses deux perçages sur un diamètre
franc : la vis n'avait rien à mordre. Rien ne fixait l'angle de ces quatre
trous — il ne se lit sur aucune photo, alors que celui des perçages d'hélice,
si. C'est donc le moteur qui s'aligne sur l'hélice.

**Le taraudage part de la portée, pas du plateau.** L'hélice ne pose pas sur le
plateau de la cloche mais sur le moyeu qui le surmonte de 0,6 mm. Le faire
démarrer au plateau laissait 0,6 mm de vide entre les deux perçages — assez
pour que la colonne se coupe en deux et que l'hélice perde ses vis.

> Deux cotes sont **déclarées** ici plutôt que mesurées, et le code le dit :
> l'épaisseur du moyeu d'hélice (6,2 mm — la sonde tombait sur une PALE, qui ne
> fait que 2,3 mm au droit du perçage, et sortait une vis en M2×5 et l'autre en
> M2×8), et la prise dans la cloche (0,6 de portée + 0,7 de plateau + 0,5 de
> reprise de matière : un taraudage M2 dans 1,3 mm de tôle ne tiendrait pas une
> hélice).

**Un trou, une vis.** Là où une vis monte par le dessous, le détecteur
classique voyait *aussi* un couple patin → bras et posait une seconde vis, tête
sur le dessus du bras : deux têtes pour un seul perçage. C'est pourtant la même
vis qui fait les deux, et les doublons sont maintenant écartés — toute fixation
classique tombant à moins de 1,2 mm d'une fixation par le dessous est
supprimée.

Deux cotes ont dû être **déclarées** plutôt que mesurées, parce que la sonde de
perçage ne sait pas les voir. Elle lance un rayon vers le bas et ne retient que
ce qu'il touche ; or les matières d'une pièce dessinée ou importée ne sont
tournées que vers l'extérieur, si bien que le rayon voit les dessus et jamais
les dessous. Sur une plaque carbone, dont la matière est double face, la mesure
est juste ; ailleurs, non :

- le **taraudage du moteur**, 3,4 mm. Palpé, il donnait 1,6 — donc une vis trop
  courte pour tenir un moteur ;
- la **bride du patin**, 2,5 mm. Palpée, elle donnait 8,70 : l'encombrement de
  la pièce entière, béquille comprise. La cote vient du fichier — sur 3 364
  colonnes sondées, 1 360 tombent entre 2,5 et 3,0 mm, médiane 2,50.

## Les livrées

Cinquième bouton de la barre : **Livrées ▾**. Un jeu de couleurs cohérent posé
d'un clic sur tout ce qui se peint.

| Ce qui est peint | |
|---|---|
| Pièces imprimées | covers, joues, supports, patins, caches |
| Stick pad | matière à part — la bobine de TPU n'est jamais du même bain |
| Cloches moteur | aluminium anodisé, donc repeignable |
| Liseré des cloches | l'accent de la livrée — deux couleurs sur un moteur, c'est tout l'intérêt |
| Joues du support caméra | **en aluminium usiné**, pas en plastique : elles suivent les cloches |
| Filet de chanfrein | une livrée sombre veut un filet clair, et l'inverse |
| Toute la visserie | d'un bloc — on ne panache pas des vis |
| **Les deux hélices avant** | et elles seules |

**Pourquoi les hélices avant seulement.** C'est la convention du FPV : l'avant
d'une couleur, l'arrière sombre, pour lire l'orientation de la machine d'un
coup d'œil quand elle est loin. Une livrée qui peindrait les quatre ferait joli
et se piloterait mal.

**Ce qui n'est jamais peint** : le carbone, qui a la couleur du carbone ; et le
cuivre des bobinages comme l'acier des arbres, dont la matière refuse la teinte
— elles le déclarent, ce n'est pas un oubli.

Quinze livrées, dont **Origine** qui rend au build ses teintes d'usine :

| | | | |
|---|---|---|---|
| **Bee** jaune ruche | **Red Racing** rouge course | **Spider** violet | **Shark** bleu |
| **Snake** vert clair | **Girly** rose | **Ghost** noir mat | **Steel** gris acier |
| **Tiger** orange | **White Wolf** blanc | **Copper** cuivre | **Glacier** blanc bleuté |
| **Kaki** vert militaire | **Toxic** vert fluo | **Origine** teintes d'usine | |

Une livrée **remplace** la précédente, elle ne s'ajoute pas : passer de Bee à
Ghost ne laisse pas de jaune sur les pièces que Ghost ne nomme pas. Le
classement se fait sur la **matière déclarée** par chaque pièce, pas sur une
liste d'identifiants — un support imprimé ajouté demain sera peint sans qu'on
ait à revenir dans le fichier.

Trois de ces teintes ne visent pas une pièce mais une **matière**, partout où
elle se trouve : le liseré des cloches, la visserie et le filet de chanfrein.
Elles sont rejouées au chargement — sans quoi une livrée retrouvée après
rechargement avait ses pièces peintes mais ses vis en acier et ses liserés
turquoise.

Le choix est conservé d'une session à l'autre, et se défait par **Annuler**.

## Visserie

La visserie est le seul élément qui n'a pas à être photographié : elle est
normalisée. Elle n'est donc pas dessinée à la main mais **déduite de
l'assemblage**, par le bouton *Détecter et poser* :

| Grandeur | D'où elle vient |
|----------|-----------------|
| filetage (M2, M3) | du diamètre du perçage tracé |
| longueur d'entretoise | de l'écart entre les deux plaques |
| longueur de vis | de l'épaisseur traversée, plus la longueur vissée dans l'entretoise |

Les cotes sont arrondies à la **série du commerce** (3, 4, 5, 6, 8, 10, 12…) :
proposer 9,75 mm n'aurait aucun intérêt, ça ne se commande pas. Quand
l'entretoise normalisée dépasse l'écart mesuré de plus de 0,35 mm, c'est dit.

Deux plaques au contact reçoivent une vis traversante et pas d'entretoise.

### Ce que l'outil ne peut pas savoir

Tout perçage en regard d'un autre est un point de fixation **possible** — sur
deux plaques semblables, il y en a des dizaines. L'outil ne sait pas lesquels
tu vas réellement visser : le curseur **espacement minimal** écarte les
redondants, en gardant d'abord les perçages les plus larges, ceux qui portent
la structure. C'est une hypothèse, pas une lecture : le nombre de candidats
écartés est affiché, et mettre le curseur à 0 les montre tous.

La nomenclature qui en découle est une base de commande, à confronter à ton
montage réel.

### Entretoises à la référence

L'autre sens de lecture : tu connais la référence de l'entretoise — *M2×4×22*,
soit filetage × sur-plats × longueur — mais pas encore son emplacement. Le bloc
**Entretoises à la référence** la crée à ses cotes exactes, en autant
d'exemplaires que voulu.

La pose automatique n'est tentée que si elle est **démontrable** : il faut un
couple de plaques dont l'écart vaut la longueur de l'entretoise, à 0,6 mm près.
Une entretoise ne rattrape pas un écart, elle l'impose — poser une 22 entre deux
plaques distantes de 18 serait un mensonge géométrique. Quand aucun couple ne
convient, l'écart le plus proche est affiché, et rien n'est posé.

Ce qui n'est pas posé n'est pas caché : les entretoises en attente s'alignent en
rangée à droite du build, en orange. Pour en placer une :

1. clique-la, dans la scène ou dans la liste du panneau — elle passe en bleu ;
2. clique le perçage qui doit la recevoir.

Elle s'y pose, base sur la **face supérieure** de la plaque percée, et l'entretoise
suivante du lot est sélectionnée automatiquement. Le bouton **Copier les
coordonnées** rend la liste en clair (X · Y · Z, repère châssis, Y = altitude de
la base), avec pour chacune le perçage d'appui et l'origine du placement — *auto*
ou *clic*.

Une entretoise sélectionnée détourne le clic sur perçage : il la pose au lieu
d'ouvrir une contrainte d'assemblage. Un clic dans le vide annule la sélection.

## Exporter une pièce

Deux boutons sous la rubrique **Télécharger**, sur la fiche de chaque pièce
dans le panneau de gauche :

- **⬇ STL** — la géométrie 3D, en millimètres, pièce à plat dans son propre
  repère : l'orientation attendue par un logiciel de CAO ou un trancheur, pas
  celle de l'assemblage. Le STL n'ayant pas d'unité, le millimètre est la
  convention universelle et c'est déjà celle du modèle.

  Le maillage est **contrôlé avant chaque export** : arêtes libres, arêtes mal
  orientées, volume. Le message de confirmation donne le verdict. Un maillage
  fermé mais mal orienté s'imprime de travers sans prévenir — le trancheur ne
  distingue plus le plein du vide et bouche les perçages.
- **⬇ .js pour le dépôt** — un fichier autonome à déposer dans `js/parts/`, contenant le
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
js/hardware.js             visserie déduite de l'assemblage, nomenclature
js/standoffs.js            entretoises créées à la référence, posées au clic
js/frame-spec.js           fiche technique du châssis : empattement, épaisseurs
js/lib/trace.js            binarisation, suivi de contour, simplification
js/lib/patterns.js         motifs de perçage normalisés, calage de l'échelle
js/lib/geom.js             pixels -> mm, congés, symétrie, extrusion
js/lib/materials.js        carbone sergé 2x2 généré au runtime
js/parts/01-bottom-plate.js
js/parts/09-side-guard.js  covers latéraux gauche/droit et leurs habillages
js/parts/11-moteurs.js     1804 3450 KV, dessiné cote par cote d'après les photos
js/parts/12-helices.js     3,5" tri-pales
js/parts/13-dji.js         caméra, air unit et antennes O4 Pro (STEP constructeur)
tools/protection-antenne.py  générateur du STL de protection d'antenne (TPU)
js/liveries.js             les quinze jeux de couleurs
assets/parts-3d/side-guard/  les sept habillages dérivés du side guard
assets/parts-3d/oa35-cache-vis-camera.stl  cache de vis, encastré au dos de la joue
assets/vendor/             maillages DJI, tirés des STEP du constructeur
vendor/three/              Three.js r160 (embarqué)
```
