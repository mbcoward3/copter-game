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
for _n in ('Leaf2', 'Leaf3', 'FlagB', 'Dolphin', 'Snow', 'Ice'):
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


# ================================================================= the ski lodge
# A snug log lodge for the snowy peaks: a stone footing, walls of stacked logs crossing at the corners, a steep slate
# roof with a thick blanket of snow on it and icicles hanging from its eaves, a gable front with a porch, a red door,
# windows with red shutters (the game lights them at night), a stone chimney, a woodpile, and skis by the door.
# The porch faces the landing pad (+X); the ridge runs front to back.
def skihut():
    r = random.Random(17)
    L, W, Z0, H = 3.2, 3.6, 0.9, 3.0          # half length, half width, top of the footing, height of the walls
    ridge, oy, ox = Z0 + H + 2.6, W + 0.8, L + 0.9
    slope = (ridge - (Z0 + H)) / W
    eave = ridge - oy * slope
    bits = [slab('Footing', (0, 0, Z0 / 2 - 0.8), (2 * L + 0.5, 2 * W + 0.5, Z0 + 1.6), 'Rock', 0.08)]
    # the logs: side walls' and gable walls' courses interleaved, so they cross over one another at the corners
    lr = 0.165
    for i in range(10):
        z = Z0 + lr + i * 0.3
        for s in (-1, 1):
            bits.append(rod('Log', (-L - 0.42, s * W, z), (L + 0.42, s * W, z), lr, 'Bark' if i % 3 else 'Deck', 8))
            bits.append(rod('Log', (s * L, -W - 0.42, z + 0.15), (s * L, W + 0.42, z + 0.15), lr, 'Deck' if i % 3 else 'Bark', 8))
    bits.append(slab('Core', (0, 0, Z0 + H / 2), (2 * L - 0.2, 2 * W - 0.2, H), 'Deck', 0.0))
    # gables of upright boards, with a little window up in the front one
    for s in (-1, 1):
        bits.append(box('Gable', [(s * L, -W, Z0 + H), (s * L, W, Z0 + H), (s * L, 0.02, ridge), (s * L, -0.02, ridge)],
                        [(s * (L - 0.15), -W, Z0 + H), (s * (L - 0.15), W, Z0 + H), (s * (L - 0.15), 0.02, ridge), (s * (L - 0.15), -0.02, ridge)], 'Deck', 0.0))
        for k in range(-5, 6):
            y = k * 0.6
            top = ridge - abs(y) * slope
            if top - (Z0 + H) > 0.3:
                bits.append(slab('Batten', (s * (L + 0.03), y, (Z0 + H + top) / 2), (0.06, 0.09, top - (Z0 + H) - 0.1), 'Bark', 0.0))
    bits += [slab('Frame', (L + 0.07, 0, Z0 + H + 1.05), (0.08, 0.95, 0.95), 'Paint', 0.02), slab('Win', (L + 0.1, 0, Z0 + H + 1.05), (0.06, 0.72, 0.72), 'Glass', 0.0)]
    # the roof: slate on rafters, a deep layer of snow on top rolling over at the eaves, and icicles along them
    for s in (-1, 1):
        bits.append(box('Roof', [(-ox, 0, ridge + 0.02), (ox, 0, ridge + 0.02), (ox, s * oy, eave), (-ox, s * oy, eave)],
                        [(-ox, 0, ridge + 0.24), (ox, 0, ridge + 0.24), (ox, s * oy, eave + 0.22), (-ox, s * oy, eave + 0.22)], 'Roof', 0.03))
        bits.append(box('Snow', [(-ox + 0.12, 0, ridge + 0.22), (ox - 0.12, 0, ridge + 0.22), (ox - 0.12, s * (oy - 0.05), eave + 0.2), (-ox + 0.12, s * (oy - 0.05), eave + 0.2)],
                        [(-ox + 0.05, 0, ridge + 0.62), (ox - 0.05, 0, ridge + 0.62), (ox - 0.05, s * (oy + 0.02), eave + 0.52), (-ox + 0.05, s * (oy + 0.02), eave + 0.52)], 'Snow', 0.14))
        bits.append(rod('SnowRoll', (-ox + 0.05, s * (oy + 0.02), eave + 0.36), (ox - 0.05, s * (oy + 0.02), eave + 0.36), 0.2, 'Snow', 10))
        bits.append(slab('Fascia', (0, s * oy, eave + 0.05), (2 * ox, 0.08, 0.32), 'Accent', 0.01))
        x = -ox + 0.25
        while x < ox - 0.2:
            n = r.uniform(0.18, 0.85) * (0.5 if abs(x) > L + 0.4 else 1)
            bits.append(cone('Icicle', (x, s * (oy - 0.02), eave - 0.08), (x + r.uniform(-0.02, 0.02), s * (oy - 0.02), eave - 0.08 - n), 0.05 + n * 0.04, 0.004, 'Ice', 6))
            x += r.uniform(0.22, 0.5)
    bits.append(slab('Ridge', (0, 0, ridge + 0.62), (2 * ox - 0.1, 0.5, 0.18), 'Snow', 0.08))

    # windows, two down each side and either side of the door, each in a white frame with red shutters and a sill of snow
    def window(x, y, z, nx, ny):
        thin = lambda a, b: (a if nx else b, a if ny else b)
        out = [slab('Frame', (x + nx * 0.19, y + ny * 0.19, z), (*thin(0.08, 1.05), 1.2), 'Paint', 0.02),
               slab('Win', (x + nx * 0.22, y + ny * 0.22, z), (*thin(0.06, 0.84), 0.98), 'Glass', 0.0),
               slab('Bar', (x + nx * 0.25, y + ny * 0.25, z), (*thin(0.03, 0.06), 0.98), 'Paint', 0.0),
               slab('Sill', (x + nx * 0.28, y + ny * 0.28, z - 0.66), (*thin(0.22, 1.15), 0.1), 'Paint', 0.02),
               slab('SillSnow', (x + nx * 0.3, y + ny * 0.3, z - 0.56), (*thin(0.2, 1.05), 0.1), 'Snow', 0.04)]
        for k in (-1, 1):
            out.append(slab('Shutter', (x + nx * 0.22 + abs(ny) * k * 0.78, y + ny * 0.22 + abs(nx) * k * 0.78, z), (*thin(0.05, 0.44), 1.18), 'Accent', 0.01))
        return out
    for s in (-1, 1):
        for x in (-1.5, 1.5):
            bits += window(x, s * W, Z0 + 1.55, 0, s)
    for y in (-2.0, 2.0):
        bits += window(L, y, Z0 + 1.55, 1, 0)
    # the door and its porch: a deck of boards up three steps, a rail each side, a lantern by the door
    bits += [slab('DoorFrame', (L + 0.2, 0, Z0 + 1.1), (0.1, 1.3, 2.3), 'Paint', 0.02), slab('Door', (L + 0.24, 0, Z0 + 1.05), (0.08, 1.05, 2.1), 'Accent', 0.02),
             ball('Knob', (L + 0.3, -0.35, Z0 + 1.0), (0.05, 0.05, 0.05), 'Tip'),
             slab('Porch', (L + 1.0, 0, Z0 - 0.06), (2.0, 4.6, 0.16), 'Deck', 0.02), slab('PorchSnow', (L + 1.55, 0, Z0 + 0.04), (0.9, 4.4, 0.08), 'Snow', 0.03)]
    for k in range(3):
        bits.append(slab('Step', (L + 2.2 + k * 0.38, 0, Z0 - 0.3 - k * 0.3), (0.4, 1.6, 0.14), 'Deck', 0.02))
    for y in (-2.25, 2.25):
        bits += [rod('Post', (L + 1.9, y, Z0), (L + 1.9, y, Z0 + 1.05), 0.07, 'Bark', 6), rod('Post', (L + 0.3, y, Z0), (L + 0.3, y, Z0 + 1.05), 0.07, 'Bark', 6),
                 rod('Rail', (L + 0.3, y, Z0 + 1.0), (L + 1.9, y, Z0 + 1.0), 0.05, 'Bark', 6), rod('RailSnow', (L + 0.3, y, Z0 + 1.08), (L + 1.9, y, Z0 + 1.08), 0.06, 'Snow', 6)]
    bits += [slab('LampArm', (L + 0.3, 0.95, Z0 + 2.2), (0.3, 0.05, 0.05), 'Dark', 0.0), ball('Lamp', (L + 0.45, 0.95, Z0 + 2.1), (0.12, 0.12, 0.16), 'Glow')]
    # the chimney, stone, with a cap of snow
    cx, cy = -1.4, 1.7
    bits += [slab('Chimney', (cx, cy, (Z0 + H + ridge + 1.6) / 2), (0.85, 0.85, ridge + 1.6 - (Z0 + H)), 'Rock', 0.04),
             slab('Pot', (cx, cy, ridge + 1.7), (0.95, 0.95, 0.2), 'Concrete', 0.03), slab('ChimSnow', (cx, cy, ridge + 1.84), (0.7, 0.7, 0.12), 'Snow', 0.05)]
    # a woodpile against the back wall under the eaves, sawn ends out
    for row in range(4):
        for k in range(7):
            y = -1.9 + k * 0.36 + (row % 2) * 0.18
            bits.append(rod('Billet', (-L - 0.25, y, Z0 + 0.18 + row * 0.32), (-L - 1.05, y, Z0 + 0.18 + row * 0.32), 0.16, 'Bark' if (k + row) % 3 else 'Deck', 7))
    bits.append(slab('PileSnow', (-L - 0.65, -0.72, Z0 + 1.42), (0.85, 2.7, 0.12), 'Snow', 0.05))
    # skis and poles leaning by the door
    for k, c in ((0, 'Tip'), (1, 'Tip'), (2, 'Accent'), (3, 'Accent')):
        bits.append(slab('Ski', (L + 0.38, -2.7 - k * 0.14, Z0 + 0.95), (0.06, 0.09, 1.9), c, 0.01))
    bits += [rod('Pole', (L + 0.55, -3.35, Z0), (L + 0.32, -3.4, Z0 + 1.4), 0.025, 'Metal', 5), rod('Pole', (L + 0.6, -3.5, Z0), (L + 0.35, -3.5, Z0 + 1.4), 0.025, 'Metal', 5)]
    return join('World_SkiHut', bits)


