# Models for the far zones: pines for the forest and the snowy peaks, the ranger's fire tower, the ski hut, the harbour
# town's three kinds of house (walls and roofs apart, so each can be painted its own colour) and the harbour crane. Made the same way
# as tools/build_vehicles.py (whose shape helpers and shade baking this borrows), and packed by tools/pack_models.py.
# Run with:  blender --background --python tools/build_zones.py -- build/zones
#
# Game-sized metres, up is +Z; pack_models.py turns that into the game's axes.
import math
import os
import random

_src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build_vehicles.py'), encoding='utf8').read()
# the helpers (finish, box, slab, rod, cone, ...) and the shade baker, without building the vehicles
exec(_src[:_src.index('# ================================================================= the fast rescue boat')])
exec(_src[_src.index('# ================================================================= baked shading'):_src.index('made = [')])

# (the conifers' needles have a darker green of their own)
for _n in ('Leaf2', 'Leaf3', 'FlagB', 'Dolphin'):
    MATS[_n] = bpy.data.materials.new(_n)
    ORDER.append(_n)
rnd = random.Random(7)


# ================================================================= pines
def pine(name, height, spread, seed, tiers, sides, crossed=True, base=0.13, lean=0.35, skirt=0.48):
    # A spruce, as one sees them in a real stand: a bare grey-brown trunk at the foot, then whorl after whorl of boughs
    # that droop from the trunk and lift a little at their tips, longest at the bottom, shortest up the narrow spire.
    # Nothing about it is regular: the whorls are unevenly spaced, some boughs are missing or short, the crown leans a
    # little. Under each whorl a dark, ragged skirt (Leaf3) fills the gaps between its boughs so the tree never looks
    # see-through or like a cone wearing stickers; the boughs themselves are cards (Leaf2) that the game paints with a
    # spray of needles, each in two pieces so it bends.
    r = random.Random(seed)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.verify()
    bark, core, leaf = ORDER.index('Bark'), ORDER.index('Leaf3'), ORDER.index('Leaf2')
    bmesh.ops.create_cone(bm, cap_ends=True, segments=7, radius1=0.2 + height * 0.012, radius2=0.04, depth=height * 0.86,
                          matrix=Matrix.Translation((0, 0, height * 0.43)))
    for f in bm.faces:
        f.material_index = bark
    la = r.uniform(0, 2 * math.pi)
    lx, ly = math.cos(la) * lean, math.sin(la) * lean          # (the crown's lean, in metres at the top)

    def quad(a, b, c, d, mat, uvs=((0, 0), (1, 0), (1, 1), (0, 1))):
        f = bm.faces.new([bm.verts.new(v) for v in (a, b, c, d)])
        f.material_index = mat
        for loop, t in zip(f.loops, uvs):
            loop[uv].uv = t

    # whorl heights: evenly spread, each nudged, closer together toward the top
    ks = sorted(min(1.0, max(0.0, (t + r.uniform(-0.35, 0.35)) / tiers)) for t in range(tiers))
    for t, k0 in enumerate(ks):
        k = k0 ** 0.85
        z0 = height * (base + (0.9 - base) * k)
        ox, oy = lx * k, ly * k
        R = spread * (1 - k) ** 0.85 * r.uniform(0.85, 1.1) + 0.55
        droop = R * r.uniform(0.38, 0.52)
        # the skirt: a ragged, drooping umbrella from the trunk out to most of the way along the boughs
        n = max(7, sides)
        ring = []
        for i in range(n):
            a = i / n * 2 * math.pi
            rr = R * skirt * (1.0 + (0.22 if i % 2 else -0.15) * r.uniform(0.5, 1.2))
            ring.append((ox + math.cos(a) * rr, oy + math.sin(a) * rr, z0 - droop * 0.72 + (0.0 if i % 2 else r.uniform(-0.25, 0.1) * R * 0.3)))
        top = bm.verts.new((ox, oy, z0 + 0.4))
        vs = [bm.verts.new(v) for v in ring]
        for i in range(n):
            # (each wedge wears the same spray of needles as a bough, stem running out from the trunk)
            f = bm.faces.new([top, vs[(i + 1) % n], vs[i]])
            f.material_index = core
            for loop, c in zip(f.loops, ((0.5, 0.0), (1.0, 1.0), (0.0, 1.0))):
                loop[uv].uv = c
        # the boughs
        off = r.uniform(0, 2 * math.pi)
        for i in range(sides):
            if t < tiers - 2 and r.random() < 0.12:
                continue                                       # (a bough lost to a storm, or never grown)
            a = off + (i + r.uniform(-0.3, 0.3)) / sides * 2 * math.pi
            ca, sa = math.cos(a), math.sin(a)
            rr = R * r.uniform(0.72, 1.12)
            dr = rr * r.uniform(0.36, 0.55)
            p0 = Vector((ox + ca * 0.12, oy + sa * 0.12, z0 + 0.3))
            pm = Vector((ox + ca * rr * 0.55, oy + sa * rr * 0.55, z0 - dr * 0.62))
            p1 = Vector((ox + ca * rr, oy + sa * rr, z0 - dr * 0.75 + rr * 0.1))       # (the tip turns up)
            side = Vector((-sa, ca, 0))
            w0, wm, w1 = 0.25, 0.42 + rr * 0.16, 0.5 + rr * 0.2
            quad(p0 - side * w0, p0 + side * w0, pm + side * wm, pm - side * wm, leaf, ((0, 0), (1, 0), (1, 0.5), (0, 0.5)))
            quad(pm - side * wm, pm + side * wm, p1 + side * w1, p1 - side * w1, leaf, ((0, 0.5), (1, 0.5), (1, 1), (0, 1)))
            if crossed:
                # (one more card on edge along the bough, so it has body seen from the side as well as from above)
                up = (p1 - p0).cross(side).normalized()
                quad(p0 - up * w0 * 0.8, p0 + up * w0 * 0.8, p1 + up * w1 * 0.75, p1 - up * w1 * 0.75, leaf)
    # the leader: a last upright tuft on top of the spire
    zt = height * 0.93
    for a in (0.0, math.pi / 2):
        side = Vector((math.cos(a), math.sin(a), 0))
        quad(Vector((lx, ly, zt - 1.4)) - side * 0.35, Vector((lx, ly, zt - 1.4)) + side * 0.35, Vector((lx, ly, zt + 0.5)) + side * 0.12,
             Vector((lx, ly, zt + 0.5)) - side * 0.12, leaf)
    return finish(bm, name, False)


