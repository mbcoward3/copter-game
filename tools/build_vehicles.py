# Models the player's fast rescue boat and seaplane, plus the sea arch, stilt hut, and kayak,
# from scratch, with the shade of every crease baked into a picture. Writes FBX + B_<name>.png files that
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


def loft(name, stations, paint, ring=28, subdivide=1, keep=None):
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
            if keep and not keep(xm, math.cos(a), math.sin(a)):
                continue
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
    # Rounded leading edge and thin trailing edge, within the existing chord/thickness envelope.
    bm = bmesh.new()
    samples = (0,.02,.06,.14,.28,.45,.65,.82,.95,1)
    def section(q):
        points = []
        for side, values in ((1,samples),(-1,reversed(samples))):
            for t in values:
                h = q[4] * (5 * (.2969*math.sqrt(t)-.126*t-.3516*t*t+.2843*t**3-.1015*t**4) + .003)
                points.append(bm.verts.new((q[0]+(q[1]-q[0])*t,q[2],q[3]+side*h)))
        return points
    a,b = section(root),section(tip)
    bm.faces.new(list(reversed(a))); bm.faces.new(b)
    for i in range(len(a)):
        bm.faces.new((a[i],a[(i+1)%len(a)],b[(i+1)%len(b)],b[i]))
    for f in bm.faces: f.material_index=ORDER.index(mat)
    return finish(bm,name,True)


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
        # dark bottom, white topsides (the collar, in the pilot's colour, is the stripe)
        if up < -0.35:
            return 'Dark'
        return 'Paint'
    bits = [loft('Hull', stations, hull_paint, ring=28, subdivide=1)]
    # foam collar round the gunwale, from transom corner to transom corner by way of the bow
    path = []
    for i in range(24):
        x = -3.9 + i * 8.35 / 23
        path.append((x, half_width(x) + 0.14, 0.72 + 0.25 * max(0.0, (x - 1.5) / 3.0) ** 2))
    path = list(reversed([(x, -y, z) for x, y, z in path])) + [(4.66, 0, 0.98)] + path
    bits.append(tube('Collar', path, 0.3, 'Accent', 14))
    # (the collar's two ends at the transom, rounded off)
    for x, y, z in (path[0], path[-1]):
        bits.append(ball('CollarEnd', (x, y, z), (0.3, 0.3, 0.3), 'Accent'))
    bits += [slab('Deck', (0.0, 0, 0.62), (7.6, 2.0, 0.08), 'Concrete', 0.01), slab('Transom', (-3.98, 0, 0.45), (0.1, 2.1, 0.7), 'Paint', 0.02)]
    # cabin: white walls with a band of dark glass, a lip of roof, a door aft
    # (the glass sits a little in from the walls, between pillars, with a rubber seal along its top and bottom)
    bits += [slab('Cabin', (0.35, 0, 1.045), (2.6, 1.8, 0.79), 'Paint', 0.06), slab('CabinHead', (0.35, 0, 2.155), (2.6, 1.8, 0.19), 'Paint', 0.04),
             slab('CabinGlass', (0.45, 0, 1.75), (2.5, 1.74, 0.64), 'Glass', 0.0),
             box('Windscreen', [(1.62, -0.88, 1.42), (1.62, 0.88, 1.42), (1.4, 0.88, 2.08), (1.4, -0.88, 2.08)],
                 [(1.68, -0.88, 1.42), (1.68, 0.88, 1.42), (1.46, 0.88, 2.08), (1.46, -0.88, 2.08)], 'Glass', 0.0),
             slab('Roof', (0.3, 0, 2.3), (2.9, 2.0, 0.1), 'Paint', 0.03), slab('Door', (-0.96, 0.3, 1.3), (0.05, 0.7, 1.3), 'Seam', 0.01)]
    bits.append(lettering('Rescue', 'RESCUE', (0.3, 0.915, 1.12), 0.28, True))
    bits.append(lettering('Rescue', 'RESCUE', (0.3, -0.915, 1.12), 0.28, False))
    # Glazing has structural mullions, rubber seals and a readable cabin door.
    for x in (-0.94, -0.3, 0.6, 1.5):
        bits.append(slab('WindowPillar', (x, 0, 1.75), (0.1, 1.8, 0.66), 'Paint', 0.02))
    for side in (-1, 1):
        for z in (1.44, 2.06):
            bits.append(rod('WindowSeal', (-0.95, side * 0.885, z), (1.62, side * 0.885, z), 0.018, 'Rubber', 6))
        bits.append(rod('Cleat', (-2.7, side * 0.8, 0.72), (-2.45, side * 0.8, 0.72), 0.045, 'Metal', 8))
    bits.append(rod('WindshieldPillar',(1.66,0,1.43),(1.44,0,2.08),.035,'Paint',8))
    bits.append(slab('DoorHandle',(-1.01,.52,1.36),(.04,.13,.035),'Metal',.01))
    for side in (1, -1):
        # (low on the topsides, under the collar's overhang but in plain view from the side)
        bits.append(lettering('Guard', 'U.S. COAST GUARD', (1.2, side * (half_width(1.2) + 0.02), 0.12), 0.15, side > 0))
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
    # the cowl: rounded, taller than it is wide, white over a dark lower pan, split level all round
    bits = [loft('Cowl', [(0.3, 0.12, 0.16, 0.5, 2.2), (0.22, 0.24, 0.36, 0.48, 2.6), (0.0, 0.28, 0.42, 0.47, 2.8), (-0.45, 0.27, 0.4, 0.5, 2.8), (-0.6, 0.18, 0.3, 0.53, 2.4), (-0.64, 0.06, 0.12, 0.55, 2.0)],
                 lambda x, s, u: 'Paint', ring=24, subdivide=1),
            slab('LowerPan', (-0.17, 0, 0.13), (0.8, 0.5, 0.17), 'Dark', 0.05),
            slab('Leg', (-0.15, 0, -0.35), (0.3, 0.14, 1.0), 'Dark', 0.04), slab('Cavitation', (-0.05, 0, -0.72), (0.6, 0.3, 0.04), 'Dark', 0.01),
            cone('Gearcase', (0.15, 0, -0.95), (-0.35, 0, -0.95), 0.1, 0.08, 'Dark'), slab('Skeg', (-0.25, 0, -1.1), (0.22, 0.04, 0.26), 'Dark', 0.01),
            slab('Clamp', (0.05, 0, 0.05), (0.2, 0.24, 0.3), 'Metal', 0.02)]
    for k in range(3):
        a = k * 2 * math.pi / 3
        bits.append(slab('Blade', (-0.47, 0.13 * math.cos(a), -0.95 + 0.13 * math.sin(a)), (0.06, 0.12, 0.2), 'Metal', 0.01))
    bits[-1].rotation_euler = (0.3, 0, 0)
    return join('Vehicle_BoatMotor', bits)


