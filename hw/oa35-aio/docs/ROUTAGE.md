# Routage : ce qui a été essayé, et ce que ça donne

La carte livrée est **placée mais non routée**. Ce document dit pourquoi, avec
les chiffres, pour que la prochaine tentative ne reparte pas de zéro.

## Les résultats

| routeur | nets connectés (sur 200) | légalité |
|---|---|---|
| freerouting 1.9 | 122 | légal |
| `finish_route.py` — A* maison, obstacles durs | 111 | **légal par construction** |
| `negotiate.py` — congestion négociée (PathFinder) | **200** | ~500 dégagements insuffisants |

GND et VBAT ne sont pas comptés : ce sont des plans, remplis par
`finish_pcb.py`, pas des nets à router.

## Ce qui a été écarté, et sur quelle mesure

**Élargir les couches de routage.** Une seule couche interne de signal ne
suffit pas : les échecs commencent au tiers de la carte. Passée à deux (In3 et
In4, GND sur In1 et VBAT sur In2), la capacité double sans rien changer au
reste. Aller à 8 couches n'a pas été retenu : un AIO de cette classe se fait en
4 ou 6 couches, et ajouter du cuivre reviendrait à payer sur chaque carte la
faiblesse du routeur.

**Réserver une via d'échappée par pastille.** L'idée est juste — les pastilles
se font emmurer par les premiers nets routés — mais la mise en œuvre coûte plus
qu'elle ne rapporte : une via traversante consomme de la place sur les six
couches, et 284 d'entre elles retirent près de 10 % de chaque couche, là
précisément où les nets longs doivent passer. Les échecs sont passés de 5 sur
les 60 premiers nets à 11 sur les 30 premiers. `fanout()` est conservé dans
`finish_route.py`, désactivé.

**Redresser les pistes.** Une recherche à huit directions sur une grille de
0,05 mm dessine les obliques en escalier ; `straighten()` remplace chaque
escalier par les plus longues droites légales. Le rendu y gagne beaucoup, le
nombre de nets raccordés **pas du tout** — l'hypothèse selon laquelle les
escaliers encombraient la carte était fausse. Le cuivre posé fait 4 015 mm pour
2 837 mm de minimum théorique, soit 1,4× : un ratio normal.

**Rattraper une carte illégale net par net.** `legalise.py` retire le cuivre
d'un net en infraction et lui cherche un tracé légal contre tout le reste. Sur
178 nets en infraction, **3** en ont un. Une fois la carte routée
illégalement, tout est mutuellement imbriqué et il est trop tard.

## Les corrections de placement que le routage a révélées

Ces défauts-là sont réparés dans la carte livrée :

- **Neuf nets géométriquement impossibles.** La pastille de grille du MOSFET
  haut regarde vers la bande entre les deux rangées, donc cette bande est le
  seul accès — et elle n'avait pas de sortie : 0,5 mm de libre, assez pour une
  piste mais pas pour une via de 0,73 mm, avec le micro d'ESC collé dessous sur
  l'autre face. Les rangées ont été écartées et le micro reculé. Les 48 nets de
  grille passent maintenant seuls, contre 39 avant.
- **MOSFET et driver montés à l'envers dans deux canaux sur quatre.** Les
  positions tournent dans le sens mathématique, `SetOrientationDegrees` de
  KiCad dans l'autre, et les deux ne coïncident que pour la moitié des repères.
  `gen_pcb.py` lit maintenant où les pastilles ont réellement atterri au lieu
  de supposer un décalage fixe.
- **Réseau de grille expulsé du canal.** Le placement automatique mettait une
  résistance de grille à 9,8 mm des deux pastilles qu'elle relie. Résistances,
  condensateurs de bootstrap et découplage du driver sont désormais placés dans
  le repère du canal, dans ses trois bandes libres.
- **Composants à cheval sur les trous de fixation.** La vérification de
  placement les ignorait ; ils traversent la carte et sont maintenant des
  obstacles sur les deux faces.

## Pistes non explorées

- Un routeur commercial (Altium, Allegro, Zuken) ou le routeur interactif de
  KiCad avec repoussement, conduit à la main.
- Un routage par canal : le bloc de puissance est identique quatre fois, un
  gabarit routé une fois et répliqué économiserait l'essentiel du travail.
- Des règles fines (0,09 mm) : environ 40 % de densité en plus, au prix d'un
  rendement de fabrication plus faible.
