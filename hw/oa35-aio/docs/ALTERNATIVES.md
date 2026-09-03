# Composants de remplacement

Les références LCSC de `tools/design.py` sont celles vérifiées au moment de la
conception. Si le vérificateur de JLCPCB en signale une en rupture, voici par
quoi la remplacer sans retoucher le circuit imprimé — le boîtier et le
brochage doivent être identiques, c'est la seule contrainte dure.

| Fonction | Référence du projet | LCSC | Remplacements possibles |
|---|---|---|---|
| MCU vol | STM32F722RET6 | C118207 | STM32F405RGT6 (même LQFP‑64, même brochage pour ce que la carte utilise ; VCAP en 2,2 µF, cible Betaflight F405). Sinon STM32F722RCT6 (moins de flash). |
| Gyroscope | ICM‑42688‑P | C1850418 | ICM‑42605 (même boîtier, même brochage, moins précis) ; BMI270 (**empreinte différente**, à redessiner). |
| Baromètre | BMP280 | C83291 | BMP388 ou DPS310 : mêmes fonctions mais **brochage LGA‑8 différent**, à revérifier avant substitution. SPL06‑001 est le moins cher mais sa fiche est à vérifier. |
| Boîte noire | W25Q128JVSIQ | C97521 | W25Q64JVSIQ (8 Mo) ou W25Q256JVEIQ (32 Mo), même SOIC‑8 208 mil. |
| Micro ESC | AT32F421G8U7 | C2765098 | AT32F421K8U7 en QFN‑32 : **empreinte différente**. Rester sur le G8U7 tant que possible : c'est la cible AM32 de référence. |
| Driver de grille | NSG2065Q | C41414478 | FD6288Q (C328453) : même QFN‑24 4 × 4, même brochage, c'est l'original que le NSG2065Q clone. EG2133 et DRV8300 sont donnés compatibles broche à broche par les concepteurs d'ESC, à confirmer sur fiche. |
| MOSFET | DOY180N03T | C49441966 | Tout N‑MOS 30 V en PowerDI3333‑8 avec R_DS(on) ≤ 3 mΩ à 10 V : SP40N03GNJ (40 V, meilleure marge à 6S), NCEP0130N, AON7534. Vérifier que le brochage est bien 1‑2‑3 source, 4 grille, 5‑8 drain. |
| Abaisseur 5 V / 9,85 V | LMR51430YFDDCR | C5219261 | LMR54406DBVR (0,6 A, suffit pour le rail de grille mais **pas** pour le BEC ; V_ref 0,8 V, donc pont à recalculer). TPS54331 en SOIC‑8 : empreinte différente. |
| LDO 3,3 V vol | LP5912‑3.3DRVR | C524780 | TLV76733DRVR (C2848334), même WSON‑6 2 × 2, déjà utilisé pour le rail ESC. |
| LDO 3,3 V ESC | TLV76733DRVR | C2848334 | LP5912‑3.3DRVR (C524780). |
| Ampli de courant | INA186A3IDCKR | C2058245 | INA186A2 (gain 50 V/V → 10 mV/A, doubler `ibata_scale`) ou INA181A3 en SOT‑23‑5 : **empreinte différente**. |
| Écrêteur d'entrée | SMF24A‑T13 | C1977154 | SMF26A / SMF28A pour du 6S exclusif ; SMF30A n'écrête qu'à ~48 V, trop haut pour des MOSFET 30 V. |
| Diodes d'aiguillage 5 V | RB161QS‑40 | C28646385 | Toute Schottky 40 V / 1 A en SOD‑882 avec chute faible. |
| Protection USB | USBLC6‑2SC6 | C7519 | PRTR5V0U2X (même SOT‑23‑6, brochage à vérifier). |
| Quartz 8 MHz | X32258MSB4SI | C2682774 | Tout 8 MHz 3225 4 pastilles, ≤ 20 ppm, C_L 12 pF (adapter C35/C36). |
| Inductance 4,7 µH | XRTC303020D4R7MBCA | C39846837 | Toute 4,7 µH en 3 × 3 mm, I_sat ≥ 3 A. |
| USB‑C | TYPE‑C‑31‑M‑12 | C165948 | Les clones de ce boîtier sont nombreux ; garder l'empreinte 16 broches HRO. |
| Connecteur VTX | SM06B‑SRSS‑TB | C160405 | Tout JST‑SH 1,0 mm 6 points coudé, même empreinte. |

## Passifs

Les résistances et condensateurs sont en 0201 pour l'essentiel (valeurs de la
conception de référence OpenESC) et en 0402/0805 là où la tension ou le
courant l'exige. N'importe quel équivalent de même boîtier, même valeur et
tenue en tension au moins égale convient :

- 0201 : 10 Ω, 15 Ω, 220 Ω, 510 Ω, 1 k, 2,4 k, 6,49 k, 10 k, 13,7 k, 100 k,
  100 nF.
- 0402 : 5,1 k (CC de l'USB), 20 pF, 100 nF 16 V (bootstrap), 1 µF, 4,7 µF.
- 0805 : 4,7 µF 50 V (bus batterie), 22 µF 25 V (sorties d'abaisseur).

Les condensateurs céramiques du bus batterie doivent être **50 V** : à 6S
pleine charge un X5R 25 V perd la moitié de sa capacité et vieillit vite.

## Condensateur électrolytique externe

Il n'est pas dans la nomenclature : il se soude par l'utilisateur sur `BAT+`
et `BAT-`, au plus court. Prévoir un 220 µF à 470 µF, 35 V minimum, faible
ESR, série « low impedance » (Panasonic FR, Nichicon HE ou équivalent). Sans
lui les pointes de commutation dépassent l'écrêteur.
