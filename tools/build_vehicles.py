# Models the player's fast rescue boat and seaplane, and a few pieces of scenery the Unreal prototype never had
# (a sea arch, a fisherman's hut on stilts, a kayak), the same way the Unreal prototype's build_models.py made the
# Jayhawk: from scratch, with the shade of every crease baked into a picture. Writes FBX + B_<name>.png files that
# tools/pack_models.py packs for the game.
# Run with:  blender --background --python tools/build_vehicles.py -- <output folder>
#
# Game-sized metres. Front is +X, port (left) is +Y, up is +Z; pack_models.py turns that into the game's axes.
import math
import os
import random
import sys
import bmesh
import bpy
from mathutils import Matrix, Vector, noise

OUT = os.path.abspath(sys.argv[sys.argv.index('--') + 1])
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# material names the game knows (src/assets.js LOOKS); the colours here only matter for Blender's own preview
NAMES = ['Paint', 'Accent', 'Dark', 'Glass', 'Metal', 'Rubber', 'Raft', 'Navy', 'Deck', 'Rock', 'Tip', 'Bark', 'LeafDry', 'Seam', 'Glow', 'Roof', 'Concrete', 'Bleached', 'Leaf']
MATS = {}
for n in NAMES:
    m = bpy.data.materials.new(n)
    MATS[n] = m
ORDER = list(MATS)


def finish(bm, name, smooth, subdivide=0, bevel=0.0):
    mesh = bpy.data.meshes.new(name)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    for m in ORDER:
        mesh.materials.append(MATS[m])
    mesh.polygons.foreach_set('use_smooth', [smooth] * len(mesh.polygons))
    ob = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    if bevel:
        ob.modifiers.new('Bevel', 'BEVEL').width = bevel
        bpy.ops.object.modifier_apply(modifier='Bevel')
    if subdivide:
        ob.modifiers.new('Smooth', 'SUBSURF').levels = subdivide
        bpy.ops.object.modifier_apply(modifier='Smooth')
    return ob


def loft(name, stations, paint, ring=28, subdivide=1):
    # a skin over cross-sections. Each station: (x, half width, half height, centre z, squareness).
    # paint(x, side, up) names the material of each panel; side and up run -1..1 round the section
    bm = bmesh.new()
    rings = []
    for x, hw, hh, zc, sq in stations:
        row = []
        for i in range(ring):
            a = (i + 0.5) / ring * 2 * math.pi
            c, n = math.cos(a), math.sin(a)
            row.append(bm.verts.new((x, hw * math.copysign(abs(c) ** (2 / sq), c), zc + hh * math.copysign(abs(n) ** (2 / sq), n))))
        rings.append(row)
    for j in range(len(rings) - 1):
        xm = (stations[j][0] + stations[j + 1][0]) / 2
        for i in range(ring):
            a = (i + 1) / ring * 2 * math.pi
            f = bm.faces.new((rings[j][i], rings[j][(i + 1) % ring], rings[j + 1][(i + 1) % ring], rings[j + 1][i]))
            f.material_index = ORDER.index(paint(xm, math.cos(a), math.sin(a)))
    for row, x in ((rings[0], stations[0][0]), (rings[-1], stations[-1][0])):
        bm.faces.new(row).material_index = ORDER.index(paint(x, 0, 0))
    return finish(bm, name, True, subdivide)


def box(name, a, b, mat, bevel=0.02):
    bm = bmesh.new()
    va = [bm.verts.new(p) for p in a]
    vb = [bm.verts.new(p) for p in b]
    bm.faces.new(va)
    bm.faces.new(vb)
    for i in range(4):
        bm.faces.new((va[i], va[(i + 1) % 4], vb[(i + 1) % 4], vb[i]))
    for f in bm.faces:
        f.material_index = ORDER.index(mat)
    return finish(bm, name, False, bevel=bevel)


def slab(name, centre, size, mat, bevel=0.02):
    c, (dx, dy, dz) = Vector(centre), (size[0] / 2, size[1] / 2, size[2] / 2)
    quad = lambda x: [c + Vector((x, -dy, -dz)), c + Vector((x, dy, -dz)), c + Vector((x, dy, dz)), c + Vector((x, -dy, dz))]
    return box(name, quad(-dx), quad(dx), mat, bevel)