# ================================================================= the rescue seaplane
# A Coast Guard rescue flying boat, after the Grumman HU-16 Albatross: a deep boat hull that sits in the water itself,
# a high wing carrying two radial engines, little floats under the wingtips, a tall tail, and a big door in the port
# side of the hull, open, with a small cabin behind it and a step at its sill for whoever is coming aboard. White, with
# the pilot's colour (Accent) on the nose, wingtips and tail and the orange rescue band (Raft) round the hull.
# Front +X, port +Y, up +Z. The keel is at z = -1.83 (the game's PLANE_FLOAT); the waterline about z = -1.4.
# The rudder and elevators are separate models (Vehicle_PlaneRudder, Vehicle_PlaneElevator) built round their hinges.
PLANE_RING = 48
# (x, half beam, half depth, centre z, squareness, deadrise): the forebody runs back to the step at x = 0, where the
# planing bottom ends in a crisp drop; the afterbody's bottom rises from there to the tail
FOREBODY = [(5.9, 0.04, 0.08, -0.3, 2.0, 1.5), (5.72, 0.3, 0.42, -0.38, 2.2, 1.35), (5.4, 0.55, 0.72, -0.5, 2.4, 1.1), (4.95, 0.73, 0.95, -0.6, 2.6, 0.9),
            (4.3, 0.86, 1.1, -0.68, 2.8, 0.7), (3.0, 0.92, 1.16, -0.68, 3.0, 0.5), (1.5, 0.92, 1.16, -0.67, 3.0, 0.42),
            (0.0, 0.9, 1.15, -0.68, 3.0, 0.4)]