# A snowman by the lodge: three balls of snow, coal eyes, smile and buttons, a carrot nose, stick arms (one waving),
# a red scarf and a top hat. Faces +X.
def snowman():
    bits = [ball('Base', (0, 0, 0.5), (0.62, 0.62, 0.56), 'Snow'), ball('Middle', (0, 0, 1.26), (0.44, 0.44, 0.4), 'Snow'),
            ball('Head', (0, 0, 1.86), (0.3, 0.3, 0.29), 'Snow'),
            ball('Eye', (0.25, 0.1, 1.95), (0.04, 0.04, 0.04), 'Dark'), ball('Eye', (0.25, -0.1, 1.95), (0.04, 0.04, 0.04), 'Dark'),
            cone('Nose', (0.27, 0, 1.86), (0.62, 0.03, 1.83), 0.055, 0.005, 'Tip', 8)]
    for k, z in enumerate((1.12, 1.3, 1.48)):
        bits.append(ball('Button', (0.41 - abs(k - 1) * 0.02, 0, z), (0.04, 0.04, 0.04), 'Dark'))
    for k in range(-2, 3):
        a = k * 0.22
        bits.append(ball('Smile', (0.27 * math.cos(a), 0.27 * math.sin(a), 1.76 + 0.018 * abs(k)), (0.022, 0.022, 0.022), 'Dark'))
    ring = [(0.3 * math.cos(t / 12 * 2 * math.pi), 0.3 * math.sin(t / 12 * 2 * math.pi), 1.6) for t in range(12)]
    bits += [tube('Scarf', ring, 0.07, 'Accent', 8, True), slab('ScarfEnd', (0.26, -0.14, 1.38), (0.06, 0.16, 0.42), 'Accent', 0.02),
             rod('Arm', (0, 0.38, 1.35), (0.15, 0.95, 1.72), 0.025, 'Bark', 5), rod('Twig', (0.12, 0.83, 1.64), (0.05, 0.98, 1.85), 0.015, 'Bark', 4),
             rod('Arm', (0, -0.38, 1.35), (0.1, -0.92, 1.18), 0.025, 'Bark', 5), rod('Twig', (0.08, -0.8, 1.21), (0.2, -0.95, 1.1), 0.015, 'Bark', 4),
             rod('Brim', (0, 0, 2.08), (0, 0, 2.12), 0.32, 'Dark', 16), rod('Hat', (0, 0, 2.1), (0, 0, 2.45), 0.21, 'Dark', 16),
             rod('Band', (0, 0, 2.13), (0, 0, 2.2), 0.215, 'Accent', 16)]
    return join('World_Snowman', bits)