def wing(name, root, tip, mat):
    # a tapered flat panel between two chords: root and tip are (x front, x back, y, z, thickness)
    quad = lambda q: [Vector((q[0], q[2], q[3] - q[4] / 2)), Vector((q[1], q[2], q[3] - q[4] / 2)), Vector((q[1], q[2], q[3] + q[4] / 2)), Vector((q[0], q[2], q[3] + q[4] / 2))]
    return box(name, quad(root), quad(tip), mat, 0.03)


def rod(name, a, b, radius, mat, sides=12):
    a, b = Vector(a), Vector(b)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=sides, radius1=radius, radius2=radius, depth=(b - a).length,
                          matrix=Matrix.Translation((a + b) / 2) @ (b - a).to_track_quat('Z', 'Y').to_matrix().to_4x4())
    for f in bm.faces:
        f.material_index = ORDER.index(mat)
    return finish(bm, name, True)


def cone(name, a, b, r0, r1, mat, sides=16):
    a, b = Vector(a), Vector(b)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=sides, radius1=r0, radius2=max(r1, 0.005), depth=(b - a).length,
                          matrix=Matrix.Translation((a + b) / 2) @ (b - a).to_track_quat('Z', 'Y').to_matrix().to_4x4())
    for f in bm.faces:
        f.material_index = ORDER.index(mat)
    return finish(bm, name, True)


def ball(name, centre, radii, mat):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=10, radius=1, matrix=Matrix.Translation(centre) @ Matrix.Diagonal((*radii, 1)))
    for f in bm.faces:
        f.material_index = ORDER.index(mat)
    return finish(bm, name, True)


def tube(name, path, radius, mat, sides=12, closed=False):
    # a round tube swept along a list of points (the boat's buoyancy collar, hand rails)
    bm = bmesh.new()
    pts = [Vector(p) for p in path]
    n = len(pts)
    rings = []
    for i, p in enumerate(pts):
        a = pts[(i - 1) % n] if (closed or i > 0) else p
        b = pts[(i + 1) % n] if (closed or i < n - 1) else p
        d = (b - a).normalized()
        side = d.cross(Vector((0, 0, 1)))
        if side.length < 1e-4:
            side = Vector((1, 0, 0))
        side.normalize()
        up = side.cross(d).normalized()
        rings.append([bm.verts.new(p + (side * math.cos(k / sides * 2 * math.pi) + up * math.sin(k / sides * 2 * math.pi)) * radius) for k in range(sides)])
    for i in range(n if closed else n - 1):
        r0, r1 = rings[i], rings[(i + 1) % n]
        for k in range(sides):
            bm.faces.new((r0[k], r0[(k + 1) % sides], r1[(k + 1) % sides], r1[k]))
    if not closed:
        bm.faces.new(rings[0])
        bm.faces.new(list(reversed(rings[-1])))
    for f in bm.faces:
        f.material_index = ORDER.index(mat)
    return finish(bm, name, True)


def lettering(name, text, where, size, port, mat='Dark', facing_x=False):
    curve = bpy.data.curves.new(name, 'FONT')
    curve.body, curve.size, curve.extrude, curve.align_x = text, size, 0.01, 'CENTER'
    ob = bpy.data.objects.new(name, curve)
    scene.collection.objects.link(ob)
    ob.location = where
    # upright and reading left to right from outside: on the port side it faces +Y, on starboard -Y
    ob.rotation_euler = (math.radians(90), 0, (math.radians(90) if facing_x else (math.radians(180) if port else 0)))
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.convert(target='MESH')
    ob.select_set(False)
    for m in ORDER:
        ob.data.materials.append(MATS[m])
    ob.data.polygons.foreach_set('material_index', [ORDER.index(mat)] * len(ob.data.polygons))
    return ob


def join(name, parts):
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    parts[0].name = parts[0].data.name = name
    return parts[0]


# ================================================================= the fast rescue boat
# A Coast Guard response boat: a deep-V aluminium hull wrapped in a foam collar (in the pilot's colour), an enclosed
# cabin amidships with a radar arch and light bar, an open working deck aft where rescued friends ride, twin outboards.
# Waterline at z = 0, bow at +4.6, transom at -4.0.
def half_width(x):
    t = (x + 4.0) / 8.6           # 0 stern .. 1 bow
    return 1.12 * (1 - max(0.0, (t - 0.55) / 0.45) ** 1.8) + 0.05