AFTERBODY = [(-0.03, 0.88, 0.98, -0.58, 3.0, 0.38), (-1.25, 0.8, 0.92, -0.42, 2.9, 0.36), (-2.2, 0.72, 0.85, -0.3, 2.8, 0.36),
             (-4.2, 0.42, 0.6, 0.05, 2.4, 0.4), (-5.6, 0.15, 0.36, 0.35, 2.0, 0.5)]
DOOR = (-1.25, 0.15, -0.98, 0.22)       # the rescue door's opening in the port side: x from, x to, sill z, head z


def trim(name, path, radius, mat, sides=8, closed=False):
    # a round tube along a path, its cross-sections carried round the bends without twisting (window frames, rims)
    pts = [Vector(p) for p in path]
    n = len(pts)
    tangents = []
    for i in range(n):
        a = pts[(i - 1) % n] if (closed or i > 0) else pts[i]
        b = pts[(i + 1) % n] if (closed or i < n - 1) else pts[i]
        tangents.append((b - a).normalized())
    t0 = tangents[0]
    normal = t0.cross(Vector((0, 0, 1)) if abs(t0.z) < 0.9 else Vector((1, 0, 0))).normalized()
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(pts):
        if i:
            normal = tangents[i - 1].rotation_difference(tangents[i]) @ normal
        other = tangents[i].cross(normal).normalized()
        rings.append([bm.verts.new(p + (normal * math.cos(k / sides * 2 * math.pi) + other * math.sin(k / sides * 2 * math.pi)) * radius) for k in range(sides)])
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


def ring_path(centre, radius, axis, count=24):
    # a circle of points round centre, in the plane across axis ('x' or 'y')
    u, v = ((0, 1, 0), (0, 0, 1)) if axis == 'x' else ((1, 0, 0), (0, 0, 1))
    return [tuple(c + radius * (math.cos(k / count * 2 * math.pi) * a + math.sin(k / count * 2 * math.pi) * b) for c, a, b in zip(centre, u, v)) for k in range(count)]


def hull_point(st, a):
    # one point of a cross-section: a squared-off oval whose bottom is a vee (the deadrise), meeting the sides at a chine
    x, hw, hh, zc, sq, dr = st
    c, n = math.cos(a), math.sin(a)
    y = hw * math.copysign(abs(c) ** (2 / sq), c)
    z = zc + hh * math.copysign(abs(n) ** (2 / sq), n)
    if n < 0:
        z = max(z, zc - hh + abs(y) * dr)
    return Vector((x, y, z))


def smooth_stations(stations, step, extra=()):
    # Catmull-Rom between the stations, about every `step` metres, plus any x asked for (edges that must line up)
    out = []
    for j in range(len(stations) - 1):
        p0, p1, p2, p3 = stations[max(j - 1, 0)], stations[j], stations[j + 1], stations[min(j + 2, len(stations) - 1)]
        span = p1[0] - p2[0]
        ts = [k / max(1, round(span / step)) for k in range(max(1, round(span / step)))]
        ts += [(p1[0] - x) / span for x in extra if p2[0] < x < p1[0]]
        for t in sorted(set(ts)):
            q = [0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t ** 3) for a, b, c, d in zip(p0, p1, p2, p3)]
            q[0] = p1[0] - span * t                                 # (x itself runs evenly, so edges land where asked)
            out.append(tuple(q))
    out.append(stations[-1])
    return out