def snag(name, height, seed):
    # a pine long dead: a weathered trunk with its top snapped off and a few broken stubs of branches
    r = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=7, radius1=0.32, radius2=0.12, depth=height, matrix=Matrix.Translation((0, 0, height / 2)))
    for k in range(9):
        z = height * r.uniform(0.25, 0.92)
        a = r.uniform(0, 2 * math.pi)
        ln = r.uniform(0.6, 2.2) * (1.15 - z / height)
        d = Vector((math.cos(a), math.sin(a), -r.uniform(0.15, 0.6))).normalized()
        mid = Vector((0, 0, z)) + d * ln / 2
        bmesh.ops.create_cone(bm, cap_ends=True, segments=5, radius1=0.07, radius2=0.02, depth=ln,
                              matrix=Matrix.Translation(mid) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4())
    for f in bm.faces:
        f.material_index = ORDER.index('Bark')
    return finish(bm, name, False)


# ================================================================= the ranger's fire tower
# A timber lookout on four splayed legs, cross-braced, with a cabin and a wide deck all round it at the top where the
# ranger waits (on the corner, clear of the roof, so the basket can come straight down to them). Deck at z = 12.
def tower():
    D = 12.0
    bits = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            bits.append(rod('Leg', (sx * 2.6, sy * 2.6, -0.6), (sx * 1.5, sy * 1.5, D), 0.16, 'Bark', 8))
    lvl = [0.4, 4.2, 8.0, D - 0.2]
    w = lambda z: 2.6 - (2.6 - 1.5) * (z + 0.6) / (D + 0.6)
    for z0, z1 in zip(lvl, lvl[1:]):
        a, b = w(z0), w(z1)
        for s in (-1, 1):
            bits += [rod('Brace', (-a, s * a, z0), (b, s * b, z1), 0.07, 'Bark', 6), rod('Brace', (a, s * a, z0), (-b, s * b, z1), 0.07, 'Bark', 6),
                     rod('Brace', (s * a, -a, z0), (s * b, b, z1), 0.07, 'Bark', 6), rod('Brace', (s * a, a, z0), (s * b, -b, z1), 0.07, 'Bark', 6)]
        for s in (-1, 1):
            bits += [rod('Tie', (-b, s * b, z1), (b, s * b, z1), 0.08, 'Bark', 6), rod('Tie', (s * b, -b, z1), (s * b, b, z1), 0.08, 'Bark', 6)]
    # stairs: a ladder up one face
    for i in range(22):
        z = 0.3 + i * (D - 0.5) / 22
        x = w(z) + 0.35
        bits.append(rod('Rung', (x, -0.35, z), (x, 0.35, z), 0.035, 'Bark', 5))
    bits += [rod('Stile', (2.95, -0.35, 0), (1.85, -0.35, D), 0.05, 'Bark', 6), rod('Stile', (2.95, 0.35, 0), (1.85, 0.35, D), 0.05, 'Bark', 6)]
    # deck, rail, cabin, roof
    bits.append(slab('Deck', (0, 0, D), (5.8, 5.8, 0.22), 'Deck', 0.03))
    for sx in (-1, 1):
        for sy in (-1, 1):
            bits.append(rod('Post', (sx * 2.8, sy * 2.8, D), (sx * 2.8, sy * 2.8, D + 1.05), 0.05, 'Bark', 6))
    for s in (-1, 1):
        for z in (D + 0.55, D + 1.05):
            bits += [rod('Rail', (-2.8, s * 2.8, z), (2.8, s * 2.8, z), 0.04, 'Bark', 6), rod('Rail', (s * 2.8, -2.8, z), (s * 2.8, 2.8, z), 0.04, 'Bark', 6)]
    c = 1.35
    for s in (-1, 1):
        bits += [slab('Wall', (0, s * c, D + 0.65), (2 * c, 0.1, 1.1), 'Deck', 0.02), slab('Wall', (s * c, 0, D + 0.65), (0.1, 2 * c, 1.1), 'Deck', 0.02),
                 slab('Glass', (0, s * c, D + 1.75), (2 * c - 0.2, 0.05, 1.0), 'Glass', 0.0), slab('Glass', (s * c, 0, D + 1.75), (0.05, 2 * c - 0.2, 1.0), 'Glass', 0.0)]
        for t in (-1, 1):
            bits.append(rod('Mullion', (s * c, t * c, D + 1.2), (s * c, t * c, D + 2.3), 0.06, 'Paint', 6))
    bits.append(slab('Eave', (0, 0, D + 2.35), (2 * c + 0.5, 2 * c + 0.5, 0.12), 'Paint', 0.02))
    bits.append(cone('Roof', (0, 0, D + 2.4), (0, 0, D + 3.9), 2.25, 0.05, 'Roof', 4))
    bits.append(rod('Mast', (0, 0, D + 3.8), (0, 0, D + 5.6), 0.04, 'Metal', 6))
    bits.append(slab('Flag', (0.5, 0, D + 5.25), (0.9, 0.03, 0.55), 'Accent', 0.0))
    return join('World_FireTower', bits)