def boat():
    stations = []
    for i in range(14):
        x = -4.0 + i * 8.55 / 13
        t = (x + 4.0) / 8.6
        hw = half_width(x)
        rise = 0.22 * max(0.0, (t - 0.6) / 0.4) ** 2           # the bow sweeps up
        stations.append((x, hw, 0.58 + rise * 0.6, 0.18 + rise, 2.2 + 1.2 * (1 - t)))

    def hull_paint(x, side, up):
        # dark bottom, white topsides, and the Coast Guard racing stripe: a broad orange band and a thin blue one
        # leaning back from the bow
        if up < -0.35:
            return 'Dark'
        k = x - 2.3 + up * 0.6
        if abs(side) > 0.3 and 0.0 < k < 0.55:
            return 'Raft'
        if abs(side) > 0.3 and 0.62 < k < 0.78:
            return 'Navy'
        return 'Paint'
    bits = [loft('Hull', stations, hull_paint, ring=28, subdivide=1)]
    # foam collar round the gunwale, from transom corner to transom corner by way of the bow
    path = []
    for i in range(24):
        x = -3.9 + i * 8.35 / 23
        path.append((x, half_width(x) + 0.14, 0.72 + 0.25 * max(0.0, (x - 1.5) / 3.0) ** 2))
    path = list(reversed([(x, -y, z) for x, y, z in path])) + [(4.66, 0, 0.98)] + path
    bits.append(tube('Collar', path, 0.3, 'Accent', 14))
    bits += [slab('Deck', (0.0, 0, 0.62), (7.6, 2.0, 0.08), 'Concrete', 0.01), slab('Transom', (-3.98, 0, 0.45), (0.1, 2.1, 0.7), 'Paint', 0.02)]
    # cabin: white walls with a band of dark glass, a lip of roof, a door aft
    bits += [slab('Cabin', (0.35, 0, 1.45), (2.6, 1.8, 1.6), 'Paint', 0.08), slab('CabinGlass', (0.45, 0, 1.75), (2.5, 1.84, 0.62), 'Glass', 0.03),
             box('Windscreen', [(1.62, -0.88, 1.42), (1.62, 0.88, 1.42), (1.4, 0.88, 2.08), (1.4, -0.88, 2.08)],
                 [(1.68, -0.88, 1.42), (1.68, 0.88, 1.42), (1.46, 0.88, 2.08), (1.46, -0.88, 2.08)], 'Glass', 0.0),
             slab('Roof', (0.3, 0, 2.3), (2.9, 2.0, 0.1), 'Paint', 0.03), slab('Door', (-0.96, 0.3, 1.3), (0.05, 0.7, 1.3), 'Seam', 0.01)]
    bits.append(lettering('Rescue', 'RESCUE', (0.3, 0.915, 1.12), 0.28, True))
    bits.append(lettering('Rescue', 'RESCUE', (0.3, -0.915, 1.12), 0.28, False))
    for side in (1, -1):
        bits.append(lettering('Guard', 'U.S. COAST GUARD', (2.6, side * (half_width(2.6) + 0.02), 0.42), 0.17, side > 0))
    # radar arch over the cabin roof, with the light bar on top and a radar dome
    for side in (1, -1):
        bits += [rod('ArchLeg', (-0.6, side * 0.9, 2.3), (-0.45, side * 0.85, 3.0), 0.06, 'Metal'), rod('ArchLeg', (0.2, side * 0.9, 2.3), (-0.2, side * 0.85, 3.0), 0.06, 'Metal')]
    bits += [rod('ArchTop', (-0.35, -0.85, 3.02), (-0.35, 0.85, 3.02), 0.07, 'Metal'), slab('LightBar', (-0.35, 0, 3.12), (0.24, 1.5, 0.14), 'Dark', 0.02),
             cone('RadarDome', (0.6, 0, 2.35), (0.6, 0, 2.62), 0.32, 0.26, 'Paint'), ball('DomeTop', (0.6, 0, 2.62), (0.26, 0.26, 0.08), 'Paint'),
             rod('Aerial', (-0.1, 0.7, 2.35), (-0.1, 0.7, 4.0), 0.012, 'Dark', 6), rod('Aerial', (-0.1, -0.7, 2.35), (-0.1, -0.7, 3.6), 0.012, 'Dark', 6),
             ball('Searchlight', (1.3, 0, 2.42), (0.15, 0.15, 0.13), 'Metal')]
    # bow rail and grab rails along the cabin; tow post and a life ring on the aft deck
    rail = [(x, sgn * (half_width(x) - 0.12), 1.35) for sgn in (1,) for x in (2.0, 2.8, 3.6, 4.2)]
    bits.append(tube('BowRail', [(x, -y, z) for x, y, z in reversed(rail)] + [(4.45, 0, 1.4)] + rail, 0.035, 'Metal', 8))
    for x in (2.0, 2.8, 3.6):
        for sgn in (1, -1):
            bits.append(rod('Stanchion', (x, sgn * (half_width(x) - 0.12), 0.75), (x, sgn * (half_width(x) - 0.12), 1.35), 0.03, 'Metal', 6))
    for sgn in (1, -1):
        bits.append(rod('GrabRail', (-0.8, sgn * 0.93, 1.9), (1.4, sgn * 0.93, 1.9), 0.025, 'Metal', 6))
    bits += [rod('TowPost', (-3.3, 0, 0.62), (-3.3, 0, 1.25), 0.09, 'Metal'), ball('TowCap', (-3.3, 0, 1.27), (0.12, 0.12, 0.06), 'Metal')]
    bpy.ops.mesh.primitive_torus_add(major_radius=0.3, minor_radius=0.08, major_segments=20, minor_segments=8, location=(-0.98, -0.45, 1.5), rotation=(0, math.pi / 2, 0))
    ring = bpy.context.active_object
    for m in ORDER:
        ring.data.materials.append(MATS[m])
    ring.data.polygons.foreach_set('material_index', [ORDER.index('Raft')] * len(ring.data.polygons))
    bits.append(ring)
    return join('Vehicle_Boat', bits)


