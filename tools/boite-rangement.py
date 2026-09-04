"""BOÎTE DE RANGEMENT — la coque commune au drone et au jet boat.

Une seule coque, deux boîtes. Le dessin est repris de `tools/rugged_box.py` du
dépôt JETBOAT (boîte à charnière et loquets, dérivée du STEP « Rugged Box
Parametric V2 ») : mêmes parois, même charnière, mêmes loquets, mêmes patins de
gerbage. Ce qui change d'une boîte à l'autre, c'est l'AMÉNAGEMENT INTÉRIEUR, et
lui seul — c'est ce qui garantit qu'elles s'empilent.

    intérieur   238,0 × 150,0 × 40,0     (bac)
                        + 22,0            (couvercle)
    hors tout   242,8 × 154,8 × 68,0     plan de joint à 43,0
    avec nervures et charnière   246,8 × 172 environ

POURQUOI 150 ET NON 134. La boîte du jet boat mesurait 134 à l'intérieur, ce
qui suffit largement au bateau (80,8 de large). Le drone, lui, demande 141,8 —
l'enveloppe convexe du modèle assemblé vu de dessus, hélices et antennes ôtées,
relevée sur ses deux millions de sommets : 163,1 x 141,8 mm.

Et il ne rentre à AUCUN angle. Sa silhouette est une croix, ce qui laissait
espérer qu'en biais les moteurs se logeraient dans les coins ; le balayage sur
360 quarts de degré dit le contraire — l'orientation la plus compacte est
justement celle à 0°, et elle demande 141,8. Élargir la coque des DEUX boîtes
était donc le seul moyen de tenir la contrainte « même taille, donc
gerbables ». Le bateau n'y perd rien : il y gagne seize millimètres.

Repère : X = longueur, Y = largeur, Z = hauteur ; boîte centrée en X et Y,
Z = 0 au plan de pose. Les deux pièces sont dans leur position d'impression
(bac ouverture en haut, couvercle retourné).

    python3 tools/boite-rangement.py                      # la coque nue
    python3 tools/boite-rangement.py --amenagement drone  # quand il y en aura un
"""
import os
import sys

import numpy as np
import trimesh

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, 'assets', 'boite')

# ------------------------------------------------------------------ cotes
# Relevées sur le STEP d'origine (128,5 × 92,5 × 35,8) et conservées telles
# quelles, pour que les loquets imprimés du modèle d'origine restent
# compatibles avec les deux boîtes.
WALL, FLOOR = 2.4, 3.0
R_OUT = 7.4                          # congé extérieur du donneur
CHAMF, CHAMF_H = 2.9, 4.0            # chanfrein de pied
LIP, LIP_A, LIP_B = 1.86, 4.4, 2.4   # lèchefrite sous le plan de joint
GRV_I, GRV_O, GRV_D = -1.17, 0.63, 4.45   # rainure de joint
TNG_I, TNG_O, TNG_H = -0.94, 0.40, 3.4    # languette du couvercle
GASKET_T = 1.4

# LA COTE COMMUNE. C'est elle, et elle seule, qui rend les boîtes gerbables :
# la changer d'un côté sans l'autre casse l'empilage.
IN_L, IN_W = 238.0, 150.0
OUT_L, OUT_W = IN_L + 2 * WALL, IN_W + 2 * WALL
BASE_CAV = 40.0                      # profondeur utile du bac
ZR = FLOOR + BASE_CAV                # plan de joint du bac
LID_TOP = 3.0
LID_CAV = 22.0
LID_H = LID_TOP + LID_CAV            # plan de joint du couvercle

# charnière / loquets — inchangés, ce sont les cotes des pièces du commerce
HG_BORE, HG_Y, KNUCK = 3.4, 5.5, 6.2
LT_BORE, LT_Y, LT_Z = 3.3, 4.36, 7.9
LT_POST, LT_GAP, LT_OUT = 3.2, 23.6, 8.86
LK_Y, LK_OUT, LK_W = 4.74, 8.14, 17.4
LATCH_X = (-60.0, 60.0)

# nervures et patins, tracés sur la nouvelle largeur
RIB_X = np.arange(-100, 101, 25.0)
RIB_Y = np.arange(-60, 61, 30.0)
PADS = ((-90, -55), (90, -55), (-90, 55), (90, 55))
PAD_R, PAD_H = 10.0, 2.4


