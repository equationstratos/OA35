# OA35-AIO — carte tout-en-un F722 + 4 ESC AM32

Équivalent libre de l'AIO **Sub250 RedFox A3 F722** (la carte qui équipe le
**Sub250 OasisFly35**) : contrôleur de vol STM32F722 et quatre ESC AM32
indépendants sur une seule carte, entretoises **25,5 × 25,5 mm**.

**État : placée, pas encore routée.** Voir « État » plus bas et
[docs/ROUTER-SOI-MEME.md](docs/ROUTER-SOI-MEME.md).

Tout le projet est **généré depuis un seul fichier**, `tools/design.py`, qui
contient chaque composant et chaque liaison broche‑à‑net. Le schéma, le
placement, la nomenclature et le fichier de pose en découlent, donc ils ne
peuvent pas diverger entre eux.

## Caractéristiques

| | OA35-AIO | RedFox A3 (référence) |
|---|---|---|
| MCU vol | STM32F722RET6 (LQFP‑64) | STM32F722 |
| Centrale inertielle | ICM‑42688‑P (SPI1) | ICM‑42688‑P |
| Baromètre | BMP280 (I2C1) | oui |
| Boîte noire | W25Q128JVSIQ, 16 Mo (SPI3) | 16 Mo |
| ESC | 4 × AT32F421G8U7 + NSG2065Q + 6 MOSFET, **AM32** | BLHeli_32, 45 A |
| Courant par canal | non caractérisé — voir « Limites connues » | 45 A continu, 55 A crête |
| Tension d'entrée | **3S – 6S** (11,1 – 25,2 V) | 2S – 6S |
| BEC | 5 V / 2,5 A (LMR51430) | 5 V / 2,5 A |
| Mesure de courant | shunt 0,2 mΩ + INA186A3, 20 mV/A | oui |
| UART | 4 (UART1, 2, 4, 6) sur pastilles | 4 |
| Vidéo | connecteur JST‑SH 6 points pour VTX numérique | connecteur DJI 6 points |
| USB | JST‑SH 6 pts vers module Type‑C déporté | JST‑SH 5 pts vers module Type‑C déporté |
| Carte | 36 × 36 mm, 6 couches, 1,6 mm | ~33,5 × 33,5 mm |
| Fixation | 25,5 × 25,5 mm, 4 trous ⌀3,0 mm (M2 + silentblocs) | 25,5 × 25,5 mm |

### Ce qui diffère volontairement de l'original

- **36 × 36 mm au lieu de ~33,5 mm.** La densité de l'original suppose des
  passifs 0201 partout et un routage manuel très serré. 36 mm laisse la place
  de router proprement. Le motif de fixation est identique, donc la carte se
  monte sur les mêmes entretoises, mais **vérifiez le dégagement latéral de
  votre châssis** avant de commander.
- **3S minimum au lieu de 2S.** Le rail de grille est un abaisseur qui sort
  9,85 V ; il lui faut au moins ~11 V à l'entrée. À 2S il décrocherait.
- **AM32 au lieu de BLHeli_32.** BLHeli_32 est fermé et n'est plus distribué ;
  AM32 est libre et c'est la cible standard pour AT32F421.
- **Connecteur USB à six voies au lieu de cinq.** Le SM06B‑SRSS‑TB est déjà
  utilisé pour la vidéo et sa référence LCSC est vérifiée ; la version 5 voies
  n'a pas pu l'être depuis cet environnement (lcsc.com bloqué par le proxy), et
  une référence non vérifiée est une commande ratée. La voie en trop est une
  seconde masse. Le câble n'est donc pas celui d'origine.
- **Pas de puce OSD analogique.** Comme la version HD de l'OasisFly35, l'OSD
  passe par MSP DisplayPort sur l'UART du VTX numérique.

## Construire le projet

```sh
./build.sh noroute      # bibliothèque, schéma, placement — la carte livrée
./route.sh              # tenter le routage automatique
```

Il faut KiCad 7 (`kicad-cli` et le module python `pcbnew`), `java` et `xvfb`
(pour freerouting). Chaque étape est indépendante :