def outboard():
    # one outboard engine, built round the point where it hangs on the transom (it swings about Z to steer)
    bits = [loft('Cowl', [(0.32, 0.18, 0.2, 0.42, 2.4), (0.0, 0.3, 0.42, 0.45, 3), (-0.5, 0.28, 0.38, 0.5, 3), (-0.62, 0.2, 0.28, 0.55, 2.4)],
                 lambda x, s, u: 'Dark' if u < -0.6 else 'Paint', ring=20, subdivide=1),
            slab('Leg', (-0.15, 0, -0.35), (0.3, 0.14, 1.0), 'Dark', 0.04), slab('Cavitation', (-0.05, 0, -0.72), (0.6, 0.3, 0.04), 'Dark', 0.01),
            cone('Gearcase', (0.15, 0, -0.95), (-0.35, 0, -0.95), 0.1, 0.08, 'Dark'), slab('Skeg', (-0.25, 0, -1.1), (0.22, 0.04, 0.26), 'Dark', 0.01),
            slab('Clamp', (0.05, 0, 0.05), (0.2, 0.24, 0.3), 'Metal', 0.02)]
    for k in range(3):
        a = k * 2 * math.pi / 3
        bits.append(slab('Blade', (-0.47, 0.13 * math.cos(a), -0.95 + 0.13 * math.sin(a)), (0.06, 0.12, 0.2), 'Metal', 0.01))
    bits[-1].rotation_euler = (0.3, 0, 0)
    return join('Vehicle_BoatMotor', bits)


