# Models for the far zones: pines for the forest and the snowy peaks, the ranger's fire tower, the ski hut, the harbour
# town's houses (walls and roofs apart, so each can be painted its own colour) and the harbour crane. Made the same way
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
for _n in ('Leaf2', 'Leaf3'):
    MATS[_n] = bpy.data.materials.new(_n)
    ORDER.append(_n)
rnd = random.Random(7)


# ================================================================= pines
def pine(name, tiers, sides, height=11.0, crossed=True):
    # A spruce: a tapering trunk, a dark solid core of a crown (Leaf3), and round it stacked whorls of drooping boughs,
    # each bough a card or two (Leaf2) that the game paints with a spray of needles, the lowest whorl the widest.
    bm = bmesh.new()
    uv = bm.loops.layers.uv.verify()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=7, radius1=0.32, radius2=0.05, depth=height * 0.96,
                          matrix=Matrix.Translation((0, 0, height * 0.48)))
    for f in bm.faces:
        f.material_index = ORDER.index('Bark')
    bmesh.ops.create_cone(bm, cap_ends=False, segments=9, radius1=1.7, radius2=0.05, depth=height * 0.78,
                          matrix=Matrix.Translation((0, 0, height * 0.55)))
    for f in bm.faces:
        if f.material_index != ORDER.index('Bark'):
            f.material_index = ORDER.index('Leaf3')

    def card(p0, p1, side, width):
        # a quad from p0 (by the trunk) to p1 (the tip), width across along `side`; u across, v along the bough
        p0, p1, side = Vector(p0), Vector(p1), Vector(side).normalized()
        w0, w1 = side * width * 0.3, side * width * 0.5
        vs = [bm.verts.new(p0 - w0), bm.verts.new(p0 + w0), bm.verts.new(p1 + w1), bm.verts.new(p1 - w1)]
        f = bm.faces.new(vs)
        f.material_index = ORDER.index('Leaf2')
        for loop, (u, v) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
            loop[uv].uv = (u, v)

    for t in range(tiers):
        k = t / max(tiers - 1, 1)                       # 0 at the bottom, 1 at the top
        z0 = height * (0.16 + 0.76 * k)
        r = 3.0 * (1 - k) ** 0.85 + 0.45
        for i in range(sides):
            a = (i + (t % 2) * 0.5) / sides * 2 * math.pi + rnd.uniform(-0.15, 0.15)
            ca, sa = math.cos(a), math.sin(a)
            rr = r * rnd.uniform(0.82, 1.12)
            droop = rr * rnd.uniform(0.32, 0.5)
            p0 = (ca * 0.15, sa * 0.15, z0 + 0.25)
            p1 = (ca * rr, sa * rr, z0 - droop)
            width = 0.7 + rr * 0.42
            card(p0, p1, (-sa, ca, 0), width)
            if crossed:
                # (and one on edge, so the bough has body seen from the side as well as from above)
                out = Vector(p1) - Vector(p0)
                card(p0, p1, out.cross(Vector((-sa, ca, 0))), width * 0.7)
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


# ================================================================= harbour town
# A narrow two-storey townhouse, front to +X: walls, windows with sills, a door with a step. Its roof is a model of
# its own (World_HouseRoof) so the town can paint walls and roofs in different colours.
def house():
    L, W, H = 6.0, 5.0, 5.6
    bits = [slab('Walls', (0, 0, H / 2 - 0.4), (L, W, H + 0.8), 'Concrete', 0.03),
            slab('Plinth', (0, 0, -0.2), (L + 0.12, W + 0.12, 0.8), 'Seam', 0.02),
            slab('Door', (L / 2 + 0.02, -1.2, 1.05), (0.06, 1.0, 2.1), 'Dark', 0.01),
            slab('Step', (L / 2 + 0.3, -1.2, 0.08), (0.6, 1.3, 0.16), 'Seam', 0.01)]
    for fl in (1.6, 4.1):
        for y in ((0.4, 1.6) if fl < 2 else (-1.4, 0.2, 1.6)):
            bits += [slab('Win', (L / 2 + 0.02, y, fl), (0.05, 0.85, 1.15), 'Glass', 0.0),
                     slab('Sill', (L / 2 + 0.08, y, fl - 0.62), (0.16, 1.0, 0.08), 'Paint', 0.01)]
        for x in (-1.5, 1.5):
            for s in (-1, 1):
                bits += [slab('Win', (x, s * (W / 2 + 0.02), fl), (0.85, 0.05, 1.15), 'Glass', 0.0),
                         slab('Sill', (x, s * (W / 2 + 0.08), fl - 0.62), (1.0, 0.16, 0.08), 'Paint', 0.01)]
    return join('World_House', bits)


def house_roof():
    L, W, H = 6.0, 5.0, 5.6
    bits = []
    for s in (-1, 1):
        bits.append(box('Roof', [(-L / 2 - 0.35, 0, H + 2.3), (L / 2 + 0.35, 0, H + 2.3), (L / 2 + 0.35, s * (W / 2 + 0.45), H - 0.1), (-L / 2 - 0.35, s * (W / 2 + 0.45), H - 0.1)],
                        [(-L / 2 - 0.35, 0, H + 2.5), (L / 2 + 0.35, 0, H + 2.5), (L / 2 + 0.35, s * (W / 2 + 0.45), H + 0.1), (-L / 2 - 0.35, s * (W / 2 + 0.45), H + 0.1)], 'Roof', 0.03))
        bits.append(box('Gable', [(s * L / 2, -W / 2, H - 0.05), (s * L / 2, W / 2, H - 0.05), (s * L / 2, 0.01, H + 2.3), (s * L / 2, -0.01, H + 2.3)],
                        [(s * (L / 2 - 0.1), -W / 2, H - 0.05), (s * (L / 2 - 0.1), W / 2, H - 0.05), (s * (L / 2 - 0.1), 0.01, H + 2.3), (s * (L / 2 - 0.1), -0.01, H + 2.3)], 'Roof', 0.0))
    bits.append(slab('Chimney', (-1.6, 1.1, H + 2.2), (0.6, 0.6, 1.6), 'Roof', 0.03))
    return join('World_HouseRoof', bits)


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


made = [pine('World_Pine', 10, 14, 12.0), pine('World_Pine2', 8, 12, 9.5), pine('World_Pine_far', 6, 9, 12.0, False), pine('World_Pine2_far', 5, 8, 9.5, False),
        tower(), skihut(), house(), house_roof(), crane()]
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