def plane_hull():
    stations = smooth_stations(FOREBODY, 0.22, (DOOR[1],)) + smooth_stations(AFTERBODY, 0.22, (DOOR[0],))
    bm = bmesh.new()
    angles = [(i + 0.5) / PLANE_RING * 2 * math.pi for i in range(PLANE_RING)]
    rings = [[bm.verts.new(hull_point(st, a)) for a in angles] for st in stations]

    def paint(x, c, n, z):
        if 4.3 < x < 4.95 and n > 0.5:
            return 'Glass'                                        # the windscreen, two panes either side of a post
        if 3.75 < x < 4.45 and 0.15 < n < 0.43:
            return 'Glass'                                        # the cockpit's side windows
        if x > 5.2 + 0.25 * max(0.0, n):
            return 'Accent'                                       # the nose cap, its edge swept back
        if z < -1.36:
            return 'Navy'                                         # the bottom, below a straight waterline
        if 1.2 < x < 1.75:
            return 'Raft'                                         # the rescue band
        return 'Paint'
    for j in range(len(rings) - 1):
        for i in range(PLANE_RING):
            q = (rings[j][i], rings[j][(i + 1) % PLANE_RING], rings[j + 1][(i + 1) % PLANE_RING], rings[j + 1][i])
            mid = sum((v.co for v in q), Vector()) / 4
            zs = [v.co.z for v in q]
            if DOOR[0] < mid.x < DOOR[1] and mid.y > 0.3 and max(zs) > DOOR[2] + 0.02 and min(zs) < DOOR[3] - 0.02:
                continue                                          # (the open door)
            a = (i + 1) / PLANE_RING * 2 * math.pi
            bm.faces.new(q).material_index = ORDER.index(paint(mid.x, math.cos(a), math.sin(a), mid.z))
    bm.faces.new(rings[0]).material_index = ORDER.index('Accent')
    bm.faces.new(list(reversed(rings[-1]))).material_index = ORDER.index('Paint')
    return finish(bm, 'Hull', True), stations


def section_at(stations, x):
    for j in range(len(stations) - 1):
        a, b = stations[j], stations[j + 1]
        if b[0] <= x <= a[0] and a[0] > b[0]:
            t = (a[0] - x) / (a[0] - b[0])
            return tuple(p + (q - p) * t for p, q in zip(a, b))
    return stations[0] if x > stations[0][0] else stations[-1]


def on_hull(stations, x, a, lift=0.012):
    # a point on the hull skin at x and section angle a, lifted a little off it (for trim that sits on the surface)
    st = section_at(stations, x)
    p = hull_point(st, a)
    out = Vector((0, p.y, p.z - st[3])).normalized()
    return p + out * lift


def side_at(stations, x, z, port):
    # the hull's half beam at height z (for things fixed to its side)
    st = section_at(stations, x)
    best = min((abs(hull_point(st, a).z - z), a) for a in [k / 400 * math.pi - math.pi / 2 for k in range(401)])
    return abs(hull_point(st, best[1]).y) * (1 if port else -1)


def porthole(st, x, z, side, r=0.18):
    # a round window that follows the skin: flush glass, and a rim lying on the hull all the way round
    on = lambda dx, dz, lift: Vector((x + dx, side_at(st, x + dx, z + dz, side > 0) + side * lift, z + dz))
    bm = bmesh.new()
    rim = [on(r * math.cos(k / 20 * 2 * math.pi), r * math.sin(k / 20 * 2 * math.pi), 0.002) for k in range(20)]
    centre = bm.verts.new(on(0, 0, 0.003))
    edge = [bm.verts.new(p) for p in rim]
    for k in range(20):
        bm.faces.new((centre, edge[k], edge[(k + 1) % 20])).material_index = ORDER.index('Glass')
    glass = finish(bm, 'Port', True)
    ring = [on((r + 0.02) * math.cos(k / 24 * 2 * math.pi), (r + 0.02) * math.sin(k / 24 * 2 * math.pi), 0.012) for k in range(24)]
    return [glass, trim('PortRim', ring, 0.022, 'Metal', 6, closed=True)]