# ================================================================= the seaplane
# A Coast Guard Beaver on floats: radial engine, high wing on struts, white with the orange band (the pilot's colour)
# and the stripe. The rear cabin roof is open so the friends riding home can be seen. The floats' keels are at
# z = -1.85; the propeller hub is at x = 4.72 (a separate model, Vehicle_PlaneProp).
def plane():
    def skin(x, side, up):
        if x > 3.5:
            return 'Accent'                                   # cowling
        if up < -0.55 and x > -1.0:
            return 'Accent'                                   # belly band
        if abs(side) > 0.5 and 1.85 < x - up * 0.4 < 2.2:
            return 'Raft'
        if abs(side) > 0.5 and 2.26 < x - up * 0.4 < 2.34:
            return 'Navy'
        return 'Paint'
    fus = [(4.62, 0.5, 0.5, 0.0, 2.0), (4.3, 0.66, 0.66, 0.0, 2.2), (3.6, 0.72, 0.74, 0.05, 2.4), (2.6, 0.74, 0.9, 0.15, 3.0),
           (0.8, 0.74, 0.92, 0.15, 3.2), (-0.8, 0.66, 0.82, 0.12, 3.0), (-2.4, 0.42, 0.6, 0.18, 2.6), (-3.8, 0.2, 0.38, 0.3, 2.2), (-4.7, 0.06, 0.25, 0.42, 2.0)]
    bits = [loft('Fuselage', fus, skin, ring=28, subdivide=1)]
    bits += [cone('EngineFace', (4.6, 0, 0), (4.66, 0, 0), 0.47, 0.42, 'Dark', 20), rod('Exhaust', (3.9, 0.55, -0.45), (3.2, 0.62, -0.62), 0.06, 'Metal', 8)]
    for k in range(9):        # the radial's cylinders, just visible inside the cowl
        a = k * 2 * math.pi / 9
        bits.append(rod('Cylinder', (4.58, 0.2 * math.cos(a), 0.2 * math.sin(a)), (4.58, 0.38 * math.cos(a), 0.38 * math.sin(a)), 0.07, 'Metal', 8))
    # glazing: windscreen and cabin windows down each side
    bits.append(box('Windscreen', [(2.95, -0.62, 0.62), (2.95, 0.62, 0.62), (2.45, 0.6, 1.05), (2.45, -0.6, 1.05)],
                    [(3.0, -0.6, 0.62), (3.0, 0.6, 0.62), (2.5, 0.58, 1.05), (2.5, -0.58, 1.05)], 'Glass', 0.0))
    for side in (1, -1):
        for x0, x1 in ((2.4, 1.5), (1.4, 0.5)):
            bits.append(slab('Window', ((x0 + x1) / 2, side * 0.735, 0.62), (x0 - x1 - 0.12, 0.03, 0.5), 'Glass', 0.01))
        bits.append(lettering('Guard', 'COAST GUARD', (-1.2, side * 0.66, -0.15), 0.26, side > 0))
    # the open rear cockpit: a padded coaming in the pilot's colour round a dark well
    bpy.ops.mesh.primitive_torus_add(major_radius=0.82, minor_radius=0.1, major_segments=28, minor_segments=8, location=(-1.3, 0, 0.98))
    coaming = bpy.context.active_object
    for m in ORDER:
        coaming.data.materials.append(MATS[m])
    coaming.data.polygons.foreach_set('material_index', [ORDER.index('Accent')] * len(coaming.data.polygons))
    bits += [coaming, cone('Well', (-1.3, 0, 0.5), (-1.3, 0, 0.97), 0.7, 0.8, 'Dark', 24)]
    # high wing, struts, tail
    for side in (1, -1):
        bits.append(wing('Wing', (2.35, 0.45, 0.0, 1.18, 0.2), (2.15, 0.6, side * 6.1, 1.24, 0.14), 'Paint'))
        bits.append(wing('WingTip', (2.15, 0.6, side * 6.1, 1.24, 0.14), (2.05, 0.75, side * 7.2, 1.26, 0.1), 'Accent'))
        bits.append(rod('Strut', (1.3, side * 0.62, -0.42), (1.2, side * 2.7, 1.1), 0.05, 'Metal', 8))
        bits.append(rod('Strut', (0.6, side * 0.62, -0.42), (0.75, side * 2.7, 1.1), 0.04, 'Metal', 8))
        bits.append(wing('Tailplane', (-3.6, -4.5, 0.0, 0.42, 0.1), (-4.0, -4.65, side * 2.4, 0.42, 0.06), 'Paint'))
        bits.append(wing('Elevator', (-4.5, -4.75, side * 0.1, 0.42, 0.06), (-4.65, -4.85, side * 2.4, 0.42, 0.05), 'Accent'))
    bits.append(box('Fin', [(-3.4, -0.06, 0.55), (-4.75, -0.06, 0.55), (-4.95, -0.04, 2.25), (-4.25, -0.04, 2.25)],
                    [(-3.4, 0.06, 0.55), (-4.75, 0.06, 0.55), (-4.95, 0.04, 2.25), (-4.25, 0.04, 2.25)], 'Accent', 0.03))
    bits.append(box('Rudder', [(-4.75, -0.05, 0.55), (-5.1, -0.05, 0.6), (-5.15, -0.03, 2.1), (-4.95, -0.03, 2.25)],
                    [(-4.75, 0.05, 0.55), (-5.1, 0.05, 0.6), (-5.15, 0.03, 2.1), (-4.95, 0.03, 2.25)], 'Paint', 0.02))
    # floats with their struts and spreader bars, and little water rudders
    for side in (1, -1):
        # (deep floats that stand well clear of the swell: keels at -1.85, decks at about -0.6)
        # (loft builds on the centreline, so each float is moved out under its own struts)
        float_ = loft('Float', [(4.4, 0.08, 0.2, -1.0, 2), (3.6, 0.32, 0.5, -1.22, 2.6), (1.6, 0.4, 0.6, -1.24, 3), (-0.8, 0.38, 0.58, -1.26, 3),
                                (-2.7, 0.26, 0.38, -1.44, 2.6), (-3.3, 0.1, 0.13, -1.6, 2)],
                      lambda x, s, u: 'Dark' if u < -0.5 else 'Paint', ring=20, subdivide=1)
        float_.location.y = side * 1.8
        bits.append(float_)
        y = side * 1.8
        bits += [rod('FloatStrut', (2.4, y, -0.62), (2.2, side * 0.55, -0.45), 0.055, 'Metal', 8), rod('FloatStrut', (-0.5, y, -0.62), (0.2, side * 0.55, -0.45), 0.055, 'Metal', 8),
                 rod('FloatStrut', (2.4, y, -0.62), (0.2, side * 0.55, -0.45), 0.035, 'Metal', 8), slab('WaterRudder', (-3.35, y, -1.62), (0.25, 0.03, 0.32), 'Dark', 0.01)]
    bits += [rod('Spreader', (2.4, 1.8, -0.62), (2.4, -1.8, -0.62), 0.04, 'Metal', 8), rod('Spreader', (-0.5, 1.8, -0.62), (-0.5, -1.8, -0.62), 0.04, 'Metal', 8)]
    return join('Vehicle_Plane', bits)


