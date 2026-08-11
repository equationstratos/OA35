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
| **Chanfrein** | caractéristique de la pièce. Seules celles qui le déclarent en portent un — aujourd'hui les deux joues caméra. **Il reste visible quand la case est décochée.** |

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
assets/parts-3d/side-guard/  les sept habillages dérivés du side guard
assets/parts-3d/oa35-cache-vis-camera.stl  cache de vis, encastré au dos de la joue
vendor/three/              Three.js r160 (embarqué)
```