# ----------------------------------------------------- contour et normales
def outline(l, w, r, n_arc=16):
    """Rectangle à coins arrondis : centres d'arc + normales sortantes.

    Le contour décalé de `off` vaut centre + (r + off) × normale — exact pour
    un convexe, et le nombre de points ne change pas avec l'offset. C'est ce
    qui permet de lofter la paroi, la lèchefrite et la rainure d'un seul
    contour, sans jamais recalculer d'offset polygonal.
    """
    cx, cy = l / 2 - r, w / 2 - r
    cen = [(cx, cy), (-cx, cy), (-cx, -cy), (cx, -cy)]
    P, N = [], []
    for k, c in enumerate(cen):
        for i in range(n_arc + 1):
            a = 0.5 * np.pi * (k + i / n_arc)
            P.append(c)
            N.append((np.cos(a), np.sin(a)))
    P, N = np.array(P, float), np.array(N, float)
    keep = ~(np.all(np.isclose(P, np.roll(P, 1, 0)), 1)
             & np.all(np.isclose(N, np.roll(N, 1, 0)), 1))
    return P[keep], N[keep], r


BASE_P, BASE_N, BASE_R = outline(OUT_L, OUT_W, R_OUT)


def ring(off):
    return BASE_P + BASE_N * (BASE_R + off)


def loft(levels, cap=True):
    """Solide engendré par le contour, décalé de `off` à la hauteur `z`."""
    rings = [np.c_[ring(o), np.full(len(BASE_P), z)] for z, o in levels]
    n, m = len(BASE_P), len(rings)
    V = np.vstack(rings)
    F = []
    for j in range(m - 1):
        a, b = j * n, (j + 1) * n
        for i in range(n):
            i2 = (i + 1) % n
            F += [[a + i, a + i2, b + i2], [a + i, b + i2, b + i]]
    if cap:
        for j, sgn in ((0, -1), (m - 1, 1)):
            c = len(V)
            V = np.vstack([V, [0, 0, levels[j][0]]])
            for i in range(n):
                i2 = (i + 1) % n
                F.append([c, j * n + i2, j * n + i][::sgn])
    M = trimesh.Trimesh(V, np.array(F), process=True)
    M.fix_normals()
    return M


def prism(off, z0, z1):
    return loft([(z0, off), (z1, off)])


def blk(x0, y0, z0, l, w, h):
    m = trimesh.creation.box((l, w, h))
    m.apply_translation((x0 + l / 2, y0 + w / 2, z0 + h / 2))
    return m


def rod(d, length, centre, axis='x'):
    m = trimesh.creation.cylinder(radius=d / 2, height=length, sections=32)
    if axis == 'x':
        m.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, (0, 1, 0)))
    m.apply_translation(centre)
    return m


# ------------------------------------------------------ profils du donneur
def base_profile():
    return [(0.0, -CHAMF), (CHAMF_H, 0.0), (ZR - LIP_A, 0.0),
            (ZR - LIP_B, LIP), (ZR, LIP)]


def lid_profile():
    return [(0.0, -CHAMF), (CHAMF_H, 0.0), (LID_H - LIP_A, 0.0),
            (LID_H - LIP_B, LIP), (LID_H, LIP)]


def groove_cut():
    """Anneau plein entre les deux offsets de la rainure de joint."""
    outer = prism(GRV_O, ZR - GRV_D, ZR + 1)
    inner = prism(GRV_I, ZR - GRV_D - 1, ZR + 2)
    return outer.difference(inner)


def tongue():
    outer = prism(TNG_O, LID_H - 1, LID_H + TNG_H)
    inner = prism(TNG_I, LID_H - 2, LID_H + TNG_H + 1)
    return outer.difference(inner)


# --------------------------------------------------- charnière et loquets
def hinge_x(base=True):
    """Positions des nœuds.

    Le motif est symétrique en X pour que le couvercle, qui se retourne autour
    de l'axe Y, retombe exactement dans les créneaux du bac : nœuds du bac aux
    demi-pas, nœuds du couvercle aux pas entiers.
    """
    step, N = 2 * KNUCK, 8
    cs = ([(k + 0.5) * step for k in range(-N, N)] if base
          else [k * step for k in range(-N, N + 1)])
    return [(c - KNUCK / 2 + 0.2, c + KNUCK / 2 - 0.2) for c in cs]


def hinge_knuckles(base, z_rim):
    y0 = OUT_W / 2 - WALL                    # face intérieure de la paroi arrière
    parts = []
    for a, b in hinge_x(base):
        k = blk(a, y0, z_rim - KNUCK / 2 - 1, b - a, HG_Y + WALL + KNUCK / 2, KNUCK + 2)
        cyl = rod(2 * (HG_Y + KNUCK / 2), b - a + 1,
                  ((a + b) / 2, OUT_W / 2 + HG_Y, z_rim))
        k = k.intersection(cyl.union(blk(a - .5, y0, z_rim - KNUCK / 2 - 1,
                                         b - a + 1, HG_Y + WALL, KNUCK + 2)))
        parts.append(k)
    m = trimesh.boolean.union(parts)
    # Au-delà du plan de joint, les nœuds doivent rester en dehors du nu de la
    # lèchefrite : c'est là que descend la paroi de la pièce d'en face.
    m = m.difference(prism(LIP + 0.35, z_rim, z_rim + 12))
    return m.difference(rod(HG_BORE, OUT_L, (0, OUT_W / 2 + HG_Y, z_rim)))


