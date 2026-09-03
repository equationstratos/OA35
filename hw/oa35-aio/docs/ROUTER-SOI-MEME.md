# Router la carte soi-même

La carte livrée est placée et vierge de pistes. Trois chemins, du plus simple
au plus manuel.

## 1. freerouting sur votre machine — le plus simple

`oa35-aio.dsn` est à la racine du projet, prêt à router. Il n'y a **rien à
installer d'autre que freerouting**, pas de Python, pas de KiCad en ligne de
commande.

1. Téléchargez freerouting : <https://github.com/freerouting/freerouting/releases>
   Prenez la **2.x**, nettement meilleure que la 1.9 embarquée ici — je n'ai
   pas pu la récupérer, le proxy réseau de mon environnement bloque GitHub.
2. Lancez-le, `File → Open`, choisissez `oa35-aio.dsn`.
3. Bouton **Autoroute**. Laissez tourner.
4. `File → Export Specctra Session File`, enregistrez sous
   `build/oa35-aio.ses`.
5. De retour ici : `./route.sh import`

Le DSN est déjà préparé pour ça : **GND et VBAT en ont été retirés**. Ce sont
des plans, remplis ensuite par `tools/finish_pcb.py` ; demander au routeur de
les câbler lui fait perdre l'essentiel de son temps et rate un tiers de la
carte. Les pastilles restent présentes comme obstacles, seule leur
appartenance aux nets a disparu.

Vous pouvez aussi ouvrir ce DSN dans n'importe quel routeur qui parle
Specctra, ou dans un service en ligne.

## 2. Une commande, ici

```sh
./route.sh
```

Place la carte, passe freerouting 1.9 dessus, complète avec le routeur maison,
puis affiche le bilan : segments, vias, nets encore incomplets. Aucun réglage.

À quoi s'attendre : **ça ne finit pas la carte.** freerouting 1.9 plafonne à
122 nets sur 200 et le routeur maison à 111. Les chiffres et les impasses sont
dans [ROUTAGE.md](ROUTAGE.md).

## 3. À la main dans KiCad — le plus sûr

Le routeur interactif de KiCad (mode *push and shove*, touche `x` pour poser
une piste) écarte les pistes existantes au lieu de buter dessus. C'est de loin
le meilleur outil disponible pour cette carte, au prix du temps passé.

Deux choses à savoir avant de commencer, mesurées ici :

- **L'étage de puissance est identique quatre fois.** Routez un canal
  proprement, puis copiez le bloc : KiCad sait dupliquer un groupe de pistes.
  C'est là que se trouve la moitié du travail.
- **La grille haute passe par la bande entre les deux rangées de MOSFET.** La
  pastille de grille du transistor haut regarde vers l'intérieur ; cette bande
  est son seul accès, et elle a été élargie exprès pour qu'une via y tienne.
  N'y laissez pas passer autre chose.

## Une fois routé

```sh
$PY tools/finish_pcb.py     # plans, etain de liaison, serigraphie, DRC
$PY tools/export.py         # gerbers, percage, BOM, CPL, zip
```

Le dossier `production/` est alors régénéré de bout en bout.