def propeller():
    # three blades turning about X, with a pointed spinner, built round its own hub
    bits = [cone('Spinner', (0.0, 0, 0), (0.42, 0, 0), 0.24, 0.02, 'Paint', 20)]
    for k in range(3):
        a = k * 2 * math.pi / 3
        blade = wing('Blade', (0.05, -0.08, 0.0, 0.0, 0.06), (0.05, -0.05, 1.3, 0.0, 0.03), 'Dark')
        tip = wing('Tip', (0.05, -0.05, 1.3, 0.0, 0.03), (0.04, -0.04, 1.45, 0.0, 0.02), 'Tip')
        for piece in (blade, tip):
            piece.matrix_world = Matrix.Rotation(a, 4, 'X') @ Matrix.Rotation(0.25, 4, 'Y')
            bits.append(piece)
    return join('Vehicle_PlaneProp', bits)


# ================================================================= scenery
def arch():
    # A sea arch: a great loop of rock standing in the shallows, wide enough to fly a helicopter through.
    # Built from a bent, lumpy tube; its feet go well below the water.
    bm = bmesh.new()
    rings, sides, steps = [], 14, 26
    for i in range(steps + 1):
        t = i / steps
        a = math.pi * (1.15 * t - 0.075)
        centre = Vector((0, 12.0 * math.cos(a), -6 + 21 * math.sin(a)))
        thick = 4.3 + 2.4 * (abs(t - 0.5) * 2) ** 2
        normal = Vector((0, math.cos(a), math.sin(a)))
        row = []
        for k in range(sides):
            b = k / sides * 2 * math.pi
            off = normal * math.cos(b) * thick + Vector((1, 0, 0)) * math.sin(b) * thick * 1.25
            p = centre + off
            p *= 1 + 0.22 * noise.noise(p * 0.18) + 0.08 * noise.noise(p * 0.55)
            row.append(bm.verts.new(p))
        rings.append(row)
    for i in range(steps):
        for k in range(sides):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % sides], rings[i + 1][(k + 1) % sides], rings[i + 1][k]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    for f in bm.faces:
        f.material_index = ORDER.index('Rock')
    return finish(bm, 'World_Arch', True, subdivide=1)