def plane():
    hull, st = plane_hull()
    bits = [hull]
    A = math.asin
    # the windscreen's frame: its top and bottom edges, the centre post, and the posts at its sides, all lying on the skin
    frame = lambda path, r=0.028: trim('CockpitFrame', path, r, 'Paint')
    top = [on_hull(st, 4.3, a) for a in [A(0.5) + k * (math.pi - 2 * A(0.5)) / 16 for k in range(17)]]
    bits.append(frame(top))
    bits.append(frame([on_hull(st, 4.95, a) for a in [A(0.5) + k * (math.pi - 2 * A(0.5)) / 16 for k in range(17)]]))
    bits.append(frame([on_hull(st, x, math.pi / 2) for x in [4.3 + k * 0.65 / 8 for k in range(9)]]))
    for side in (1, -1):
        edge = lambda x, n: math.atan2(n, side * math.sqrt(1 - n * n))
        bits.append(frame([on_hull(st, x, edge(x, 0.5)) for x in [4.3 + k * 0.65 / 8 for k in range(9)]]))
        # the side window's frame, round its four edges
        lo, hi = edge(0, 0.15), edge(0, 0.43)
        ring = [on_hull(st, 3.75 + k * 0.7 / 8, lo) for k in range(9)] + [on_hull(st, 4.45, lo + (hi - lo) * k / 6) for k in range(1, 7)]
        ring += [on_hull(st, 4.45 - k * 0.7 / 8, hi) for k in range(1, 9)] + [on_hull(st, 3.75, hi - (hi - lo) * k / 6) for k in range(1, 6)]
        bits.append(trim('CockpitFrame', ring, 0.024, 'Paint', closed=True))
        # wipers resting at the foot of each pane
        bits.append(rod('Wiper', on_hull(st, 4.9, edge(4.9, 0.62), 0.03), on_hull(st, 4.62, edge(4.62, 0.82), 0.03), 0.012, 'Dark', 6))
    # portholes: flush glass in a raised metal rim, not bubbles on the skin
    for side in (1, -1):
        for x in (2.8, 2.0, 0.6, -0.9, -1.7):
            if side > 0 and DOOR[0] - 0.3 < x < DOOR[1] + 0.3:
                continue
            bits += porthole(st, x, 0.05, side)
        bits.append(lettering('Guard', 'COAST GUARD', (2.6 if side > 0 else 0.0, side_at(st, 2.6 if side > 0 else 0.0, -0.55, side > 0) + side * 0.01, -0.55), 0.3, side > 0))

    # the cabin behind the door: walls, floor and ceiling, a bench along the far wall, and things a rescue crew carries
    x0, x1, z0, z1 = DOOR
    xm, ys = (x0 + x1) / 2, 0.86
    # (the far wall stands inside the starboard skin all the way up: the hull is narrower at the floor and ceiling)
    yb = -(min(abs(side_at(st, x, z, False)) for x in (x0, xm, x1) for z in (z0 - 0.08, (z0 + z1) / 2, z1 + 0.08)) - 0.06)
    bits += [slab('CabinFloor', (xm, (yb + ys) / 2, z0 - 0.005), (x1 - x0, ys - yb, 0.07), 'Rubber', 0.01),
             slab('CabinCeiling', (xm, (yb + ys) / 2, z1 + 0.03), (x1 - x0, ys - yb, 0.06), 'Seam', 0.0),
             slab('CabinBack', (xm, yb - 0.03, (z0 + z1) / 2), (x1 - x0, 0.06, z1 - z0 + 0.1), 'Seam', 0.0)]
    for x in (x0, x1):
        bits.append(slab('CabinEnd', (x, (yb + ys) / 2, (z0 + z1) / 2), (0.06, ys - yb, z1 - z0 + 0.1), 'Seam', 0.0))
    bits += [slab('Bench', (xm, yb + 0.2, z0 + 0.42), (x1 - x0 - 0.16, 0.4, 0.08), 'Navy', 0.02),
             slab('BenchBack', (xm, yb + 0.05, z0 + 0.75), (x1 - x0 - 0.16, 0.08, 0.5), 'Navy', 0.03),
             slab('BenchLeg', (xm, yb + 0.25, z0 + 0.2), (x1 - x0 - 0.3, 0.05, 0.38), 'Metal', 0.01),
             rod('Extinguisher', (x1 - 0.12, yb + 0.12, z0 + 0.05), (x1 - 0.12, yb + 0.12, z0 + 0.42), 0.06, 'Raft', 10),
             slab('LifeVests', (x0 + 0.25, yb + 0.06, z1 - 0.3), (0.3, 0.08, 0.32), 'Raft', 0.02),
             rod('GrabBar', (x0 + 0.1, ys - 0.1, z1 - 0.12), (x1 - 0.1, ys - 0.1, z1 - 0.12), 0.02, 'Metal', 6)]
    # the door's frame, sill step and grab rails (the frame covers the edge of the opening in the skin)
    yf = side_at(st, xm, (z0 + z1) / 2, True) + 0.01
    bits += [slab('DoorFrame', (xm, yf, z1 + 0.04), (x1 - x0 + 0.14, 0.06, 0.18), 'Raft', 0.01), slab('DoorFrame', (xm, yf, z0 - 0.05), (x1 - x0 + 0.14, 0.06, 0.2), 'Raft', 0.01),
             slab('DoorFrame', (x1, yf, (z0 + z1) / 2), (0.1, 0.06, z1 - z0 + 0.1), 'Raft', 0.01), slab('DoorFrame', (x0, yf, (z0 + z1) / 2), (0.1, 0.06, z1 - z0 + 0.1), 'Raft', 0.01),
             slab('Step', (xm, yf + 0.22, z0 - 0.06), (x1 - x0 - 0.1, 0.42, 0.05), 'Metal', 0.01),
             rod('StepHanger', (x0 + 0.1, yf + 0.4, z0 - 0.06), (x0 + 0.1, yf + 0.02, z0 + 0.25), 0.015, 'Metal', 6),
             rod('StepHanger', (x1 - 0.1, yf + 0.4, z0 - 0.06), (x1 - 0.1, yf + 0.02, z0 + 0.25), 0.015, 'Metal', 6),
             rod('Rail', (x1 + 0.12, yf + 0.04, z0 + 0.1), (x1 + 0.12, yf + 0.04, z1 - 0.05), 0.025, 'Metal', 6),
             rod('Rail', (x0 - 0.12, yf + 0.04, z0 + 0.1), (x0 - 0.12, yf + 0.04, z1 - 0.05), 0.025, 'Metal', 6)]

    # the wing, high on the hull, with the engines on it and floats under the tips
    # (a fairing blends the wing into the top of the hull)
    bits.append(loft('Fairing', [(2.3, 0.05, 0.05, 0.5, 2), (1.9, 0.5, 0.25, 0.52, 2.6), (0.0, 0.55, 0.28, 0.55, 2.8), (-1.2, 0.3, 0.15, 0.45, 2.4), (-1.6, 0.05, 0.03, 0.4, 2)],
                     lambda x, sd, up: 'Paint', ring=20, subdivide=1))
    for side in (1, -1):
        bits.append(wing('Wing', (2.0, -0.4, side * 0.3, 0.72, 0.26), (1.55, 0.35, side * 6.6, 0.95, 0.14), 'Paint'))
        bits.append(wing('WingTip', (1.55, 0.35, side * 6.6, 0.95, 0.14), (1.45, 0.55, side * 7.4, 0.98, 0.1), 'Accent'))
        y = side * 2.5
        # the engine: a cowling with a lip round its mouth, the cylinders' dark face behind it, exhaust stubs, and
        # the nacelle swept back over the wing
        bits += [loft('Nacelle', [(3.2, 0.36, 0.36, 0.75, 2), (3.1, 0.44, 0.44, 0.75, 2.1), (2.6, 0.45, 0.46, 0.75, 2.3), (1.6, 0.42, 0.44, 0.72, 2.4), (-0.4, 0.25, 0.3, 0.8, 2.2), (-1.0, 0.08, 0.1, 0.85, 2)],
                      lambda x, sd, up: 'Accent' if x > 2.75 else 'Paint', ring=24, subdivide=1),
                 cone('Intake', (3.1, y, 0.75), (3.2, y, 0.75), 0.33, 0.33, 'Dark', 20),
                 trim('CowlLip', ring_path((3.2, y, 0.75), 0.36, 'x'), 0.035, 'Accent', closed=True)]
        bits[-3].location.y = y
        for k in (-1, 1):
            bits.append(rod('Exhaust', (2.45, y + k * 0.4, 0.55), (2.1, y + k * 0.46, 0.5), 0.045, 'Metal', 8))
        # the wingtip float, hung on a pair of struts
        fl = loft('TipFloat', [(1.9, 0.05, 0.08, -0.85, 2), (1.5, 0.22, 0.24, -0.9, 2.4), (0.3, 0.26, 0.28, -0.92, 2.6), (-0.6, 0.14, 0.16, -0.88, 2.2), (-0.9, 0.04, 0.05, -0.85, 2)],
                  lambda x, sd, up: 'Accent' if up > 0.3 else 'Paint', ring=16, subdivide=1)
        fl.location.y = side * 6.1
        bits += [fl, rod('FloatStrut', (0.9, side * 6.1, -0.65), (0.9, side * 6.0, 0.9), 0.05, 'Metal', 8), rod('FloatStrut', (0.1, side * 6.1, -0.65), (0.5, side * 6.0, 0.9), 0.04, 'Metal', 8)]
    # the tail: the fin and tailplane, aerofoils like the wing, ending at the hinges of the rudder and elevators
    bits.append(fin('Fin', (-3.55, -5.0, 0.38, 0.22), (-5.0, -5.45, 2.9, 0.1), 'Accent'))
    for side in (1, -1):
        bits.append(wing('Tailplane', (-4.6, -5.5, 0.0, 1.55, 0.12), (-5.1, -5.5, side * 2.8, 1.6, 0.07), 'Paint'))
    bits += [rod('Aerial', (1.2, 0, 0.95), (0.3, 0, 1.6), 0.02, 'Metal', 4)]
    return join('Vehicle_Plane', bits)


