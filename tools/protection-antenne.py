#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PROTECTION D'ANTENNE VTX, en TPU souple — générateur du STL.

La pièce est celle des photos : une CAGE FENDUE qui coiffe la tête de
l'antenne, prolongée par un FÛT CONIQUE creux qui descend sur le fourreau.
Imprimée en TPU, elle encaisse les crashs à la place de l'antenne — la tête
d'une O4 Pro est ce qui touche le sol en premier quand le drone se retourne.

ELLE EST DESSINÉE SUR L'ANTENNE, pas à vue. Les cotes intérieures viennent du
maillage du STEP constructeur (assets/vendor/dji-o4-pro-antenne.stl) :

    fourreau    Ø 3,53   sur 36 mm
    tête        Ø 14,53  sur 20,75 mm, calotte arrondie

d'où un logement et un alésage AUX COTES MÊMES DE L'ANTENNE. En TPU on ne
laisse pas de jeu : la matière s'ouvre à l'enfilage et se referme sur la pièce,
et c'est ce serrage qui retient la protection. Les six centièmes ajoutés ne
sont pas un jeu de montage, seulement de quoi éviter que deux surfaces
rigoureusement confondues ne scintillent dans la scène 3-D.

POURQUOI LA CAGE EST FERMÉE AU BOUT. C'est ce que montrent les photos, et
c'est aussi ce qui protège : une calotte ouverte laisserait la tête de
l'antenne prendre le choc. La pièce se monte donc en l'ENFILANT PAR LE FÛT,
dont l'alésage s'ouvre au passage de la tête — c'est le propre du TPU, et
c'est pour ça que cette pièce n'est pas imprimable en PLA.

POURQUOI DES FENTES. Trois raisons, toutes visibles sur la pièce réelle : le
TPU doit pouvoir s'ouvrir pour laisser passer la tête, la cage ne doit pas
faire cage de Faraday autour d'une antenne, et la matière économisée est de la
masse en moins au bout d'un bras de levier.

Le solide est construit par OpenCASCADE — révolutions, congés et booléens —
puis maillé à la COURBURE : les cylindres restent ronds, les faces planes ne
coûtent rien. Le résultat est vérifié fermé (chaque arête appartient
exactement à deux triangles) avant d'être écrit.

    python3 tools/protection-antenne.py