# ================================================================= the ski hut
# A mountain refuge: a stone footing, a timber body with red shutters, a steep roof to shed the snow, a chimney and a
# little porch facing the landing pad (+X).
def skihut():
    L, W, H = 6.0, 5.0, 3.2
    bits = [slab('Footing', (0, 0, 0.1), (L + 0.3, W + 0.3, 1.4), 'Concrete', 0.05),
            slab('Body', (0, 0, 0.8 + H / 2), (L, W, H), 'Deck', 0.03)]
    for s in (-1, 1):
        bits.append(box('Roof', [(-L / 2 - 0.6, 0, 0.8 + H + 2.9), (L / 2 + 0.6, 0, 0.8 + H + 2.9), (L / 2 + 0.6, s * (W / 2 + 0.7), 0.8 + H - 0.2), (-L / 2 - 0.6, s * (W / 2 + 0.7), 0.8 + H - 0.2)],
                        [(-L / 2 - 0.6, 0, 0.8 + H + 3.15), (L / 2 + 0.6, 0, 0.8 + H + 3.15), (L / 2 + 0.6, s * (W / 2 + 0.7), 0.8 + H + 0.05), (-L / 2 - 0.6, s * (W / 2 + 0.7), 0.8 + H + 0.05)], 'Roof', 0.04))
    for s in (-1, 1):
        # gable ends
        bits.append(box('Gable', [(s * L / 2, -W / 2, 0.8 + H), (s * L / 2, W / 2, 0.8 + H), (s * L / 2, 0.01, 0.8 + H + 2.85), (s * L / 2, -0.01, 0.8 + H + 2.85)],
                        [(s * (L / 2 - 0.12), -W / 2, 0.8 + H), (s * (L / 2 - 0.12), W / 2, 0.8 + H), (s * (L / 2 - 0.12), 0.01, 0.8 + H + 2.85), (s * (L / 2 - 0.12), -0.01, 0.8 + H + 2.85)], 'Deck', 0.0))
        for y in (-1.4, 1.4):
            bits += [slab('Window', (y * 0.9, s * (W / 2 + 0.02), 2.6), (0.9, 0.05, 1.0), 'Glass', 0.0),
                     slab('Shutter', (y * 0.9 - 0.7, s * (W / 2 + 0.06), 2.6), (0.4, 0.05, 1.1), 'Accent', 0.01),
                     slab('Shutter', (y * 0.9 + 0.7, s * (W / 2 + 0.06), 2.6), (0.4, 0.05, 1.1), 'Accent', 0.01)]
    bits += [slab('Door', (L / 2 + 0.03, 0, 1.9), (0.06, 1.1, 2.1), 'Dark', 0.01),
             slab('Porch', (L / 2 + 1.1, 0, 0.75), (2.2, 3.4, 0.18), 'Deck', 0.02),
             rod('PorchPost', (L / 2 + 2.1, -1.6, 0.75), (L / 2 + 2.1, -1.6, 3.4), 0.1, 'Bark', 6),
             rod('PorchPost', (L / 2 + 2.1, 1.6, 0.75), (L / 2 + 2.1, 1.6, 3.4), 0.1, 'Bark', 6),
             box('PorchRoof', [(L / 2, -1.9, 4.0), (L / 2, 1.9, 4.0), (L / 2 + 2.4, 1.9, 3.3), (L / 2 + 2.4, -1.9, 3.3)],
                 [(L / 2, -1.9, 4.15), (L / 2, 1.9, 4.15), (L / 2 + 2.4, 1.9, 3.45), (L / 2 + 2.4, -1.9, 3.45)], 'Roof', 0.03),
             slab('Chimney', (-1.6, 1.0, 0.8 + H + 2.6), (0.8, 0.8, 2.6), 'Concrete', 0.03),
             ball('Lamp', (L / 2 + 0.1, 0.9, 3.2), (0.12, 0.12, 0.16), 'Glow'),
             slab('Woodpile', (-L / 2 - 0.6, 0, 1.2), (0.9, 3.2, 1.4), 'Bark', 0.05),
             rod('Skis', (L / 2 + 0.2, -2.0, 0.9), (L / 2 + 0.35, -2.1, 2.7), 0.05, 'Tip', 4),
             rod('Skis', (L / 2 + 0.2, -2.25, 0.9), (L / 2 + 0.35, -2.35, 2.7), 0.05, 'Tip', 4)]
    return join('World_SkiHut', bits)