# A wooden sledge with red runners curling up at the front. Front +X, about 1.4 m long.
def sled():
    bits = []
    for s in (-1, 1):
        bits.append(tube('Runner', [(-0.7, s * 0.25, 0.04), (0.45, s * 0.25, 0.04), (0.62, s * 0.25, 0.1), (0.7, s * 0.25, 0.24), (0.62, s * 0.25, 0.34)], 0.03, 'Accent', 6))
        for x in (-0.45, 0.0, 0.4):
            bits.append(rod('Strut', (x, s * 0.25, 0.04), (x, s * 0.25, 0.24), 0.025, 'Accent', 5))
    for k in range(5):
        bits.append(slab('Slat', (-0.55 + k * 0.25, 0, 0.27), (0.2, 0.66, 0.04), 'Deck', 0.01))
    bits.append(tube('Rope', [(0.62, -0.25, 0.34), (0.85, -0.1, 0.12), (0.95, 0.15, 0.04), (0.62, 0.25, 0.34)], 0.012, 'Tip', 5))
    return join('World_Sled', bits)


# A penguin standing up, a gentoo about 0.8 m tall: black back and head, white front and a white flash over each eye,
# an orange bill and feet, flippers held a little out. Front +X, standing on z = 0.
def penguin():
    bits = [ball('Body', (0, 0, 0.36), (0.19, 0.17, 0.33), 'Dark'), ball('Belly', (0.055, 0, 0.34), (0.155, 0.145, 0.29), 'Snow'),
            ball('Neck', (0.01, 0, 0.6), (0.12, 0.115, 0.12), 'Dark'), ball('Head', (0.02, 0, 0.72), (0.115, 0.1, 0.105), 'Dark'),
            ball('Throat', (0.07, 0, 0.6), (0.075, 0.09, 0.09), 'Snow'),
            cone('Bill', (0.1, 0, 0.71), (0.24, 0, 0.69), 0.032, 0.006, 'Tip', 8),
            cone('Tail', (-0.14, 0, 0.1), (-0.28, 0, 0.03), 0.06, 0.01, 'Dark', 6)]
    for s in (-1, 1):
        bits += [ball('Flash', (0.04, s * 0.075, 0.77), (0.05, 0.03, 0.022), 'Snow'), ball('Eye', (0.085, s * 0.072, 0.735), (0.016, 0.016, 0.016), 'Dark'),
                 ball('Flipper', (-0.02, s * 0.175, 0.37), (0.06, 0.03, 0.18), 'Dark'),
                 ball('Foot', (0.07, s * 0.07, 0.02), (0.09, 0.05, 0.025), 'Tip')]
    return join('World_Penguin', bits)