def latch_posts(lx, z_rim):
    """Deux montants ajourés, gousset à 45°, alésage d'axe."""
    parts = []
    for sx in (-1, 1):
        x0 = lx + sx * (LT_GAP / 2) + (0 if sx > 0 else -LT_POST)
        col = blk(x0, OUT_W / -2, z_rim - 15.4, LT_POST, LT_OUT + WALL, 15.4)
        col.apply_translation((0, -LT_OUT, 0))
        w = trimesh.creation.box((LT_POST + 2, 40, 40))
        w.apply_transform(trimesh.transformations.rotation_matrix(np.deg2rad(45), (1, 0, 0)))
        w.apply_translation((x0 + LT_POST / 2, -OUT_W / 2 - LT_OUT - 20 * 0.7071, z_rim - 15.4))
        col = col.difference(w)
        col = col.union(blk(x0, -OUT_W / 2 - LT_OUT, CHAMF_H, LT_POST, LT_OUT + WALL,
                            z_rim - 15.4 - CHAMF_H).difference(w))
        parts.append(col)
    m = trimesh.boolean.union(parts)
    bore = rod(LT_BORE, LT_GAP + 4 * LT_POST, (lx, -OUT_W / 2 - LT_Y, z_rim - LT_Z))
    return m.difference(bore)


def latch_catch(lx, z_rim):
    """Gâche du couvercle : bossage ajouré, alésage au niveau du plan de joint."""
    y0 = -OUT_W / 2 - LK_OUT
    b = blk(lx - LK_W / 2, y0, z_rim - 4.0, LK_W, LK_OUT + WALL, 8.0)
    w = trimesh.creation.box((LK_W + 2, 40, 40))
    w.apply_transform(trimesh.transformations.rotation_matrix(np.deg2rad(45), (1, 0, 0)))
    w.apply_translation((lx, -OUT_W / 2 - LK_OUT - 20 * 0.7071, z_rim - 4.0))
    b = b.union(blk(lx - LK_W / 2, y0, CHAMF_H, LK_W, LK_OUT + WALL,
                    z_rim - 4.0 - CHAMF_H).difference(w))
    b = b.difference(prism(LIP + 0.35, z_rim, z_rim + 12))
    return b.difference(rod(LT_BORE, LK_W + 4, (lx, -OUT_W / 2 - LK_Y, z_rim)))


def ribs(z_top):
    """Nervures verticales extérieures, identiques sur le bac et le couvercle."""
    parts = []
    for x in RIB_X:
        for sy in (-1, 1):
            parts.append(blk(x - 5, sy * (OUT_W / 2 - 1) - (0 if sy > 0 else 3.0),
                             CHAMF_H, 10, 3.0, z_top - LIP_A - CHAMF_H))
    for y in RIB_Y:
        for sx in (-1, 1):
            parts.append(blk(sx * (OUT_L / 2 - 1) - (0 if sx > 0 else 3.0), y - 5,
                             CHAMF_H, 3.0, 10, z_top - LIP_A - CHAMF_H))
    return trimesh.boolean.union(parts)


# --------------------------------------------------- aménagement intérieur
#
# LE SEUL ENDROIT OÙ LES DEUX BOÎTES DIFFÈRENT.
#
# Pour l'instant, aucune : les deux sont livrées nues, et c'est voulu — un
# cloisonnement se dessine sur ce qu'on range vraiment, pas sur ce qu'on
# imagine ranger. Les deux crochets ci-dessous sont là pour que l'ajout se
# fasse à un seul endroit, sans toucher à la coque.
#
# Ce que le bac doit pouvoir accueillir, mesuré et non supposé :
#   drone   163,1 × 141,8 × 48,5   hélices et antennes ôtées
#   bateau  230,5 ×  80,8 × 50,5   tuyère et stator montés
#
# `tools/apercu-boite.html` montre la silhouette du drone posée au fond du bac.

def amenagement_drone(m):
    return m


def amenagement_bateau(m):
    return m


AMENAGEMENTS = {'drone': amenagement_drone, 'bateau': amenagement_bateau}

# Tant que les deux aménagements sont vides, les deux boîtes sont le MÊME
# objet, au bit près — et le dépôt n'a aucune raison de porter deux fois le
# même fichier. On écrit donc une coque nue, `boite-bac.STL`, valable pour les
# deux ; le jour où un cloisonnement est dessiné, `--amenagement drone` sort
# `boite-drone-bac.STL` et les deux jeux se séparent d'eux-mêmes.