def hut():
    # a fisherman's hut on stilts over the water, with a ladder, a thatched roof and nets hung out to dry
    bits = [slab('Floor', (0, 0, 2.2), (4.2, 3.6, 0.2), 'Deck', 0.03)]
    for x in (-1.9, 0, 1.9):
        for y in (-1.6, 1.6):
            bits.append(rod('Stilt', (x, y, -2.5), (x, y, 2.2), 0.13, 'Bark', 8))
    bits += [slab('Wall', (0.4, 1.3, 3.4), (3.0, 0.1, 2.2), 'Deck', 0.02), slab('Wall', (0.4, -1.3, 3.4), (3.0, 0.1, 2.2), 'Deck', 0.02),
             slab('Wall', (1.9, 0, 3.4), (0.1, 2.6, 2.2), 'Deck', 0.02), slab('Wall', (-1.1, 0.75, 3.4), (0.1, 1.1, 2.2), 'Deck', 0.02),
             slab('Wall', (-1.1, -0.75, 3.4), (0.1, 1.1, 2.2), 'Deck', 0.02), slab('Lintel', (-1.1, 0, 4.3), (0.1, 0.5, 0.4), 'Deck', 0.02),
             slab('Shutter', (0.6, 1.36, 3.6), (0.9, 0.06, 0.7), 'Raft', 0.02), slab('Window', (0.6, 1.33, 3.6), (0.7, 0.04, 0.55), 'Dark', 0.0)]
    for side in (1, -1):
        bits.append(box('Thatch', [(-1.9, 0, 5.9), (2.4, 0, 5.9), (2.4, side * 2.4, 4.2), (-1.9, side * 2.4, 4.2)],
                        [(-1.9, 0, 6.15), (2.4, 0, 6.15), (2.4, side * 2.4, 4.45), (-1.9, side * 2.4, 4.45)], 'LeafDry', 0.05))
    bits += [rod('Ridge', (-2.0, 0, 6.15), (2.5, 0, 6.15), 0.12, 'Bark', 8)]
    for z in range(5):
        bits.append(rod('Rung', (-2.7, -0.4, 0.3 + z * 0.45), (-2.7, 0.4, 0.3 + z * 0.45), 0.04, 'Bark', 6))
    bits += [rod('Rail', (-2.7, -0.4, -0.5), (-2.25, -0.4, 2.3), 0.05, 'Bark', 6), rod('Rail', (-2.7, 0.4, -0.5), (-2.25, 0.4, 2.3), 0.05, 'Bark', 6),
             rod('NetPole', (-1.9, 1.6, 2.2), (-1.9, 2.8, 4.2), 0.05, 'Bark', 6), rod('NetPole', (1.9, 1.6, 2.2), (1.9, 2.8, 4.2), 0.05, 'Bark', 6),
             box('Net', [(-1.9, 2.8, 4.2), (1.9, 2.8, 4.2), (1.9, 2.3, 2.6), (-1.9, 2.3, 2.6)], [(-1.9, 2.84, 4.2), (1.9, 2.84, 4.2), (1.9, 2.34, 2.6), (-1.9, 2.34, 2.6)], 'Seam', 0.0),
             ball('Float', (-1.0, 2.5, 3.0), (0.16, 0.16, 0.16), 'Raft'), ball('Float', (0.6, 2.45, 2.8), (0.16, 0.16, 0.16), 'Tip'),
             ball('Lamp', (-1.25, 0.6, 4.1), (0.1, 0.1, 0.13), 'Glow'), slab('Crate', (1.3, -0.9, 2.55), (0.6, 0.5, 0.5), 'Bleached', 0.02)]
    return join('World_Hut', bits)