def fin(name, root, tip, mat):
    # an upright aerofoil: root and tip are (x front, x back, z, thickness); built as a wing, then stood up
    ob = wing(name, (root[0], root[1], root[2], 0.0, root[3]), (tip[0], tip[1], tip[2], 0.0, tip[3]), mat)
    ob.matrix_world = Matrix.Rotation(math.pi / 2, 4, 'X')
    return ob


# the moving tail surfaces, each built round its own hinge so the game can turn it (see PLANE in model-contracts.json)
RUDDER_HINGE = (-5.0, 0.0, 0.38)
ELEVATOR_HINGE = (-5.5, 0.0, 1.55)


def rudder():
    ob = fin('Rudder', (0.0, -0.5, 0.0, 0.1), (-0.45, -0.85, 2.52, 0.05), 'Accent')
    ob.name = ob.data.name = 'Vehicle_PlaneRudder'
    return ob


def elevator():
    parts = [wing('Elevator', (0.0, -0.34, side * 0.1, 0.0, 0.07), (0.0, -0.3, side * 2.8, 0.05, 0.05), 'Accent') for side in (1, -1)]
    return join('Vehicle_PlaneElevator', parts)


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
    # plank walls: seams between the boards, posts at the corners, and a frame round the window
    for z in (2.62, 3.02, 3.42, 3.82, 4.22):
        for sy in (1, -1):
            bits.append(rod('Plank', (-1.1, sy * 1.36, z), (1.9, sy * 1.36, z), 0.016, 'Bark', 5))
        bits.append(rod('Plank', (1.96, -1.3, z), (1.96, 1.3, z), 0.016, 'Bark', 5))
    for x, y in ((-1.12, 1.32), (-1.12, -1.32), (1.92, 1.32), (1.92, -1.32)):
        bits.append(rod('Post', (x, y, 2.3), (x, y, 4.55), 0.07, 'Bark', 8))
    for (a0, a1) in (((0.12, 1.38, 3.28), (1.08, 1.38, 3.28)), ((0.12, 1.38, 3.92), (1.08, 1.38, 3.92)),
                     ((0.12, 1.38, 3.28), (0.12, 1.38, 3.92)), ((1.08, 1.38, 3.28), (1.08, 1.38, 3.92))):
        bits.append(rod('WindowFrame', a0, a1, 0.035, 'Bark', 6))
    # the thatch: three overlapping rows a side, each lapping over the one below, with eaves past the walls
    for side in (1, -1):
        for k in range(3):
            t0, t1 = k / 3 - 0.04, (k + 1) / 3 + 0.04
            y0, y1 = side * 2.5 * t0, side * 2.5 * t1
            z0, z1 = 6.05 - 1.75 * t0 + 0.07 * (2 - k), 6.05 - 1.75 * t1 + 0.07 * (2 - k)
            bits.append(box('Thatch', [(-2.05, y0, z0), (2.55, y0, z0), (2.55, y1, z1), (-2.05, y1, z1)],
                            [(-2.05, y0, z0 + 0.2), (2.55, y0, z0 + 0.2), (2.55, y1, z1 + 0.2), (-2.05, y1, z1 + 0.2)], 'LeafDry', 0.05))
    bits += [rod('Ridge', (-2.1, 0, 6.3), (2.6, 0, 6.3), 0.13, 'Bark', 8)]
    for z in range(5):
        bits.append(rod('Rung', (-2.7, -0.4, 0.3 + z * 0.45), (-2.7, 0.4, 0.3 + z * 0.45), 0.04, 'Bark', 6))
    bits += [rod('Rail', (-2.7, -0.4, -0.5), (-2.25, -0.4, 2.3), 0.05, 'Bark', 6), rod('Rail', (-2.7, 0.4, -0.5), (-2.25, 0.4, 2.3), 0.05, 'Bark', 6),
             rod('NetPole', (-1.9, 1.6, 2.2), (-1.9, 2.8, 4.2), 0.05, 'Bark', 6), rod('NetPole', (1.9, 1.6, 2.2), (1.9, 2.8, 4.2), 0.05, 'Bark', 6)]
    # the net hung between its poles to dry: a mesh of cord sagging in the middle, its floats caught in it
    net = lambda u, v: (-1.9 + 3.8 * u, 2.8 - 0.5 * v - 0.08 * math.sin(math.pi * u), 4.2 - 1.6 * v - 0.25 * math.sin(math.pi * u) * (1 - v))
    for i in range(9):
        bits.append(tube('NetCord', [net(i / 8, k / 6) for k in range(7)], 0.012, 'Seam', 4))
    for j in range(5):
        bits.append(tube('NetCord', [net(k / 12, j / 4) for k in range(13)], 0.012, 'Seam', 4))
    bits += [ball('Float', net(0.25, 0.75), (0.16, 0.16, 0.16), 'Raft'), ball('Float', net(0.65, 0.85), (0.16, 0.16, 0.16), 'Tip'),
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


made = [boat(), outboard(), plane(), propeller(), arch(), hut(), kayak(), rudder(), elevator()]
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
    ob.location = ((0, 0, 0), (-4.4, 0.55, 0.9), (0, 9, 1.9), (4.72, 9, 1.9), (0, -40, 0), (16, 9, 0), (10, -4, 0), (-5.0, 9, 2.28), (-5.5, 9, 3.45))[i]
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