| Étape | Script | Produit |
|---|---|---|
| Empreintes propres au projet | `tools/gen_lib.py` | `lib/oa35.pretty/` |
| Schéma hiérarchique | `tools/gen_sch.py` | `*.kicad_sch` |
| Contrôle du netlist | `tools/check_netlist.py` | échoue si le schéma ne redonne pas `design.py` |
| Placement | `tools/gen_pcb.py` | `oa35-aio.kicad_pcb` |
| Routage | `tools/route.py` | pistes et vias |
| Cuivre plein, sérigraphie, DRC | `tools/finish_pcb.py` | zones remplies, rapport DRC |
| Fabrication | `tools/export.py` | `production/` |

Le placement est mixte : les pièces dont la position compte (MOSFET, drivers,
MCU, connecteurs, pastilles) sont posées à la main dans `tools/layout.py`,
les ~150 passifs sont placés automatiquement à côté des broches auxquelles ils
se raccordent, sur une grille d'occupation qui connaît le contour de la carte
et les trous de fixation. Une vérification refuse tout chevauchement de
pastilles et toute pièce qui sortirait de la carte.

## Ce que la construction vérifie toute seule

`./build.sh` échoue si l'une de ces conditions n'est pas tenue :

- le schéma relu par `kicad-cli` ne redonne pas exactement le netlist de
  `design.py` (composants, empreintes, codes LCSC, appartenance des nets) ;
- une empreinte sort de la carte, ou deux empreintes se recouvrent, y compris
  une pastille traversante contre une pièce de l'autre face ;
- il reste des pastilles non connectées après routage.

Le rapport DRC complet est écrit dans `build/drc.rpt`. Deux règles y sont
volontairement abaissées, parce qu'elles décrivent une convention de dessin et
non une contrainte de fabrication : le chevauchement des *courtyards* (cette
carte est plus dense que le nominal IPC, comme tous les AIO de ce format) et
la sérigraphie sur cuivre (le fabricant la détoure). Tout le reste — isolement,
perçages, largeurs, connexions — reste en erreur bloquante.

## Architecture

**Dessus (F.Cu) — étage de puissance.** Quatre blocs identiques en moulinet,
un par bord : six MOSFET DOY180N03T (30 V, PowerDI3333‑8) en trois demi‑ponts,
le driver NSG2065Q, les résistances de grille et les condensateurs de
bootstrap. Les pastilles moteur sont dans le coin vers lequel pointe le bloc.
L'entrée batterie, le shunt et les écrêteurs sont à l'arrière.

Chaque canal a exactement trois bandes libres, et tout son réseau de grille y
tient : résistances basses vers le bord, résistances hautes entre les deux
rangées de MOSFET, condensateurs de bootstrap sous le driver. L'écart entre
les rangées est dimensionné pour qu'une via y passe — c'est le seul accès à la
pastille de grille du transistor haut.

**Dessous (B.Cu) — contrôleur de vol.** Le STM32F722 au centre, la centrale
inertielle et la boîte noire à l'arrière, le baromètre à l'avant, les deux
abaisseurs à droite, le connecteur USB sur le bord avant, le connecteur VTX
sur le bord gauche, et les pastilles de câblage tout autour. Chaque micro
d'ESC est dans le repère de son propre canal, en face de sa rangée de MOSFET
mais dégagé de la bande qui leur sert de passage.

**Empilage (6 couches, 1,6 mm)**

| Couche | Rôle |
|---|---|
| F.Cu | puissance ESC, coulées de phase |
| In1.Cu | plan de masse |
| In2.Cu | plan batterie |
| In3.Cu | signaux (`SIG1`) |
| In4.Cu | signaux (`SIG2`) |
| B.Cu | contrôleur de vol, signaux, pastilles |

## Firmware

- **Contrôleur de vol** : Betaflight, cible personnalisée. Le brochage complet
  est dans [docs/BETAFLIGHT.md](docs/BETAFLIGHT.md), avec le fichier de
  configuration à coller dans la CLI.
