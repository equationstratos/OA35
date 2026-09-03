# OA35-AIO — description du circuit

Tout ce qui suit est extrait de `tools/design.py`, qui est la seule source de
vérité du projet. Les valeurs citées y sont donc littéralement celles du
schéma et du circuit imprimé.

## Arbre d'alimentation

```
BAT+ ──┬── écrêteurs D1, D2 (SMF24A, 24 V)
       └── shunt RS1 0,2 mΩ ── VBAT ─┬── drains des 24 MOSFET (plan In2.Cu)
                                     ├── abaisseur U2 → +10 V (9,85 V réels)
                                     ├── abaisseur U3 → +5 V (4,98 V réels)
                                     ├── pont 100 k / 10 k → ADC batterie
                                     └── broche 2 du connecteur VTX
+10 V ─┬── VCC des quatre drivers NSG2065Q
       └── LDO U5 (TLV767) → +3V3E ── les quatre micros d'ESC
+5 V ──┬── pastilles 5 V, connecteur VTX, ruban de LED
       └── LDO U4 (LP5912) → +3V3 ── STM32F722, gyro, baro, flash, INA186
USB VBUS ── D4 ──┘   (le BEC gagne par D3 dès qu'une batterie est branchée)
```

Les deux abaisseurs sont des LMR51430YFDDCR (36 V d'entrée, 3 A), référence
de tension 0,6 V :

| Rail | Pont | Sortie théorique |
|---|---|---|
| grille | R2 = 100 k, R3 = 6,49 k | 0,6 × (1 + 100/6,49) = **9,85 V** |
| BEC | R4 = 100 k, R5 = 13,7 k | 0,6 × (1 + 100/13,7) = **4,98 V** |

Le 5 V du BEC est un peu au‑dessus du VBUS de l'USB, donc l'aiguillage par
diodes Schottky (D3, D4) donne toujours la priorité à la batterie. Sur USB
seul, le rail 5 V monte à environ 4,7 V, assez pour configurer un récepteur
sur l'établi.

Le rail de grille impose le **3S minimum** : il faut environ 11 V à l'entrée
pour que l'abaisseur tienne 9,85 V en sortie.

## Mesure de courant

Shunt RS1 de 0,2 mΩ en 2512 dans le fil `BAT+`, avant les drains, donc la
mesure inclut les moteurs et le BEC. L'INA186A3 (gain 100 V/V) donne
**20 mV/A**, soit 165 A de pleine échelle sur l'ADC 3,3 V. Un filtre R1 = 1 k
avec C7 = 100 nF (constante de temps 100 µs) attaque `PC2`.

Le boîtier DCK (SC70‑6) est câblé 1 = REF, 2 = GND, 3 = VS, 4 = IN+,
5 = IN−, 6 = OUT ; en mesure côté haut, IN+ va du côté batterie du shunt et
IN− du côté charge. **La conception de référence OpenESC câble ces deux
entrées dans l'autre sens** ; c'est corrigé ici, et c'est le point à
recontrôler sur la fiche technique avant de lancer une série, parce qu'une
inversion donne une lecture de courant nulle et rien d'autre.

## Un canal d'ESC

Chaque canal est autonome : son micro, son driver, ses six MOSFET. C'est la
topologie AM32 « un micro par canal ».

| Élément | Détail |
|---|---|
| Micro | AT32F421G8U7, QFN‑28, horloge interne, pas de quartz |
| Driver | NSG2065Q, QFN‑24, VCC 5 – 20 V, diodes de bootstrap intégrées |
| Puissance | 6 × DOY180N03T, 30 V, PowerDI3333‑8, trois demi‑ponts |
| Grilles | 15 Ω en série (RGAH…RGCL) |
| Bootstrap | 100 nF 16 V entre chaque phase et sa broche VB |
| Signal | DShot depuis le contrôleur de vol, 220 Ω en série vers PB4 |
| Reset | 10 k au 3,3 V et 100 nF à la masse |
| BOOT0 | 10 k à la masse |
| VDDA | 10 Ω depuis le 3,3 V, 100 nF de découplage |

**Détection de la force contre‑électromotrice.** Pour chaque phase : 10 kΩ
depuis la phase vers le nœud de mesure, 1 kΩ de ce nœud à la masse, et 10 kΩ
du nœud vers le point milieu virtuel commun aux trois phases. Rapport de
division ≈ 1/11, donc 25,2 V de bus donnent 2,29 V sur l'entrée du
comparateur, dans la plage du micro.

Les quatre canaux se partagent le rail de grille, le 3,3 V d'ESC et la masse.
La télémétrie remonte par DShot bidirectionnel : il n'y a pas de fil de
télémétrie, exactement comme sur la conception de référence.

## Contrôleur de vol

STM32F722RET6 en LQFP‑64, quartz 8 MHz (obligatoire pour l'USB sur F7),
condensateur VCAP de 4,7 µF, découplage 100 nF par paire VDD, filtre 10 Ω +
1 µF + 100 nF sur VDDA.

| Périphérique | Bus | Détail |
|---|---|---|
| ICM‑42688‑P | SPI1 | CS PA4, INT PC4, tirage 10 k sur CS |
| W25Q128JVSIQ | SPI3 | CS PA15, tirage 10 k, 16 Mo de boîte noire |
| BMP280 | I2C1 | CSB au 3,3 V (mode I2C), SDO à la masse (adresse 0x76), tirages 2,4 k |
| USB‑C | — | 2 × 5,1 k sur CC, USBLC6‑2SC6 sur D+/D− |
| Buzzer | PC13 | 2N7002, 220 Ω de grille, 100 k de rappel |
| Ruban de LED | PA8 | 220 Ω en série vers la pastille `LED` |

Le brochage complet est dans [BETAFLIGHT.md](BETAFLIGHT.md).

## Implantation

Le dessus porte les quatre blocs de puissance disposés en moulinet, un par
bord de carte, chacun pointant vers le coin de son moteur. Le bloc contient,
du bord vers le centre : la rangée de MOSFET côté bas, la rangée côté haut
(drains tournés vers le plan batterie), les résistances de grille, les
condensateurs de bootstrap, puis le driver. Les quatre drivers se retrouvent
donc en moulinet autour du centre.

Le dessous porte le contrôleur de vol au centre et, chacun juste en face de la
rangée de MOSFET de son propre canal, les quatre micros d'ESC : les quelque
soixante liaisons micro ↔ driver ↔ étage de puissance restent ainsi dans un
seul quadrant au lieu de traverser la carte.

Les deux connecteurs se partagent les bords restants selon ce qu'ils coûtent à
l'autre face. Les pastilles VTX sont purement CMS, donc elles occupent le bord
gauche sans gêner l'étage de puissance du canal 4 qui se trouve juste au‑dessus
d'elles ; l'USB‑C, dont les ergots de coque sont traversants, part sur le bord
avant où il ne prive personne de cuivre. Les deux abaisseurs sont à droite,
entre le microcontrôleur et le bord, et les pastilles de câblage sur les
quatre bords.

Les quatre trous de fixation (25,5 × 25,5 mm, Ø 3 mm) traversent la carte :
`gen_pcb.py` les traite comme des obstacles sur les deux faces, ce qui est la
seule façon d'éviter qu'un composant se retrouve à cheval sur un trou.

Six couches : cuivre extérieur pour la puissance et les signaux, deux plans de
masse pleins (In1, In3) qui encadrent le plan batterie (In2), et In4 en couche
de signaux pour le contrôleur de vol.

## Ce qui reste à valider sur du matériel

- Échauffement des MOSFET à courant continu réel : c'est ce qui fixe la
  vraie limite, pas le calibre du shunt ni celui des transistors.
- Ondulation du rail de grille pendant les commutations, avec et sans le
  condensateur électrolytique externe.
- Bruit sur le gyroscope : la centrale est sur la face opposée à l'étage de
  puissance mais la carte est petite.
- Précision de la mesure de courant : l'INA186 mesure aux bornes d'un shunt
  parcouru par des pointes de commutation ; le filtre 1 k / 100 nF peut
  demander à être renforcé.