# The summit: a cairn of stones with a pole and a red pennant on it.
def summit_flag():
    r = random.Random(5)
    bits = []
    for x, y, z, s in [(0, 0, 0.2, 0.55), (0.45, 0.2, 0.15, 0.4), (-0.4, 0.25, 0.15, 0.42), (0.05, -0.45, 0.14, 0.4), (0.1, 0.05, 0.62, 0.38), (-0.05, -0.05, 0.95, 0.26)]:
        bits.append(ball('Stone', (x, y, z), (s * r.uniform(0.9, 1.2), s * r.uniform(0.9, 1.2), s * 0.7), 'Rock'))
    bits += [rod('Pole', (0, 0, 0.5), (0, 0, 3.6), 0.04, 'Metal', 8), ball('Knob', (0, 0, 3.63), (0.06, 0.06, 0.06), 'Tip'),
             box('Pennant', [(0.04, 0, 3.5), (0.04, 0, 2.9), (0.04, 0.02, 2.9), (0.04, 0.02, 3.5)],
                 [(0.0, 1.2, 3.25), (0.0, 1.2, 3.19), (0.0, 1.22, 3.19), (0.0, 1.22, 3.25)], 'Accent', 0.0)]
    return join('World_Summit', bits)


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
        *town_house('World_HouseC', 6.5, 7.2, 2, 'y', 1.9, shop=True, seed=7), sailboat(), seal(), turtle(),
        snowman(), sled(), penguin(), summit_flag()]
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
             ('Concrete', (0.6, 0.6, 0.58)), ('Seam', (0.3, 0.3, 0.3)), ('Snow', (0.9, 0.93, 0.97)), ('Ice', (0.5, 0.75, 0.9))):
    MATS[n].diffuse_color = (*c, 1)
scene.render.resolution_x, scene.render.resolution_y = 1600, 600
scene.render.filepath = OUT + '/preview.png'
bpy.ops.render.render(write_still=True)