- **ESC** : [AM32](https://github.com/am32-firmware/AM32), cible AT32F421, à
  flasher canal par canal via les pastilles SWD `TP7`…`TP14` (deux par canal,
  SWDIO et SWCLK ; la masse et le 3,3 V viennent des pastilles GND et 3V3).

## État : carte placée, non routée

`oa35-aio.kicad_pcb` contient les 281 empreintes placées et vérifiées, les six
couches, les règles (piste et dégagement 0,13 mm, via 0,45/0,25 — capacité
standard de JLCPCB) et le contour. **Il ne contient aucune piste.** Le routage
est laissé ouvert : ouvrez la carte dans KiCad, ou passez-la au routeur de
votre choix.

Ce qui est vérifié à ce stade : le schéma et la netlist concordent exactement
(281 composants, 200 nets), aucune empreinte n'en chevauche une autre, aucune
ne mord sur un trou de fixation, et chaque référence LCSC est cohérente avec
son boîtier.

**Pour router vous-même**, voir [docs/ROUTER-SOI-MEME.md](docs/ROUTER-SOI-MEME.md).
Le plus court : `oa35-aio.dsn` est fourni prêt à router — ouvrez-le dans
freerouting sur votre machine, cliquez *Autoroute*, enregistrez la session,
puis `./route.sh import`. Ou en une commande ici : `./route.sh`.

Les outils de routage écrits pour ce projet restent dans `tools/` et sont
utilisables tels quels :

| outil | ce qu'il fait |
|---|---|
| `route.py` | export Specctra DSN → freerouting → réimport des pistes |
| `finish_route.py` | routeur A* maison, obstacles durs, légal par construction |
| `negotiate.py` | routeur par congestion négociée (PathFinder) |
| `legalise.py` | rejoue les nets qui violent un dégagement |

Aucun n'a mené la carte au bout : freerouting plafonne à 122 nets sur 200, le
routeur légal à 111, et le routeur négocié connecte les 200 mais laisse
environ 500 dégagements insuffisants. Les mesures et les impasses sont
détaillées dans [docs/ROUTAGE.md](docs/ROUTAGE.md).

## Commander

Voir [docs/COMMANDE-JLCPCB.md](docs/COMMANDE-JLCPCB.md). En résumé :
`production/oa35-aio-gerber.zip` pour le PCB, `production/oa35-aio-bom.csv` et
`production/oa35-aio-cpl.csv` pour l'assemblage, 6 couches, 1,6 mm, cuivre
extérieur 2 oz si l'option est proposée.

**À vérifier avant de payer** : les références LCSC ont été relevées sur les
fiches LCSC/JLCPCB mais les stocks bougent ; passez la nomenclature dans le
vérificateur de JLCPCB et contrôlez chaque orientation dans l'aperçu du
placement. Le tableau de correction de rotation utilisé est dans
`tools/export.py` et ne couvre que les boîtiers de cette carte.

## Origine et licence

L'étage ESC (topologie AT32F421 + NSG2065Q + six MOSFET par canal, ponts
diviseurs de FCEM, bootstrap, shunt côté haut avec INA186) suit
[OpenESC‑20x20](https://github.com/OpenDrone-hw/OpenESC-20x20) d'incutec /
OpenDrone‑hw, sous **CERN‑OHL‑S‑2.0**. Ce projet est donc lui aussi publié
sous CERN‑OHL‑S‑2.0 (voir [LICENSE](LICENSE)).

## Limites connues

Ce projet est complet et cohérent, mais **aucun exemplaire n'a été fabriqué ni
testé**. Avant une série :

- Faire un prototype et le caractériser (échauffement, courant continu réel).
- L'empreinte de l'ICM‑42688‑P est reprise d'une carte en production ; celle
  du NSG2065Q est construite d'après le boîtier QFN‑24 4 × 4 mm à pas 0,5 mm.
  Les recouper avec les fiches techniques.
- L'écrêteur SMF24A (24 V) est celui de la conception de référence ; à 6S
  pleine charge (25,2 V) il travaille juste au-dessus de sa tension de veille.
  Pour du 6S exclusif, préférer un SMF26A ou SMF28A.
- **Aucun courant continu n'est annoncé, et c'est volontaire.** Les MOSFET
  DOY180N03T (30 V) et le shunt de pleine échelle 165 A donnent une borne
  haute théorique, mais la limite réelle est thermique et dépend du cuivre
  extérieur commandé (1 oz ou 2 oz) et du flux d'air. La conception de
  référence dont vient l'étage de puissance est donnée pour 30 A par canal
  sur un format plus petit ; considérez cette carte comme du même ordre tant
  qu'un prototype n'a pas été instrumenté.