def kayak():
    # a sea kayak with its paddle across the cockpit, for a friend paddling about who has run out of puff
    k = loft('Kayak', [(2.4, 0.03, 0.08, 0.15, 2), (1.6, 0.28, 0.18, 0.1, 2.4), (0.0, 0.38, 0.22, 0.08, 2.6), (-1.6, 0.28, 0.17, 0.1, 2.4), (-2.4, 0.03, 0.07, 0.15, 2)],
             lambda x, s, u: 'Paint' if u < -0.3 else 'Tip', ring=20, subdivide=1)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.32, minor_radius=0.05, major_segments=20, minor_segments=6, location=(-0.1, 0, 0.3))
    rim = bpy.context.active_object
    rim.scale = (1.35, 1, 1)
    for m in ORDER:
        rim.data.materials.append(MATS[m])
    rim.data.polygons.foreach_set('material_index', [ORDER.index('Dark')] * len(rim.data.polygons))
    paddle = [rod('Shaft', (0.3, -1.1, 0.42), (0.3, 1.1, 0.42), 0.025, 'Metal', 6), slab('BladeA', (0.3, 1.25, 0.42), (0.18, 0.4, 0.02), 'Accent', 0.01),
              slab('BladeB', (0.3, -1.25, 0.42), (0.18, 0.4, 0.02), 'Accent', 0.01)]
    return join('World_Kayak', [k, rim] + paddle)


# ================================================================= baked shading, size, export
def bake(ob, size=1024):
    others = [o for o in scene.objects if o is not ob and not o.hide_render]
    for o in others:
        o.hide_render = True
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003)
    bpy.ops.object.mode_set(mode='OBJECT')
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 32
    scene.cycles.use_denoising = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new('World')
    scene.world.light_settings.distance = 1.0
    image = bpy.data.images.new('B_' + ob.name, size, size, alpha=False)
    image.colorspace_settings.name = 'Non-Color'
    for m in MATS.values():
        m.use_nodes = True
        nodes = m.node_tree.nodes
        nodes.clear()
        m.node_tree.links.new(nodes.new('ShaderNodeBsdfDiffuse').outputs['BSDF'], nodes.new('ShaderNodeOutputMaterial').inputs['Surface'])
        target = nodes.new('ShaderNodeTexImage')
        target.image = image
        nodes.active = target
    bpy.ops.object.bake(type='AO', margin=6)
    for m in MATS.values():
        m.use_nodes = False
    image.filepath_raw, image.file_format = '%s/B_%s.png' % (OUT, ob.name), 'PNG'
    image.save()
    for o in others:
        o.hide_render = False
    print('BUILD baked %s' % ob.name)


made = [boat(), outboard(), plane(), propeller(), arch(), hut(), kayak()]
for ob in made:
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for ob in made:
    if ob.name in ('Vehicle_Boat', 'Vehicle_Plane', 'World_Hut'):
        bake(ob)
for ob in made:
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.ops.export_scene.fbx(filepath='%s/%s.fbx' % (OUT, ob.name), use_selection=True, object_types={'MESH'}, mesh_smooth_type='FACE')
    print('BUILD %s: %d triangles' % (ob.name, sum(len(p.vertices) - 2 for p in ob.data.polygons)))

# a look for whoever ran this
for i, ob in enumerate(made):
    ob.location = ((0, 0, 0), (-4.4, 0.55, 0.9), (0, 9, 1.9), (4.72, 9, 1.9), (0, -40, 0), (16, 9, 0), (10, -4, 0))[i]
cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
scene.collection.objects.link(cam)
cam.location = (16, -18, 9)
cam.rotation_euler = (Vector((0, 4, 1)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
scene.camera = cam
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light, scene.display.shading.color_type = 'STUDIO', 'MATERIAL'
scene.display.shading.show_cavity = True
for n, c in (('Paint', (0.9, 0.9, 0.88)), ('Accent', (0.9, 0.2, 0.05)), ('Dark', (0.05, 0.05, 0.06)), ('Glass', (0.1, 0.15, 0.2)), ('Metal', (0.5, 0.5, 0.55)),
             ('Raft', (1, 0.35, 0.05)), ('Navy', (0.05, 0.1, 0.35)), ('Deck', (0.4, 0.25, 0.12)), ('Rock', (0.35, 0.33, 0.3)), ('Tip', (0.95, 0.7, 0.05)),
             ('Bark', (0.3, 0.22, 0.15)), ('LeafDry', (0.6, 0.5, 0.25)), ('Concrete', (0.45, 0.45, 0.45))):
    MATS[n].diffuse_color = (*c, 1)
scene.render.resolution_x, scene.render.resolution_y = 1280, 720
scene.render.filepath = OUT + '/preview.png'
bpy.ops.render.render(write_still=True)