# ================================================================= harbour town's houses
# Three kinds of town house, each as walls (painted per house by the game, through the Concrete material only) and a
# roof (Roof only), so a street of them can be every colour. Front (the street side) is +X, the house stands on z = 0.
#   A: tall and narrow, three floors, its gable end to the street
#   B: two floors with a balcony, eaves to the street and a dormer in the roof
#   C: a wide shop, a big window and a striped awning on the ground floor, a flat over it
FL = 2.7


def window(x, y, z, face, shutters=True, box_=True):
    # a window in a wall facing +X (face=1) or -X (face=-1): white frame, dark glass, shutters, a box of flowers
    bits = [slab('Frame', (x + face * 0.03, y, z), (0.06, 1.0, 1.35), 'Paint', 0.0),
            slab('Win', (x + face * 0.06, y, z), (0.05, 0.78, 1.12), 'Glass', 0.0),
            slab('Bar', (x + face * 0.08, y, z), (0.03, 0.06, 1.12), 'Paint', 0.0),
            slab('Sill', (x + face * 0.1, y, z - 0.7), (0.2, 1.05, 0.08), 'Paint', 0.0)]
    if shutters:
        for sy in (-1, 1):
            bits.append(slab('Shutter', (x + face * 0.05, y + sy * 0.72, z), (0.05, 0.4, 1.3), 'Navy', 0.0))
    if box_:
        bits += [slab('Planter', (x + face * 0.22, y, z - 0.6), (0.24, 0.9, 0.2), 'Deck', 0.0),
                 slab('Flowers', (x + face * 0.22, y, z - 0.45), (0.22, 0.85, 0.14), 'Leaf', 0.0)]
        for k in (-0.3, 0.0, 0.3):
            bits.append(slab('Bloom', (x + face * 0.24, y + k, z - 0.36), (0.12, 0.14, 0.1), 'Accent', 0.0))
    return bits


def side_window(x, y, z, face):
    # a plain window in a side wall (facing +Y or -Y)
    return [slab('Frame', (x, y + face * 0.03, z), (0.85, 0.06, 1.2), 'Paint', 0.0), slab('Win', (x, y + face * 0.06, z), (0.65, 0.05, 1.0), 'Glass', 0.0)]