# ------------------------------------------------------------------ le bac
def make_base(variante):
    m = loft(base_profile())
    m = m.difference(prism(-WALL, FLOOR, ZR + 2))          # cavité
    if variante:
        m = AMENAGEMENTS[variante](m)
    m = m.union(ribs(ZR))
    m = m.union(hinge_knuckles(base=True, z_rim=ZR))
    for lx in LATCH_X:
        m = m.union(latch_posts(lx, ZR))
    # Patins de gerbage : c'est par eux que la boîte du dessus se cale. Ils
    # remontent de 1 mm DANS le fond au lieu de l'affleurer — deux solides qui
    # se touchent sans se recouvrir laissent une face double, et le booléen en
    # sort des éclats à volume nul.
    for cx, cy in PADS:
        p = trimesh.creation.cylinder(radius=PAD_R, height=PAD_H + 1.0, sections=32)
        p.apply_translation((cx, cy, -PAD_H + (PAD_H + 1.0) / 2))
        m = m.union(p)
    return m.difference(groove_cut())


# ----------------------------------------------------------- le couvercle
def make_lid(variante):
    m = loft(lid_profile())
    m = m.difference(prism(-WALL, LID_TOP, LID_H + 2))
    m = m.union(tongue())
    m = m.union(ribs(LID_H))
    m = m.union(hinge_knuckles(base=False, z_rim=LID_H))
    for lx in LATCH_X:
        m = m.union(latch_catch(lx, LID_H))
    # cartouche d'étiquette en creux (le couvercle s'imprime à l'envers :
    # le dessus fini est en Z = 0)
    m = m.difference(blk(-80, -35, -0.1, 160, 70, 1.5))
    # empreintes de gerbage, en face des patins du bac
    for cx, cy in PADS:
        p = trimesh.creation.cylinder(radius=PAD_R + 0.6, height=PAD_H + 0.4, sections=32)
        p.apply_translation((cx, cy, 0.0))
        m = m.difference(p)
    return m


# --------------------------------------------------------------- le joint
def make_gasket(variante):
    o = prism(GRV_O - 0.2, 0, GASKET_T)
    i = prism(GRV_I + 0.2, -1, GASKET_T + 1)
    return o.difference(i)


def clean(m):
    """Nettoyage prudent : on ne retire de la matière que si le solide y gagne.

    LES ÉCLATS À VOLUME NUL. Les booléens laissent, au droit des nervures, des
    lambeaux de deux triangles dos à dos : quarante-huit sur le bac, pour un
    volume rigoureusement nul. Ils ne se voient pas, ne s'impriment pas, mais
    ils suffisent à ce que le fichier ne se relise plus comme un solide fermé —
    et un trancheur qui doute d'un solide fait n'importe quoi de ses parois.
    Le fichier d'origine du jet boat portait le même défaut, 88 arêtes libres.

    On sépare donc les composantes et on ne garde que celles qui ont un volume.
    Le repli est systématique : si le nettoyage ne rend pas le solide fermé, on
    rend le maillage d'avant, jamais un solide amputé.
    """
    keep = m.copy()
    m.merge_vertices()
    comps = m.split(only_watertight=False)
    if len(comps) > 1:
        pleins = [c for c in comps if abs(c.volume) > 1.0]
        if pleins:
            m = trimesh.util.concatenate(pleins) if len(pleins) > 1 else pleins[0]
    if not m.is_watertight:
        m.merge_vertices()
        m.fill_holes()
    if not m.is_watertight:
        m = keep
    m.fix_normals()
    return m


def main():
    variante = None
    if '--amenagement' in sys.argv:
        variante = sys.argv[sys.argv.index('--amenagement') + 1]
        if variante not in AMENAGEMENTS:
            print(f'aménagement inconnu : {variante}')
            return 2
    suffixe = f'-{variante}' if variante else ''
    print(f"aménagement : {variante or 'aucun — coque nue, commune aux deux boîtes'}")
    os.makedirs(OUT, exist_ok=True)
    ok = True
    for nom, fn in (('bac', make_base), ('couvercle', make_lid), ('joint', make_gasket)):
        m = clean(fn(variante))
        b = m.bounds
        taille = np.round(b[1] - b[0], 1)
        print(f'  {nom:10s} {len(m.faces):6d} faces  fermé={m.is_watertight}  '
              f'volume={m.volume / 1000:7.1f} cm3  encombrement={taille}')
        ok = ok and m.is_watertight
        m.export(os.path.join(OUT, f'boite{suffixe}-{nom}.STL'))
    print(f"\npassage libre intérieur {IN_L:.0f} x {IN_W:.0f} x {BASE_CAV:.0f} mm "
          f"(+ {LID_CAV:.0f} sous le couvercle)")
    return 0 if ok else 1


if __name__ == '__main__':
    print('Boîte de rangement — coque commune drone / jet boat')
    sys.exit(main())
