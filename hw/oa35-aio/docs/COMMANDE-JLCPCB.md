# Commander la carte chez JLCPCB

Tous les fichiers sont dans `production/`, régénérés par `./build.sh` (ou
`python3 tools/export.py` seul si la carte n'a pas changé).

| Fichier | À quoi il sert |
|---|---|
| `oa35-aio-gerber.zip` | gerbers + perçage, à déposer dans « Add gerber file » |
| `oa35-aio-bom.csv` | nomenclature, étape assemblage |
| `oa35-aio-cpl.csv` | positions et rotations, étape assemblage |
| `preview-top.svg`, `preview-bottom.svg` | contrôle visuel rapide |
| `oa35-aio-fab.pdf` | vue de fabrication imprimable |

## Options PCB

| Option | Valeur |
|---|---|
| Base Material | FR‑4 |
| Layers | **6** |
| Dimensions | 36 × 36 mm |
| PCB Thickness | 1,6 mm |
| Impedance control | non |
| Outer Copper Weight | **2 oz** si proposé, sinon 1 oz |
| Inner Copper Weight | 1 oz si proposé, sinon la valeur par défaut |
| Surface Finish | ENIG (recommandé pour les pas de 0,4 mm) ou HASL |
| Via Covering | Tented |
| Min via hole size | 0,3 mm |
| Remove Order Number | « Specify a location » ou « No » |

Le cuivre extérieur en 2 oz n'est pas indispensable au fonctionnement mais
double la section des coulées de phase, donc la tenue en courant continu.
Si l'option n'est pas disponible pour 6 couches, commandez en 1 oz et
considérez la carte comme une carte 30 A par canal plutôt que 40 A.

## Options d'assemblage

- **PCBA Type** : Economic (suffit) ou Standard.
- **Assembly Side** : **Both sides**. Le dessus porte l'étage de puissance,
  le dessous le contrôleur de vol.
- **Tooling holes** : « Added by JLCPCB ».
- Déposez `oa35-aio-bom.csv` puis `oa35-aio-cpl.csv`.

## Avant de payer — les trois contrôles qui comptent

1. **Stock des références LCSC.** Les codes de la nomenclature ont été relevés
   sur les fiches LCSC/JLCPCB, mais les stocks bougent. Le vérificateur de
   JLCPCB signale les lignes à remplacer ; les alternatives sont listées dans
   [ALTERNATIVES.md](ALTERNATIVES.md).
2. **Rotations dans l'aperçu du placement.** JLCPCB ne prend pas toujours la
   même référence d'angle que KiCad. Le tableau de correction appliqué est
   dans `tools/export.py` et ne couvre que les boîtiers de cette carte ;
   contrôlez au moins les boîtiers polarisés — MOSFET, diodes, LED,
   régulateurs, connecteur USB‑C — dans l'aperçu 3D.
3. **Pièces non montées.** Les pastilles de câblage, les trous de fixation et
   les pastilles de test ne sont pas dans la nomenclature : c'est normal, ce
   ne sont pas des composants.

## Après réception

Les cartes arrivent **vierges** : ni Betaflight ni AM32 ne sont chargés.
Voir [BETAFLIGHT.md](BETAFLIGHT.md) pour la programmation du contrôleur de vol
et des quatre ESC.

Premier essai, hélices démontées :

1. Sans batterie, brancher l'USB : la LED 3,3 V doit s'allumer, la carte doit
   énumérer en USB.
2. Vérifier au multimètre `+3V3` et `+5V` sur les pastilles.
3. Batterie 3S ou 4S, alimentation de labo limitée à 1 A : vérifier le rail de
   grille (≈ 9,85 V, mesurable sur la broche VCC d'un driver) et le 5 V.
4. Seulement ensuite, brancher les moteurs et flasher les ESC.