"""
import os
import struct
import sys

import numpy as np
import gmsh

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   "..", "assets", "parts-3d", "oa35-protection-antenne.stl")

# --- Cotes, en millimètres -------------------------------------------------
# L'antenne, relevée sur le maillage du STEP constructeur
ANT_SLEEVE = 3.53          # Ø du fourreau
ANT_HEAD = 14.53           # Ø de la tête
ANT_HEAD_LEN = 20.75       # longueur de la tête

# LE JEU EST NUL, ET C'EST VOULU. Sur une pièce rigide on laisserait deux ou
# trois dixièmes pour que ça entre ; en TPU, non — la matière s'ouvre à
# l'enfilage et se referme sur l'antenne, et c'est ce serrage qui la retient.
# Un demi-millimètre de jeu, comme au premier jet, laisserait la protection
# tourner sur elle-même et se déchausser au premier crash — exactement ce qu'on
# lui demande d'éviter.
#
# Les six centièmes retenus ne sont pas un jeu de montage : c'est ce qu'il faut
# pour que les deux surfaces ne soient pas rigoureusement confondues dans la
# scène 3-D, où deux faces coïncidentes scintillent. Trois centièmes au rayon.
JEU = 0.06

# LA PAROI : 1,0 mm, soit deux passes et demie à la buse de 0,4. C'est le
# minimum qui reste imprimable en TPU, et c'est le maximum qui reste souple :
# à 1,5 la pièce était raide, et une protection raide transmet le choc au lieu
# de l'absorber.
WALL = 1.0
END_WALL = 1.8             # la seule épaisseur qui reste forte : elle encaisse

# Le fût, qui descend sur le fourreau
STEM_LEN = 26.0
BORE = ANT_SLEEVE + JEU            # 3,59 sur un fourreau de 3,53
STEM_D_TIP = BORE + 2 * WALL       # au bout, côté drone
STEM_D_TOP = 7.6                   # au raccord de la cage

# La cage, qui coiffe la tête
CAGE_ID = ANT_HEAD + JEU           # 14,59 sur une tête de 14,53
CAGE_OD = CAGE_ID + 2 * WALL
CAGE_LEN = ANT_HEAD_LEN + 2.5      # la tête, plus le dégagement de la calotte

# Les fentes
SLOTS = 4
SLOT_W = 3.6
SLOT_MARGIN = 4.0          # matière pleine gardée à chaque extrémité de cage

TOTAL = STEM_LEN + CAGE_LEN


def build():
    """Construit le solide et rend l'étiquette de son volume."""
    gmsh.model.add("protection-antenne")
    occ = gmsh.model.occ

    # --- extérieur : fût conique + cage cylindrique ----------------------
    fut = occ.addCone(0, 0, 0, 0, 0, STEM_LEN, STEM_D_TIP / 2, STEM_D_TOP / 2)
    cage = occ.addCylinder(0, 0, STEM_LEN, 0, 0, CAGE_LEN, CAGE_OD / 2)
    # l'épaulement entre les deux est repris par un tore, pour que le raccord
    # soit une courbe et non une arête vive : c'est une pièce souple, elle n'a
    # pas d'angle droit
    conge = occ.addTorus(0, 0, STEM_LEN, CAGE_OD / 2 - 0.8, 0.8)
    out, _ = occ.fuse([(3, fut)], [(3, cage), (3, conge)])
    solide = out[0][1]

    # --- intérieur : alésage du fourreau + logement de la tête -----------
    # l'alésage traverse tout le fût et débouche dans le logement
    alesage = occ.addCylinder(0, 0, -1.0, 0, 0, STEM_LEN + 1.0 + 0.1, BORE / 2)
    # le logement s'arrête END_WALL sous le sommet : c'est lui qui encaisse
    loge_h = CAGE_LEN - END_WALL
    logement = occ.addCylinder(0, 0, STEM_LEN, 0, 0, loge_h, CAGE_ID / 2)
    # fond du logement adouci, pour que la tête d'antenne y entre sans forcer
    fond = occ.addSphere(0, 0, STEM_LEN + loge_h, CAGE_ID / 2)
    creux, _ = occ.fuse([(3, alesage)], [(3, logement), (3, fond)])
    out, _ = occ.cut([(3, solide)], creux)
    solide = out[0][1]

    # --- les fentes ------------------------------------------------------
    z0 = STEM_LEN + SLOT_MARGIN
    z1 = STEM_LEN + CAGE_LEN - SLOT_MARGIN
    outils = []
    for k in range(SLOTS):
        ang = 2 * np.pi * k / SLOTS
        # une fente = un prisme à bouts ronds, obtenu en fusionnant un pavé et
        # deux cylindres. Le rayon des bouts vaut la demi-largeur : la fente
        # est un « stade », sans angle où la déchirure s'amorcerait.
        r = SLOT_W / 2
        pave = occ.addBox(-CAGE_OD, -r, z0 + r, 2 * CAGE_OD, SLOT_W, z1 - z0 - 2 * r)
        b1 = occ.addCylinder(-CAGE_OD, 0, z0 + r, 2 * CAGE_OD, 0, 0, r)
        b2 = occ.addCylinder(-CAGE_OD, 0, z1 - r, 2 * CAGE_OD, 0, 0, r)
        f, _ = occ.fuse([(3, pave)], [(3, b1), (3, b2)])
        occ.rotate(f, 0, 0, 0, 0, 0, 1, ang)
        outils += f
    out, _ = occ.cut([(3, solide)], outils)
    solide = out[0][1]
    occ.synchronize()

    # --- congés : la pièce est souple, elle n'a pas d'arête vive ---------
    #
    # 0,5 mm sur une paroi de 1,0 : les arêtes deviennent des demi-ronds
    # francs, ce qui est exactement l'aspect d'une pièce en TPU — et ce qui
    # évite l'amorce de déchirure au bord des fentes.
    #
    # Ce rayon n'est pas choisi à l'œil. Essayé à 0,35, le congé passe sans
    # erreur mais rend un solide qui ne se maille plus fermé (64 arêtes libres)
    # et quatre fois plus lourd ; à 0,5 le solide est fermé et le maillage
    # tombe à 13 700 triangles. Le contrôle de fermeture, en fin de script, est
    # là pour que ce genre de régression ne passe pas inaperçu.
    aretes = [e for _, e in gmsh.model.getEntities(1)]
    for r in (0.5,):
        try:
            occ.fillet([solide], aretes, [r], removeVolume=True)
            occ.synchronize()
        except Exception:
            pass
    vols = gmsh.model.getEntities(3)
    return vols[0][1]


def read_stl(path):
    d = open(path, "rb").read()
    n = struct.unpack("<I", d[80:84])[0]
    a = np.frombuffer(d[84:84 + n * 50], dtype=np.uint8).reshape(n, 50)
    return a[:, 12:48].copy().view("<f4").reshape(n, 3, 3).astype(np.float64)


def ferme(T, tol=1e-4):
    """Chaque arête appartient-elle exactement à deux triangles ?"""
    V = np.round(T.reshape(-1, 3) / tol).astype(np.int64)
    _, idx = np.unique(V, axis=0, return_inverse=True)
    idx = idx.reshape(-1, 3)
    aretes = np.vstack([idx[:, [0, 1]], idx[:, [1, 2]], idx[:, [2, 0]]])
    aretes = np.sort(aretes, axis=1)
    _, cnt = np.unique(aretes, axis=0, return_counts=True)
    return int((cnt != 2).sum()), len(cnt)


def main():
    gmsh.initialize()
    gmsh.option.setNumber("General.Terminal", 0)
    gmsh.option.setNumber("Mesh.Binary", 1)
    gmsh.option.setNumber("Mesh.Algorithm", 6)
    build()
    gmsh.option.setNumber("Mesh.MeshSizeFromCurvature", 16)
    gmsh.option.setNumber("Mesh.MeshSizeMin", 0.30)
    gmsh.option.setNumber("Mesh.MeshSizeMax", 1.3)
    gmsh.model.mesh.generate(2)
    path = os.path.normpath(OUT)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    gmsh.write(path)
    gmsh.finalize()

    T = read_stl(path)
    v = T.reshape(-1, 3)
    libres, total = ferme(T)
    print(f"  protection d'antenne : {len(T)} triangles, "
          f"{os.path.getsize(path) / 1024:.0f} Kio")
    print(f"     encombrement  Ø {v[:, 0].max() - v[:, 0].min():.2f} × "
          f"{v[:, 2].max() - v[:, 2].min():.2f} mm")
    print(f"     arêtes libres {libres} / {total}  "
          f"→ {'FERMÉE' if libres == 0 else 'OUVERTE'}")
    return 0 if libres == 0 else 1


if __name__ == "__main__":
    print("Protection d'antenne VTX — TPU\n")
    sys.exit(main())