def town_house(name, L, W, floors, ridge, pitch, shop=False, balcony=False, dormer=False, seed=1):
    r = random.Random(seed)
    H = floors * FL + 0.3
    walls = [slab('Walls', (0, 0, H / 2 - 0.4), (L, W, H + 0.8), 'Concrete', 0.03),
             slab('Plinth', (0, 0, -0.15), (L + 0.12, W + 0.12, 0.7), 'Seam', 0.02),
             slab('Cornice', (0, 0, H - 0.1), (L + 0.22, W + 0.22, 0.22), 'Paint', 0.02)]
    for f in range(floors - 1):
        walls.append(slab('Band', (0, 0, (f + 1) * FL), (L + 0.08, W + 0.08, 0.12), 'Paint', 0.0))
    # the gable ends, in the wall's own colour
    if ridge == 'x':
        for sx in (-1, 1):
            walls.append(box('Gable', [(sx * L / 2, -W / 2, H), (sx * L / 2, W / 2, H), (sx * L / 2, 0.01, H + pitch), (sx * L / 2, -0.01, H + pitch)],
                             [(sx * (L / 2 - 0.25), -W / 2, H), (sx * (L / 2 - 0.25), W / 2, H), (sx * (L / 2 - 0.25), 0.01, H + pitch), (sx * (L / 2 - 0.25), -0.01, H + pitch)], 'Concrete', 0.0))
        walls += window(L / 2, 0, H + pitch * 0.35, 1, shutters=False, box_=False)
    else:
        for sy in (-1, 1):
            walls.append(box('Gable', [(-L / 2, sy * W / 2, H), (L / 2, sy * W / 2, H), (0.01, sy * W / 2, H + pitch), (-0.01, sy * W / 2, H + pitch)],
                             [(-L / 2, sy * (W / 2 - 0.25), H), (L / 2, sy * (W / 2 - 0.25), H), (0.01, sy * (W / 2 - 0.25), H + pitch), (-0.01, sy * (W / 2 - 0.25), H + pitch)], 'Concrete', 0.0))
    cols = max(1, int((W - 0.6) // 1.7))
    ys = [-W / 2 + (i + 0.5) * W / cols for i in range(cols)]
    door = ys[-1] if shop else ys[r.randrange(cols)]
    for f in range(floors):
        z = 1.35 + f * FL
        for y in ys:
            if f == 0 and y == door:
                walls += [slab('Door', (L / 2 + 0.03, y, 1.08), (0.06, 1.0, 2.15), 'Deck', 0.0),
                          slab('Lintel', (L / 2 + 0.05, y, 2.3), (0.1, 1.25, 0.22), 'Paint', 0.0),
                          slab('Step', (L / 2 + 0.3, y, 0.08), (0.6, 1.3, 0.16), 'Seam', 0.0),
                          slab('Knob', (L / 2 + 0.08, y + 0.3, 1.05), (0.06, 0.08, 0.08), 'Metal', 0.0)]
                continue
            if f == 0 and shop:
                continue
            walls += window(L / 2, y, z, 1, box_=r.random() < 0.6)
        for y in ys[:max(1, cols - 1)]:
            walls += window(-L / 2, y, 1.35 + f * FL, -1, shutters=False, box_=False)
        if f > 0:
            for sy in (-1, 1):
                walls += side_window(0, sy * W / 2, 1.35 + f * FL, sy)
    if shop:
        sw = W - 1.9
        sy0 = -W / 2 + 0.25 + sw / 2
        walls += [slab('ShopFrame', (L / 2 + 0.03, sy0, 1.25), (0.07, sw + 0.2, 1.9), 'Paint', 0.0),
                  slab('ShopWin', (L / 2 + 0.06, sy0, 1.25), (0.05, sw - 0.1, 1.7), 'Glass', 0.0),
                  slab('Sign', (L / 2 + 0.06, sy0, 2.45), (0.06, sw, 0.4), 'Deck', 0.0)]
        # (a striped awning over the shop window)
        n = 7
        for i in range(n):
            y0, y1 = sy0 - sw / 2 + i * sw / n, sy0 - sw / 2 + (i + 1) * sw / n
            walls.append(box('Awning', [(L / 2, y0, 2.75), (L / 2, y1, 2.75), (L / 2 + 1.3, y1, 2.2), (L / 2 + 1.3, y0, 2.2)],
                             [(L / 2, y0, 2.8), (L / 2, y1, 2.8), (L / 2 + 1.3, y1, 2.25), (L / 2 + 1.3, y0, 2.25)], 'Accent' if i % 2 else 'Paint', 0.0))
    if balcony:
        bw = W * 0.62
        walls += [slab('Balcony', (L / 2 + 0.55, 0, FL + 0.1), (1.1, bw, 0.14), 'Paint', 0.01),
                  slab('BalconyDoor', (L / 2 + 0.03, 0, FL + 1.15), (0.06, 1.0, 2.0), 'Glass', 0.0)]
        for k in range(9):
            y = -bw / 2 + k * bw / 8
            walls.append(rod('Rail', (L / 2 + 1.05, y, FL + 0.15), (L / 2 + 1.05, y, FL + 1.05), 0.025, 'Metal', 5))
        walls.append(rod('Rail', (L / 2 + 1.05, -bw / 2, FL + 1.05), (L / 2 + 1.05, bw / 2, FL + 1.05), 0.035, 'Metal', 6))
    # the roof
    roof = []
    o = 0.35
    if ridge == 'x':
        for sy in (-1, 1):
            roof.append(box('Roof', [(-L / 2 - o, 0, H + pitch), (L / 2 + o, 0, H + pitch), (L / 2 + o, sy * (W / 2 + o), H - 0.15), (-L / 2 - o, sy * (W / 2 + o), H - 0.15)],
                            [(-L / 2 - o, 0, H + pitch + 0.2), (L / 2 + o, 0, H + pitch + 0.2), (L / 2 + o, sy * (W / 2 + o), H + 0.05), (-L / 2 - o, sy * (W / 2 + o), H + 0.05)], 'Roof', 0.02))
        roof.append(slab('Chimney', (-L * 0.25, W * 0.25, H + pitch * 0.75 + 0.5), (0.6, 0.6, 1.6), 'Seam', 0.02))
    else:
        for sx in (-1, 1):
            roof.append(box('Roof', [(0, -W / 2 - o, H + pitch), (0, W / 2 + o, H + pitch), (sx * (L / 2 + o), W / 2 + o, H - 0.15), (sx * (L / 2 + o), -W / 2 - o, H - 0.15)],
                            [(0, -W / 2 - o, H + pitch + 0.2), (0, W / 2 + o, H + pitch + 0.2), (sx * (L / 2 + o), W / 2 + o, H + 0.05), (sx * (L / 2 + o), -W / 2 - o, H + 0.05)], 'Roof', 0.02))
        roof.append(slab('Chimney', (-L * 0.2, W * 0.32, H + pitch * 0.8 + 0.5), (0.6, 0.6, 1.6), 'Seam', 0.02))
        roof.append(slab('ChimneyPot', (-L * 0.2, W * 0.32, H + pitch * 0.8 + 1.35), (0.3, 0.3, 0.3), 'Accent', 0.0))
        if dormer:
            dz = H + pitch * 0.25
            roof += [slab('Dormer', (L / 4 + 0.2, 0, dz + 0.55), (1.2, 1.4, 1.3), 'Paint', 0.02),
                     slab('DormerWin', (L / 4 + 0.82, 0, dz + 0.55), (0.05, 0.9, 0.85), 'Glass', 0.0),
                     box('DormerRoof', [(L / 4 - 0.4, -0.85, dz + 1.2), (L / 4 - 0.4, 0.85, dz + 1.2), (L / 4 + 0.95, 0.85, dz + 1.2), (L / 4 + 0.95, -0.85, dz + 1.2)],
                         [(L / 4 - 0.4, -0.05, dz + 1.75), (L / 4 - 0.4, 0.05, dz + 1.75), (L / 4 + 0.95, 0.05, dz + 1.75), (L / 4 + 0.95, -0.05, dz + 1.75)], 'Roof', 0.0)]
    return [join(name, walls), join(name + 'Roof', roof)]


# ================================================================= life on the water
# A little sloop that sails between the islands: a white hull with a coloured stripe, a wooden deck, a mast with a
# mainsail and a jib. Front +X, waterline z = 0, about 7 m long.
def sailboat():
    hull = loft('Hull', [(3.6, 0.04, 0.5, 0.45, 2), (2.6, 0.75, 0.62, 0.35, 2.4), (0.6, 1.25, 0.68, 0.3, 2.6), (-1.6, 1.15, 0.62, 0.32, 2.6), (-3.0, 0.8, 0.5, 0.38, 2.6)],
                lambda x, sd, up: 'Accent' if 0.05 < up < 0.4 else ('Navy' if up < -0.55 else 'Paint'), ring=24, subdivide=1)
    bits = [hull, slab('Deck', (0.2, 0, 0.98), (5.4, 1.9, 0.08), 'Deck', 0.02),
            slab('Cabin', (-0.2, 0, 1.3), (2.0, 1.25, 0.6), 'Paint', 0.05),
            slab('Port', (-0.2, 0.63, 1.32), (1.4, 0.03, 0.22), 'Glass', 0.0), slab('Port', (-0.2, -0.63, 1.32), (1.4, 0.03, 0.22), 'Glass', 0.0),
            rod('Mast', (0.9, 0, 1.0), (0.9, 0, 9.4), 0.07, 'Metal', 8),
            rod('Boom', (0.9, 0, 2.0), (-2.6, 0, 2.0), 0.06, 'Metal', 8),
            box('Main', [(0.85, -0.02, 2.1), (0.85, 0.02, 2.1), (0.85, 0.02, 9.2), (0.85, -0.02, 9.2)],
                [(-2.55, -0.02, 2.1), (-2.55, 0.02, 2.1), (0.75, 0.02, 9.1), (0.75, -0.02, 9.1)], 'FlagB', 0.0),
            box('Jib', [(3.5, -0.02, 1.1), (3.5, 0.02, 1.1), (1.0, 0.02, 8.4), (1.0, -0.02, 8.4)],
                [(1.05, -0.02, 1.4), (1.05, 0.02, 1.4), (0.98, 0.02, 8.2), (0.98, -0.02, 8.2)], 'FlagB', 0.0),
            rod('Stay', (3.55, 0, 1.0), (0.9, 0, 9.3), 0.015, 'Metal', 4),
            slab('Keel', (0.0, 0, -0.3), (1.6, 0.12, 0.9), 'Navy', 0.02),
            slab('Rudder', (-2.95, 0, 0.1), (0.4, 0.06, 0.8), 'Navy', 0.01)]
    return join('World_Sailboat', bits)


# A grey seal hauled out on the ice, head up. Front +X, lying on z = 0, about 1.8 m long.
def seal():
    body = loft('Body', [(0.95, 0.05, 0.05, 0.62, 2), (0.82, 0.17, 0.18, 0.6, 2), (0.55, 0.2, 0.2, 0.5, 2), (0.3, 0.3, 0.28, 0.32, 2),
                         (-0.2, 0.36, 0.3, 0.3, 2), (-0.7, 0.24, 0.2, 0.2, 2), (-1.0, 0.08, 0.08, 0.12, 2)],
                lambda x, sd, up: 'Dolphin', ring=20, subdivide=1)
    bits = [body, ball('Eye', (0.78, 0.12, 0.66), (0.04, 0.04, 0.04), 'Dark'), ball('Eye', (0.78, -0.12, 0.66), (0.04, 0.04, 0.04), 'Dark'),
            ball('Nose', (0.98, 0, 0.6), (0.04, 0.05, 0.035), 'Dark'),
            box('Flipper', [(0.25, 0.25, 0.1), (0.05, 0.25, 0.1), (0.05, 0.25, 0.14), (0.25, 0.25, 0.14)], [(0.25, 0.55, 0.0), (0.0, 0.55, 0.0), (0.0, 0.55, 0.04), (0.25, 0.55, 0.04)], 'Dolphin', 0.0),
            box('Flipper', [(0.25, -0.25, 0.1), (0.05, -0.25, 0.1), (0.05, -0.25, 0.14), (0.25, -0.25, 0.14)], [(0.25, -0.55, 0.0), (0.0, -0.55, 0.0), (0.0, -0.55, 0.04), (0.25, -0.55, 0.04)], 'Dolphin', 0.0),
            box('Tail', [(-0.95, -0.05, 0.1), (-0.95, 0.05, 0.1), (-0.95, 0.05, 0.14), (-0.95, -0.05, 0.14)], [(-1.25, -0.22, 0.12), (-1.25, 0.22, 0.12), (-1.25, 0.22, 0.16), (-1.25, -0.22, 0.16)], 'Dolphin', 0.0)]
    return join('World_Seal', bits)


# A green sea turtle, swimming: a domed shell, head out front, four flippers. Front +X, about 1.1 m long.
def turtle():
    shell = loft('Shell', [(0.5, 0.06, 0.04, 0.0, 2), (0.38, 0.32, 0.12, 0.02, 2.4), (0.0, 0.42, 0.17, 0.03, 2.6), (-0.35, 0.3, 0.12, 0.02, 2.4), (-0.5, 0.05, 0.03, 0.0, 2)],
                 lambda x, sd, up: 'Deck' if up > -0.2 else 'Bleached', ring=20, subdivide=1)
    bits = [shell, ball('Head', (0.62, 0, 0.02), (0.14, 0.09, 0.07), 'Leaf3'), ball('Eye', (0.7, 0.06, 0.05), (0.02, 0.02, 0.02), 'Dark'), ball('Eye', (0.7, -0.06, 0.05), (0.02, 0.02, 0.02), 'Dark')]
    for sx, sy, ln in ((0.25, 1, 0.5), (0.25, -1, 0.5), (-0.32, 1, 0.25), (-0.32, -1, 0.25)):
        bits.append(box('Flipper', [(sx + 0.08, sy * 0.3, -0.01), (sx - 0.08, sy * 0.3, -0.01), (sx - 0.08, sy * 0.3, 0.02), (sx + 0.08, sy * 0.3, 0.02)],
                        [(sx - ln * 0.4, sy * (0.3 + ln), -0.02), (sx - ln * 0.6, sy * (0.3 + ln * 0.8), -0.02), (sx - ln * 0.6, sy * (0.3 + ln * 0.8), 0.0), (sx - ln * 0.4, sy * (0.3 + ln), 0.0)], 'Leaf3', 0.0))
    return join('World_Turtle', bits)


# ================================================================= the harbour crane
# A dockside jib crane: a lattice tower on a portal, a cab, a long jib out over the water with a counterweight behind.
def crane():
    bits = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            bits.append(rod('Portal', (sx * 2.2, sy * 2.2, 0), (sx * 1.0, sy * 1.0, 4.5), 0.18, 'Tip', 8))
            bits.append(rod('Chord', (sx * 1.0, sy * 1.0, 4.5), (sx * 0.8, sy * 0.8, 15), 0.1, 'Tip', 6))
    for i in range(7):
        z0, z1 = 4.5 + i * 1.5, 6.0 + i * 1.5
        for s in (-1, 1):
            bits += [rod('Lace', (-0.9, s * 0.9, z0), (0.9, s * 0.9, z1), 0.05, 'Tip', 5), rod('Lace', (s * 0.9, 0.9, z0), (s * 0.9, -0.9, z1), 0.05, 'Tip', 5)]
    bits += [slab('Cab', (0.4, 0, 16.0), (2.6, 2.0, 2.0), 'Paint', 0.05), slab('CabGlass', (1.72, 0, 16.2), (0.05, 1.7, 1.2), 'Glass', 0.0),
             slab('Turntable', (0, 0, 15.0), (2.4, 2.4, 0.3), 'Dark', 0.03)]
    for s in (-1, 1):
        bits.append(rod('Jib', (1.2, s * 0.6, 16.6), (17.0, s * 0.15, 17.6), 0.1, 'Tip', 6))
        bits.append(rod('Counterjib', (-0.8, s * 0.6, 16.6), (-6.5, s * 0.6, 16.8), 0.1, 'Tip', 6))
    bits.append(rod('JibTop', (1.2, 0, 18.4), (17.0, 0, 17.8), 0.08, 'Tip', 6))
    for i in range(8):
        x0, x1 = 1.2 + i * 2.0, 3.2 + i * 2.0
        bits.append(rod('JibLace', (x0, 0.55 - i * 0.05, 16.6 + i * 0.12), (x1, 0, 18.4 - i * 0.08), 0.04, 'Tip', 4))
    bits += [rod('Apex', (0, 0, 16.0), (0, 0, 21.0), 0.12, 'Tip', 6), rod('Stay', (0, 0, 21.0), (16.5, 0, 17.9), 0.03, 'Metal', 4),
             rod('Stay', (0, 0, 21.0), (-6.3, 0, 17.0), 0.03, 'Metal', 4), slab('Counterweight', (-5.6, 0, 16.2), (1.8, 2.0, 1.4), 'Concrete', 0.04),
             rod('Cable', (15.5, 0, 17.6), (15.5, 0, 9.0), 0.025, 'Metal', 4), slab('Hook', (15.5, 0, 8.7), (0.5, 0.3, 0.6), 'Accent', 0.02)]
    return join('World_Crane', bits)


made = [pine('World_Pine', 13.0, 2.9, 11, 13, 13), pine('World_Pine_far', 13.0, 2.9, 11, 9, 10, False, skirt=0.8),
        pine('World_Pine2', 10.0, 3.3, 23, 11, 13, base=0.09), pine('World_Pine2_far', 10.0, 3.3, 23, 8, 10, False, base=0.09, skirt=0.8),
        pine('World_Pine3', 5.5, 2.2, 37, 8, 11, base=0.02, lean=0.15), pine('World_Pine3_far', 5.5, 2.2, 37, 6, 8, False, base=0.02, lean=0.15, skirt=0.8),
        snag('World_Snag', 9.0, 5), snag('World_Snag_far', 9.0, 5),
        tower(), skihut(), crane(),
        *town_house('World_HouseA', 6.0, 4.4, 3, 'x', 2.6, seed=3), *town_house('World_HouseB', 6.0, 5.9, 2, 'y', 2.1, balcony=True, dormer=True, seed=5),
        *town_house('World_HouseC', 6.5, 7.2, 2, 'y', 1.9, shop=True, seed=7), sailboat(), seal(), turtle()]
for ob in made:
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for ob in made:
    if not ob.name.startswith('World_Pine'):
        bake(ob)
for ob in made:
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.ops.export_scene.fbx(filepath='%s/%s.fbx' % (OUT, ob.name), use_selection=True, object_types={'MESH'}, mesh_smooth_type='FACE')
    print('BUILD %s: %d triangles' % (ob.name, sum(len(p.vertices) - 2 for p in ob.data.polygons)))

# a look for whoever ran this
for i, ob in enumerate(made):
    ob.location = (i * 9 - 36, 0, 0)
cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
scene.collection.objects.link(cam)
cam.location = (0, -60, 18)
cam.rotation_euler = (Vector((0, 0, 7)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
scene.camera = cam
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light, scene.display.shading.color_type = 'STUDIO', 'MATERIAL'
scene.display.shading.show_cavity = True
for n, c in (('Paint', (0.9, 0.9, 0.88)), ('Accent', (0.9, 0.2, 0.05)), ('Dark', (0.05, 0.05, 0.06)), ('Glass', (0.1, 0.15, 0.2)), ('Metal', (0.5, 0.5, 0.55)),
             ('Deck', (0.4, 0.25, 0.12)), ('Tip', (0.95, 0.7, 0.05)), ('Bark', (0.3, 0.22, 0.15)), ('Leaf2', (0.1, 0.3, 0.12)), ('Roof', (0.3, 0.35, 0.4)),
             ('Concrete', (0.6, 0.6, 0.58)), ('Seam', (0.3, 0.3, 0.3))):
    MATS[n].diffuse_color = (*c, 1)
scene.render.resolution_x, scene.render.resolution_y = 1600, 600
scene.render.filepath = OUT + '/preview.png'
bpy.ops.render.render(write_still=True)
