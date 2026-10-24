# Models everything the game shows that is not landscape, from scratch: a Coast Guard MH-60T Jayhawk (body, sliding
# cabin door, main rotor, tail rotor), its rescue basket, a life raft, the ten friends who need rescuing, and the
# world's furniture (Coast Guard station, lighthouse, fishing boat, palms, bushes, rocks, buoy).
# Writes FBX files and baked shading for tools/pack_models.py.
# Run with:  blender --background --python tools/build_models.py -- build/models
#
# Dimensions are the real aircraft's in metres (fuselage 15.4 long, 2.36 wide, rotor 16.36 across).
# "s" is the distance back from the nose. Everything is then shrunk by K so the rotor spans the
# 11.2 m the game was tuned around, and placed so the game's reference point (1.95 m above the
# wheels, on the rotor mast) is the origin. Nose is +X; starboard is -Y in Blender.
import math
import os
import random
import sys
import bmesh
import bpy
from mathutils import Matrix, Vector, noise

OUT = sys.argv[sys.argv.index('--') + 1]
os.makedirs(OUT, exist_ok=True)
K = 11.2 / 16.36
MAST_S = 5.2            # the rotor mast, metres back from the nose
REF_Z = 1.95 / K        # the game's reference point above the ground, in real metres
HUB_Z = 3.85            # rotor head above the ground
TAIL_HUB = (15.15, -0.38, 4.55)     # tail rotor: s, y, z

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def material(name, colour, rough, metal=0.0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*colour, 1)
    m.roughness, m.metallic = rough, metal
    return m


# The web game's src/assets.js assigns materials by these names; these colours serve the preview render.
MATS = {m.name: m for m in (
    material('Paint', (0.9, 0.9, 0.88), 0.35), material('Accent', (0.85, 0.08, 0.02), 0.35),
    material('Dark', (0.02, 0.02, 0.025), 0.6), material('Glass', (0.02, 0.04, 0.06), 0.05, 0.9),
    material('Metal', (0.35, 0.36, 0.38), 0.4, 0.9), material('Rubber', (0.015, 0.015, 0.015), 0.9),
    material('Raft', (1.0, 0.25, 0.02), 0.6), material('FurA', (0.8, 0.6, 0.4), 0.8), material('FurB', (0.95, 0.9, 0.8), 0.8),
    material('Navy', (0.02, 0.09, 0.28), 0.4), material('Deck', (0.33, 0.2, 0.1), 0.8), material('Leaf', (0.05, 0.3, 0.04), 0.7),
    material('Rock', (0.2, 0.19, 0.18), 0.9), material('Tip', (0.95, 0.65, 0.02), 0.5),
    material('Bark', (0.3, 0.26, 0.2), 0.9), material('LeafDry', (0.45, 0.36, 0.12), 0.8),
    material('Canopy', (0.05, 0.1, 0.12), 0.05), material('Seam', (0.3, 0.3, 0.3), 0.5), material('Roof', (0.3, 0.38, 0.45), 0.5, 0.3),
    material('Concrete', (0.5, 0.5, 0.48), 0.8), material('Leaf2', (0.03, 0.2, 0.05), 0.7), material('Blush', (1.0, 0.45, 0.5), 0.8), material('Leaf3', (0.12, 0.3, 0.04), 0.7), material('Glow', (1.0, 0.85, 0.4), 0.3),
    material('Bleached', (0.6, 0.56, 0.48), 0.9), material('Dolphin', (0.5, 0.56, 0.64), 0.25),
    # bunting and flags
    material('Whale', (0.14, 0.17, 0.21), 0.3), material('FlagA', (0.9, 0.1, 0.02), 0.8), material('FlagB', (0.9, 0.9, 0.86), 0.8), material('FlagC', (1.0, 0.45, 0.5), 0.8),
    material('FlagD', (1.0, 0.5, 0.02), 0.8), material('FlagE', (0.03, 0.12, 0.4), 0.8))}
ORDER = list(MATS)


def at(s, y, z):
    return Vector((MAST_S - s, y, z))


def finish(bm, name, smooth, subdivide=0, bevel=0.0, recalc=True):
    mesh = bpy.data.meshes.new(name)
    if recalc:
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


def loft(name, stations, paint, ring=32, subdivide=2):
    # A skin stretched over cross-sections. Each station: (s, half width, half height, centre z, squareness).
    # paint(s, side, up) names the material of each panel: side and up run -1..1 across the section.
    bm = bmesh.new()
    rings = []
    for s, hw, hh, zc, sq in stations:
        row = []
        for i in range(ring):
            a = (i + 0.5) / ring * 2 * math.pi
            c, n = math.cos(a), math.sin(a)
            row.append(bm.verts.new(at(s, hw * math.copysign(abs(c) ** (2 / sq), c), zc + hh * math.copysign(abs(n) ** (2 / sq), n))))
        rings.append(row)
    for j in range(len(rings) - 1):
        s_mid = (stations[j][0] + stations[j + 1][0]) / 2
        for i in range(ring):
            a = (i + 1) / ring * 2 * math.pi
            face = bm.faces.new((rings[j][i], rings[j][(i + 1) % ring], rings[j + 1][(i + 1) % ring], rings[j + 1][i]))
            face.material_index = ORDER.index(paint(s_mid, math.cos(a), math.sin(a)))
    for row, s in ((rings[0], stations[0][0]), (rings[-1], stations[-1][0])):
        bm.faces.new(row).material_index = ORDER.index(paint(s, 0, 0))
    return finish(bm, name, True, subdivide)


def box(name, corners_a, corners_b, mat, bevel=0.02):
    # a prism between two quads (each four points going round)
    bm = bmesh.new()
    a = [bm.verts.new(p) for p in corners_a]
    b = [bm.verts.new(p) for p in corners_b]
    bm.faces.new(a)
    bm.faces.new(b)
    for i in range(4):
        bm.faces.new((a[i], a[(i + 1) % 4], b[(i + 1) % 4], b[i]))
    for f in bm.faces:
        f.material_index = ORDER.index(mat)
    return finish(bm, name, False, bevel=bevel)


def slab(name, centre, size, mat, bevel=0.02):
    c, (dx, dy, dz) = Vector(centre), (size[0] / 2, size[1] / 2, size[2] / 2)
    quad = lambda x: [c + Vector((x, -dy, -dz)), c + Vector((x, dy, -dz)), c + Vector((x, dy, dz)), c + Vector((x, -dy, dz))]
    return box(name, quad(-dx), quad(dx), mat, bevel)


def rod(name, a, b, radius, mat, sides=16):
    a, b = Vector(a), Vector(b)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=sides, radius1=radius, radius2=radius, depth=(b - a).length,
                          matrix=Matrix.Translation((a + b) / 2) @ (b - a).to_track_quat('Z', 'Y').to_matrix().to_4x4())
    for f in bm.faces:
        f.material_index = ORDER.index(mat)
    return finish(bm, name, True)


def ball(name, centre, radii, mat):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=1, matrix=Matrix.Translation(centre) @ Matrix.Diagonal((*radii, 1)))
    for f in bm.faces:
        f.material_index = ORDER.index(mat)
    return finish(bm, name, True)


def lettering(name, text, s, y, z, size, port):
    curve = bpy.data.curves.new(name, 'FONT')
    curve.body, curve.size, curve.extrude, curve.align_x = text, size, 0.012, 'CENTER'
    ob = bpy.data.objects.new(name, curve)
    scene.collection.objects.link(ob)
    ob.location = at(s, y, z)
    ob.rotation_euler = (math.radians(90), 0, math.radians(180) if port else 0)     # upright, reading left to right from outside
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.convert(target='MESH')
    ob.select_set(False)
    for m in ORDER:
        ob.data.materials.append(MATS[m])
    ob.data.polygons.foreach_set('material_index', [ORDER.index('Dark')] * len(ob.data.polygons))
    return ob


def join(name, parts):
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    parts[0].name = parts[0].data.name = name
    return parts[0]


# ---------------------------------------------------------------- fuselage
def hull_paint(s, side, up):
    if s < 0.5:
        return 'Dark'                                    # radar nose
    if 1.35 < s < 2.2 and up > 0.1 or 2.36 < s < 3.05 and 0.1 < up < 0.82:
        return 'Canopy'                                  # windscreen wrapping over the top, then the cockpit doors behind a pillar
    if 3.8 < s < 4.9 and side < -0.75 and -0.75 < up < 0.72:
        return 'Dark'                                    # the open starboard doorway; the sliding door covers it
    if (4.1 < s < 4.9 or 5.5 < s < 6.3) and 0.1 < up < 0.62 and abs(side) > 0.75:
        return 'Glass'                                   # cabin windows
    lean = s + up * 0.45                                 # the stripe leans forward as it climbs, like the real one
    if 3.2 < lean < 3.75 and s > 3.06:
        return 'Accent'                                  # the racing stripe behind the cockpit...
    if 3.83 < lean < 3.97 and s > 3.06:
        return 'Navy'                                    # ...and the narrow blue one that follows it
    if s < 1.35 or s > 11.3:
        return 'Accent'                                  # nose and tail
    return 'Paint'


HULL = [
    (0.0, 0.05, 0.05, 1.05, 2), (0.15, 0.32, 0.3, 1.08, 2), (0.5, 0.58, 0.5, 1.12, 2.2), (0.9, 0.85, 0.66, 1.18, 2.4),
    (1.35, 1.05, 0.8, 1.25, 2.6), (1.8, 1.14, 0.95, 1.38, 2.8), (2.2, 1.17, 1.06, 1.48, 3), (2.36, 1.18, 1.09, 1.51, 3),
    (3.05, 1.18, 1.14, 1.58, 3.4), (3.3, 1.18, 1.15, 1.6, 3.6), (3.8, 1.18, 1.15, 1.6, 4), (4.1, 1.18, 1.15, 1.6, 4),
    (4.9, 1.18, 1.15, 1.6, 4), (5.5, 1.18, 1.15, 1.6, 4), (6.3, 1.18, 1.15, 1.6, 4), (7.4, 1.16, 1.14, 1.61, 3.6),
    (8.3, 1.0, 1.0, 1.75, 3), (9.2, 0.72, 0.78, 1.97, 2.6), (10.2, 0.5, 0.6, 2.15, 2.4), (11.3, 0.4, 0.5, 2.3, 2.3),
    (12.6, 0.31, 0.42, 2.45, 2.2), (13.8, 0.24, 0.36, 2.58, 2.2), (14.5, 0.16, 0.26, 2.66, 2)]
hull = loft('Hull', HULL, hull_paint)
parts = [hull]


def section(s):
    # the hull's cross-section at any distance back from the nose
    for a, b in zip(HULL, HULL[1:]):
        if a[0] <= s <= b[0]:
            k = (s - a[0]) / (b[0] - a[0])
            return [a[i] + (b[i] - a[i]) * k for i in range(5)]


def skin(name, stations, mat, keep=lambda s, side, up: True, grow=1.0, ring=32):
    # A strip of surface that follows the hull, a little inside it (grow < 1, facing inward: the cockpit's lining) or
    # lying on it (grow = 1, facing outward: a seam between panels).
    bm = bmesh.new()
    rings = []
    for s, hw, hh, zc, sq in stations:
        rings.append([bm.verts.new(at(s, grow * hw * math.copysign(abs(math.cos(a)) ** (2 / sq), math.cos(a)),
                                      zc + grow * hh * math.copysign(abs(math.sin(a)) ** (2 / sq), math.sin(a))))
                      for a in ((i + 0.5) / ring * 2 * math.pi for i in range(ring))])
    for j in range(len(rings) - 1):
        for i in range(ring):
            a = (i + 1) / ring * 2 * math.pi
            if keep((stations[j][0] + stations[j + 1][0]) / 2, math.cos(a), math.sin(a)):
                quad = (rings[j][i], rings[j][(i + 1) % ring], rings[j + 1][(i + 1) % ring], rings[j + 1][i])
                bm.faces.new(quad if grow < 1 else quad[::-1]).material_index = ORDER.index(mat)
    if grow < 1:      # close the ends, facing in
        bm.faces.new(rings[0][::-1]).material_index = ORDER.index(mat)
        bm.faces.new(rings[-1]).material_index = ORDER.index(mat)
    return finish(bm, name, True, recalc=False)


# The cockpit. The windows are real glass now, so there has to be something behind them: a dark lining wherever the
# skin is not glass, an instrument panel, two seats and the two pilots in their orange suits and white helmets.
parts.append(skin('Lining', [section(s) for s in (1.3, 1.35, 1.8, 2.2, 2.36, 3.05, 3.25)], 'Dark',
                  lambda s, side, up: hull_paint(s, side, up) != 'Canopy', grow=0.93))
parts.append(slab('Panel', at(1.72, 0, 1.52), (0.3, 1.7, 0.42), 'Dark', 0.04))
parts.append(slab('Console', at(2.25, 0, 1.0), (1.0, 0.34, 0.5), 'Dark', 0.04))
for y in (-0.52, 0.52):
    parts.append(slab('SeatBack', at(2.92, y, 1.5), (0.12, 0.5, 1.0), 'Dark', 0.04))
    parts.append(slab('SeatPan', at(2.66, y, 1.02), (0.5, 0.5, 0.12), 'Dark', 0.04))
    parts.append(ball('Pilot', at(2.7, y, 1.48), (0.2, 0.25, 0.36), 'Raft'))
    parts.append(ball('Helmet', at(2.66, y, 2.0), (0.165, 0.16, 0.17), 'Paint'))
    parts.append(ball('Visor', at(2.58, y, 1.99), (0.12, 0.13, 0.1), 'Dark'))

def strake(name, s0, s1, angle, width, mat, steps=10, grow=1.006):
    # a strip running along the hull at one angle round it (degrees: 0 is the port waist, 90 the top)
    bm = bmesh.new()
    rows = []
    for i in range(steps + 1):
        _, hw, hh, zc, sq = section(s0 + (s1 - s0) * i / steps)
        row = []
        for a in (math.radians(angle - width / 2), math.radians(angle + width / 2)):
            c, n = math.cos(a), math.sin(a)
            row.append(bm.verts.new(at(s0 + (s1 - s0) * i / steps, grow * hw * math.copysign(abs(c) ** (2 / sq), c), zc + grow * hh * math.copysign(abs(n) ** (2 / sq), n))))
        rows.append(row)
    for a, b in zip(rows, rows[1:]):
        bm.faces.new((a[0], a[1], b[1], b[0])).material_index = ORDER.index(mat)
    return finish(bm, name, True)


# Frames round the glass: the pillars and sills of the windscreen and cockpit doors, and a frame round each cabin
# window. Without them the glass is just a dark patch painted on the side.
glazed = lambda s, side, up: up > 0.02
for s in (1.35, 2.28, 3.05):
    parts.append(skin('Pillar', [section(s - 0.035), section(s + 0.035)], 'Paint', glazed))
parts += [strake('Spine', 1.35, 2.2, 90, 5, 'Paint'), strake('Brow', 2.2, 3.05, 90, 62, 'Paint')]
for side in (0, 180):
    flip = 1 if side == 0 else -1
    parts += [strake('Sill', 1.35, 3.05, side + flip * 4, 3, 'Paint'), strake('DoorTop', 2.36, 3.05, side + flip * 56, 3, 'Paint'),
              strake('ScreenPost', 1.35, 2.2, side + flip * 52, 3.5, 'Paint')]
    for s0, s1 in ((4.1, 4.9), (5.5, 6.3)):
        parts += [strake('Frame', s0 - 0.03, s1 + 0.03, side + flip * 5, 2, 'Seam'), strake('Frame', s0 - 0.03, s1 + 0.03, side + flip * 39, 2, 'Seam')]
        parts += [skin('Frame', [section(e - 0.02), section(e + 0.02)], 'Seam', lambda s, sd, up, f=flip: 0.06 < up < 0.66 and sd * f > 0.7) for e in (s0, s1)]
    # formation lights: thin pale strips along the boom and behind the cockpit
    parts += [strake('FormationLight', 9.4, 10.6, side + flip * 20, 3, 'Glow'), strake('FormationLight', 3.1, 3.18, side + flip * 30, 14, 'Glow')]
# wipers, door handles, a refuelling probe, cable cutters above and below the nose
parts += [rod('Wiper', at(1.5, y, 1.62), at(1.95, y * 1.25, 2.12), 0.012, 'Dark', 5) for y in (-0.35, 0.35)]
parts += [slab('Handle', at(2.95, y, 1.42), (0.14, 0.03, 0.04), 'Metal', 0.005) for y in (-1.19, 1.19)]
parts += [slab('CableCutter', at(1.9, 0, 2.5), (0.5, 0.03, 0.22), 'Dark', 0.01), slab('CableCutter', at(1.3, 0, 0.48), (0.45, 0.03, 0.2), 'Dark', 0.01),
          rod('Probe', at(0.9, -0.95, 1.0), at(-0.9, -0.95, 1.05), 0.035, 'Metal', 8), ball('ProbeTip', at(-0.95, -0.95, 1.05), (0.07, 0.05, 0.05), 'Dark')]
# engines: a bright lip round each intake and a dark throat, and the oil cooler grille between them
for y in (-0.8, 0.8):
    parts += [rod('IntakeLip', at(5.46, y, 3.05), at(5.54, y, 3.05), 0.23, 'Metal', 16), rod('IntakeThroat', at(5.44, y, 3.05), at(5.5, y, 3.05), 0.17, 'Dark', 16)]
parts += [slab('Grille', at(8.9, 0, 3.22), (0.7, 0.6, 0.04), 'Dark', 0.01)]
# the hoist: its motor housing and the hook hanging ready
parts += [rod('HoistMotor', at(4.05, -1.3, 2.9), at(4.6, -1.3, 2.9), 0.1, 'Paint', 10), ball('HoistHook', at(4.35, -1.62, 2.52), (0.05, 0.05, 0.08), 'Tip')]
# undercarriage: shock struts with bright sliding tubes, and scissor links
for y in (-1.38, 1.38):
    side = math.copysign(1, y)
    parts += [rod('Oleo', at(3.5, y - 0.1 * side, 0.36), at(3.48, 1.18 * side, 0.9), 0.085, 'Paint', 10),
              rod('Scissor', at(3.62, y - 0.1 * side, 0.5), at(3.7, 1.2 * side, 0.85), 0.02, 'Metal', 6), ball('WheelNut', at(3.5, y + 0.15 * side, 0.34), (0.05, 0.03, 0.05), 'Dark')]

# seams where the skin panels and the tail boom sections meet
for s in (0.5, 3.3, 3.8, 4.95, 5.5, 6.3, 7.4, 8.3, 9.2, 10.2, 11.3, 12.6):
    parts.append(skin('Seam', [section(s - 0.012), section(s + 0.012)], 'Seam'))

# the "doghouse" on the roof that carries the gearbox, with an engine each side
parts.append(loft('Doghouse', [(3.2, 0.3, 0.06, 2.74, 2.5), (3.7, 0.75, 0.3, 2.9, 2.5), (4.4, 0.92, 0.46, 2.98, 2.8), (5.2, 0.95, 0.5, 3.0, 2.8),
                               (7.4, 0.95, 0.47, 2.99, 2.8), (8.5, 0.7, 0.34, 2.92, 2.5), (9.3, 0.3, 0.14, 2.74, 2.5)],
                  lambda s, side, up: 'Paint', ring=20))
for y in (-0.8, 0.8):
    parts.append(loft('Engine', [(5.5, 0.2, 0.2, 3.05, 2), (5.7, 0.36, 0.36, 3.05, 2), (7.9, 0.37, 0.37, 3.05, 2), (8.5, 0.27, 0.27, 3.08, 2)],
                      lambda s, side, up: 'Dark' if s < 5.6 or s > 8.3 else 'Paint', ring=16, subdivide=1))
    parts[-1].location.y = y
parts.append(rod('Mast', at(MAST_S, 0, 3.3), at(MAST_S, 0, HUB_Z), 0.15, 'Metal'))

# tail: the swept pylon, the stabilator and the gearbox fairing the tail rotor sits on
fin = lambda s0, s1, z, t: [at(s0, -t, z), at(s1, -t, z), at(s1, t, z), at(s0, t, z)]
parts.append(box('Fin', fin(13.3, 14.6, 2.55, 0.15), fin(14.75, 15.55, 5.05, 0.08), 'Accent', 0.05))
parts.append(slab('Stabilator', at(14.35, 0, 2.72), (1.05, 4.4, 0.09), 'Accent', 0.03))
parts.append(rod('TailGearbox', at(TAIL_HUB[0], 0, TAIL_HUB[2]), at(*TAIL_HUB), 0.14, 'Metal'))

# undercarriage: two main wheels on braced legs and a tail wheel
for y in (-1.38, 1.38):
    side = math.copysign(1, y)
    parts.append(rod('Wheel', at(3.5, y - 0.13 * side, 0.34), at(3.5, y + 0.13 * side, 0.34), 0.34, 'Rubber', 24))
    parts.append(rod('Hubcap', at(3.5, y + 0.11 * side, 0.34), at(3.5, y + 0.14 * side, 0.34), 0.16, 'Metal'))
    parts.append(rod('Leg', at(3.5, y - 0.1 * side, 0.34), at(3.45, 1.0 * side, 1.35), 0.06, 'Metal'))
    parts.append(rod('Brace', at(3.5, y - 0.1 * side, 0.4), at(4.7, 1.05 * side, 0.75), 0.045, 'Metal'))
parts.append(rod('TailWheel', at(11.6, -0.09, 0.2), at(11.6, 0.09, 0.2), 0.2, 'Rubber', 20))
parts.append(rod('TailLeg', at(11.6, 0, 0.2), at(11.4, 0, 1.85), 0.05, 'Metal'))

# what makes it a Jayhawk: the rescue hoist over the starboard door, long-range tanks, radar and camera under the nose
parts.append(slab('HoistArm', at(4.35, -1.3, 2.86), (0.22, 0.75, 0.14), 'Metal'))
parts.append(rod('HoistDrum', at(4.35, -1.62, 2.62), at(4.35, -1.62, 2.92), 0.11, 'Dark'))
for y in (-1.78, 1.78):
    parts.append(ball('Tank', at(7.1, y, 1.3), (1.5, 0.3, 0.3), 'Paint'))
    parts.append(slab('TankPylon', at(7.1, y * 0.82, 1.5), (0.7, 0.75, 0.08), 'Paint'))
parts.append(ball('Radar', at(1.45, 0, 0.5), (0.5, 0.5, 0.2), 'Dark'))
parts.append(ball('Camera', at(0.62, 0, 0.5), (0.19, 0.19, 0.19), 'Dark'))
parts.append(lettering('Rescue', 'RESCUE', 5.2, 1.2, 0.95, 0.5, True))
parts.append(lettering('Service', 'U.S. COAST GUARD', 6.6, 1.2, 2.36, 0.17, True))
parts.append(lettering('Service', 'U.S. COAST GUARD', 6.9, -1.2, 2.36, 0.17, False))
for y in (-0.37, 0.37):
    parts.append(lettering('Number', '6012', 12.1, y, 2.28, 0.26, y > 0))
# the small things: door rails, boarding steps, exhausts, aerials, pitot tubes, lights
for z in (0.6, 2.52):
    parts.append(slab('DoorRail', at(4.9, -1.2, z), (2.5, 0.05, 0.05), 'Metal', 0.01))
for y in (-1.2, 1.2):
    parts.append(slab('Step', at(2.7, y, 0.72), (0.5, 0.16, 0.04), 'Metal', 0.01))
    parts.append(rod('Exhaust', at(8.35, y * 0.67, 3.08), at(8.95, y * 0.85, 3.16), 0.2, 'Dark'))
    parts.append(rod('Pitot', at(1.25, y * 0.3, 1.93), at(0.95, y * 0.3, 1.96), 0.016, 'Metal', 8))
    parts.append(ball('NavLight', at(14.35, y * 1.84, 2.72), (0.07, 0.05, 0.05), 'Accent' if y > 0 else 'Leaf'))
parts.append(slab('Aerial', at(9.0, 0, 2.86), (0.28, 0.03, 0.32), 'Paint', 0.01))
parts.append(slab('Aerial', at(6.2, 0, 0.36), (0.3, 0.03, 0.22), 'Paint', 0.01))
parts.append(rod('Whip', at(12.0, 0, 2.85), at(12.45, 0, 3.6), 0.012, 'Dark', 6))
parts.append(ball('Beacon', at(15.5, 0, 5.1), (0.08, 0.08, 0.07), 'Accent'))
parts.append(ball('Beacon', at(5.0, 0, 0.42), (0.09, 0.09, 0.06), 'Accent'))
parts.append(rod('RotorHead', at(MAST_S, 0, HUB_Z - 0.32), at(MAST_S, 0, HUB_Z - 0.22), 0.34, 'Metal', 20))
body = join('Jayhawk_Body', parts)

# the starboard cabin door, a separate piece so the game can slide it back for the hoist
door = join('Jayhawk_Door', [slab('Door', at(4.35, -1.215, 1.55), (1.16, 0.05, 1.85), 'Paint', 0.015),
                             slab('DoorWindow', at(4.5, -1.245, 1.98), (0.7, 0.02, 0.6), 'Glass', 0.005),
                             lettering('Rescue', 'RESCUE', 4.35, -1.245, 0.85, 0.27, False)])


# ---------------------------------------------------------------- rescue basket and life raft (game-sized, not scaled)
def basket():
    # the Coast Guard's steel rescue basket with its red floats, big enough here for three friends; the lifting eye is 2.9 m up
    L, W, H, r = 1.1, 0.75, 0.9, 0.035
    bits = [slab('Floor', (0, 0, 0.03), (2 * L, 2 * W, 0.04), 'Metal', 0.01)]
    for z in (0.03, H * 0.5, H):
        for y in (-W, W):
            bits.append(rod('Rail', (-L, y, z), (L, y, z), r, 'Metal', 8))
        for x in (-L, L):
            bits.append(rod('Rail', (x, -W, z), (x, W, z), r, 'Metal', 8))
    for x in (-L, -L / 3, L / 3, L):
        for y in (-W, W):
            bits.append(rod('Post', (x, y, 0), (x, y, H), r, 'Metal', 8))
            if abs(x) == L:
                bits.append(rod('Bail', (x, y, H), (0, 0, 2.9), r * 0.8, 'Metal', 8))
    for x in (-L - 0.2, L + 0.2):
        bits.append(rod('FloatBuoy', (x, -W, H - 0.15), (x, W, H - 0.15), 0.21, 'Accent', 16))
    return join('Jayhawk_Basket', bits)


def raft():
    bpy.ops.mesh.primitive_torus_add(major_radius=0.95, minor_radius=0.27, major_segments=40, minor_segments=14, location=(0, 0, 0.2))
    tube = bpy.context.active_object
    for m in ORDER:
        tube.data.materials.append(MATS[m])
    tube.data.polygons.foreach_set('material_index', [ORDER.index('Raft')] * len(tube.data.polygons))
    tube.data.polygons.foreach_set('use_smooth', [True] * len(tube.data.polygons))
    bits = [tube, rod('RaftFloor', (0, 0, 0.1), (0, 0, 0.14), 0.95, 'Dark', 40)]
    # what a real raft carries: seams where the panels are welded, a grab line looped round the outside,
    # reflective patches, a valve, and ribs in the floor
    for i in range(8):
        a = i * math.pi / 4
        c, n = math.cos(a), math.sin(a)
        bpy.ops.mesh.primitive_torus_add(major_radius=0.276, minor_radius=0.014, major_segments=24, minor_segments=6,
                                         location=(0.95 * c, 0.95 * n, 0.2), rotation=(math.pi / 2, 0, a))
        seam = bpy.context.active_object
        for m in ORDER:
            seam.data.materials.append(MATS[m])
        seam.data.polygons.foreach_set('material_index', [ORDER.index('Tip')] * len(seam.data.polygons))
        bits.append(seam)
        b = a + math.pi / 4
        mid = a + math.pi / 8
        bits += [rod('GrabLine', (1.2 * c, 1.2 * n, 0.3), (1.27 * math.cos(mid), 1.27 * math.sin(mid), 0.16), 0.02, 'Paint', 6),
                 rod('GrabLine', (1.27 * math.cos(mid), 1.27 * math.sin(mid), 0.16), (1.2 * math.cos(b), 1.2 * math.sin(b), 0.3), 0.02, 'Paint', 6),
                 ball('Eyelet', (1.2 * c, 1.2 * n, 0.3), (0.045, 0.045, 0.045), 'Metal')]
        if i % 2:
            bits.append(ball('Reflector', (0.95 * c, 0.95 * n, 0.455), (0.13, 0.13, 0.025), 'Paint'))
    bits += [rod('Valve', (-0.95, 0, 0.44), (-0.95, 0, 0.52), 0.04, 'Dark', 10)]
    bits += [rod('FloorRib', (-0.9 * math.cos(t), y, 0.145), (0.9 * math.cos(t), y, 0.145), 0.02, 'Rubber', 6) for y, t in ((-0.5, 0.59), (0, 0), (0.5, 0.59))]
    return join('Jayhawk_Raft', bits)


rescue_basket, life_raft = basket(), raft()


# ---------------------------------------------------------------- the friends (game-sized, facing +X, standing on z = 0)
def cone(name, base, tip, radius, mat):
    base, tip = Vector(base), Vector(tip)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=radius, radius2=0.01, depth=(tip - base).length,
                          matrix=Matrix.Translation((base + tip) / 2) @ (tip - base).to_track_quat('Z', 'Y').to_matrix().to_4x4())
    for f in bm.faces:
        f.material_index = ORDER.index(mat)
    return finish(bm, name, True)


def friend(name, ears=None, muzzle='small', head='FurA', limbs='FurA', eyes=True, extras=()):
    # A round little animal in an orange life vest. FurA and FurB are its two colours, which the game fills in.
    bits = [ball('Body', (0, 0, 0.5), (0.42, 0.4, 0.48), 'FurA'), ball('Tummy', (0.1, 0, 0.47), (0.36, 0.33, 0.42), 'FurB'),
            ball('Vest', (-0.02, 0, 0.62), (0.45, 0.45, 0.23), 'Raft'), ball('Head', (0.06, 0, 1.14), (0.4, 0.42, 0.38), head)]
    for y in (-1, 1):
        bits += [ball('Foot', (0.22, 0.2 * y, 0.08), (0.2, 0.14, 0.1), limbs), ball('Arm', (0.14, 0.43 * y, 0.6), (0.13, 0.12, 0.2), limbs)]
        # the life vest: two padded front panels, a strap over each shoulder, a strip that shines in the searchlight
        bits += [ball('VestPanel', (0.3, 0.17 * y, 0.64), (0.14, 0.15, 0.2), 'Raft'), ball('VestStrip', (0.415, 0.17 * y, 0.7), (0.03, 0.09, 0.03), 'Paint'),
                 rod('VestStrap', (0.27, 0.2 * y, 0.8), (-0.2, 0.22 * y, 0.84), 0.05, 'Raft', 8)]
        if eyes:
            bits += [ball('Eye', (0.4, 0.15 * y, 1.2), (0.065, 0.065, 0.08), 'Dark'), ball('Glint', (0.452, 0.13 * y, 1.24), (0.022, 0.022, 0.022), 'Paint'),
                     ball('Glint', (0.447, 0.165 * y, 1.17), (0.011, 0.011, 0.011), 'Paint')]
        if muzzle in ('small', 'snout', 'pig'):
            bits.append(ball('Blush', (0.33, 0.27 * y, 1.07), (0.05, 0.07, 0.05), 'Blush'))
        if ears == 'long':
            bits += [ball('Ear', (0, 0.17 * y, 1.75), (0.08, 0.11, 0.34), 'FurA'), ball('EarInside', (0.05, 0.17 * y, 1.75), (0.05, 0.07, 0.27), 'FurB')]
        elif ears == 'pointy':
            bits.append(cone('Ear', (0, 0.24 * y, 1.38), (0, 0.31 * y, 1.8), 0.17, 'FurA'))
        elif ears == 'floppy':
            bits.append(ball('Ear', (0, 0.42 * y, 1.1), (0.11, 0.08, 0.27), 'FurB'))
        elif ears == 'round':
            bits.append(ball('Ear', (0, 0.3 * y, 1.48), (0.15, 0.13, 0.15), 'FurB'))
        elif ears == 'small':
            bits.append(cone('Ear', (0, 0.25 * y, 1.4), (0.06, 0.36 * y, 1.66), 0.13, 'FurA'))
    if muzzle == 'small':
        bits += [ball('Cheeks', (0.34, 0, 1.04), (0.12, 0.2, 0.1), 'FurB'), ball('Nose', (0.45, 0, 1.1), (0.045, 0.055, 0.04), 'Dark')]
    elif muzzle == 'snout':
        bits += [ball('Snout', (0.42, 0, 1.05), (0.17, 0.18, 0.13), 'FurB'), ball('Nose', (0.58, 0, 1.1), (0.055, 0.065, 0.05), 'Dark')]
    elif muzzle == 'pig':
        bits.append(rod('Snout', (0.38, 0, 1.06), (0.5, 0, 1.06), 0.14, 'FurB', 20))
        bits += [ball('Nostril', (0.5, 0.05 * y, 1.07), (0.02, 0.03, 0.04), 'Dark') for y in (-1, 1)]
    elif muzzle == 'beak':
        bits.append(cone('Beak', (0.38, 0, 1.08), (0.7, 0, 1.04), 0.13, 'Tip'))
    bits += [ball('VestCollar', (-0.06, 0, 0.86), (0.3, 0.33, 0.1), 'Raft'), slab('VestBelt', (0.02, 0, 0.5), (0.9, 0.9, 0.05), 'Dark', 0.02),
             slab('Buckle', (0.44, 0, 0.5), (0.04, 0.1, 0.08), 'Metal', 0.01), rod('Whistle', (0.4, 0.3, 0.74), (0.44, 0.3, 0.64), 0.022, 'Tip', 8)]
    bits[-3].scale = (0.5, 0.5, 1)
    bits.append(ball('Tail', (-0.42, 0, 0.36), (0.12, 0.12, 0.12), 'FurB' if ears in ('long', 'floppy') else 'FurA'))
    return join('Friend_' + name, bits + [ball(*e) for e in extras])


both = lambda make: [make(y) for y in (-1, 1)]
friends = [
    friend('Bunny', 'long'),
    friend('Kitty', 'pointy'),
    friend('Puppy', 'floppy', 'snout'),
    friend('Chick', None, 'beak', extras=[('Tuft', (0, 0, 1.55), (0.07, 0.07, 0.12), 'FurA')]),
    friend('Piggy', 'small', 'pig'),
    friend('Lamb', 'floppy', 'small', head='FurB', limbs='FurB',
           extras=[('Wool', (-0.02, 0.16 * y, 1.46), (0.2, 0.2, 0.18), 'FurA') for y in (-1, 0, 1)]),
    friend('Panda', 'round', 'small', limbs='FurB', extras=both(lambda y: ('Patch', (0.35, 0.16 * y, 1.2), (0.08, 0.11, 0.14), 'FurB'))),
    friend('Fox', 'pointy', 'snout'),
    friend('Frog', None, None, eyes=False, extras=both(lambda y: ('Eye', (0.14, 0.21 * y, 1.5), (0.15, 0.15, 0.15), 'Paint'))
           + both(lambda y: ('Pupil', (0.26, 0.21 * y, 1.53), (0.07, 0.07, 0.08), 'Dark')) + [('Smile', (0.36, 0, 1.0), (0.1, 0.26, 0.03), 'Dark')]),
    friend('Penguin', None, 'beak'),
]


# ---------------------------------------------------------------- rotors (modelled around their own hubs)
def blade(length, root, chord, thick, sweep):
    # one blade along +X from the hub, leading edge +Y, with the swept tip Black Hawk blades have
    bm = bmesh.new()
    rows = []
    for r, back, mat in ((root, 0, 'Dark'), (length * 0.9, 0, 'Dark'), (length * 0.93, 0, 'Tip'), (length, sweep, 'Tip')):
        rows.append(([bm.verts.new((r, chord * 0.35 - back, thick / 2)), bm.verts.new((r, -chord * 0.65 - back, thick * 0.1)),
                      bm.verts.new((r, -chord * 0.65 - back, -thick * 0.1)), bm.verts.new((r, chord * 0.35 - back, -thick / 2))], mat))
    for (a, _), (b, mat) in zip(rows, rows[1:]):
        for i in range(4):
            bm.faces.new((a[i], a[(i + 1) % 4], b[(i + 1) % 4], b[i])).material_index = ORDER.index(mat)
    bm.faces.new(rows[0][0])
    bm.faces.new(rows[-1][0]).material_index = ORDER.index('Tip')
    return finish(bm, 'Blade', False)


def rotor(name, length, root, chord, thick, sweep, hub_r, hub_h):
    pieces = [rod('Hub', (0, 0, -hub_h / 2), (0, 0, hub_h / 2), hub_r, 'Metal', 20),
              rod('HubCap', (0, 0, hub_h / 2), (0, 0, hub_h / 2 + hub_h * 0.5), hub_r * 0.55, 'Dark', 16),             # the bifilar vibration absorber
              rod('Swashplate', (0, 0, -hub_h * 1.5), (0, 0, -hub_h * 1.3), hub_r * 1.25, 'Dark', 20)]
    for i in range(4):
        turn = Matrix.Rotation(math.radians(90 * i), 4, 'Z')
        for piece in (blade(length, root, chord, thick, sweep), rod('Cuff', (hub_r * 0.8, 0, 0), (root + 0.05, 0, 0), thick * 1.6, 'Metal', 10),
                      rod('PitchLink', (hub_r * 1.1, hub_r * 0.5, -hub_h * 1.3), (root * 0.75, chord * 0.5, -thick), thick * 0.5, 'Metal', 6),
                      rod('Damper', (hub_r * 0.7, -hub_r * 0.7, 0), (root * 0.8, -chord * 0.3, 0), thick * 0.9, 'Dark', 8),
                      slab('BladeGrip', (root + 0.12, 0, 0), (0.3, chord * 0.8, thick * 2.4), 'Metal', 0.01)):
            piece.matrix_world = turn
            pieces.append(piece)
    return join(name, pieces)


main_rotor = rotor('Jayhawk_MainRotor', 8.18, 1.0, 0.53, 0.06, 0.35, 0.38, 0.32)
tail_rotor = rotor('Jayhawk_TailRotor', 1.675, 0.3, 0.25, 0.03, 0.0, 0.12, 0.2)
tail_rotor.matrix_world = Matrix.Rotation(math.radians(90), 4, 'X')        # stood up on its side: it spins about Y


# ---------------------------------------------------------------- the world's furniture (game-sized, standing on z = 0)
def drum(name, z0, z1, r0, r1, mat, centre=(0, 0), sides=24):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=sides, radius1=r0, radius2=max(r1, 0.01), depth=z1 - z0,
                          matrix=Matrix.Translation((centre[0], centre[1], (z0 + z1) / 2)))
    for f in bm.faces:
        f.material_index = ORDER.index(mat)
    return finish(bm, name, True)


def sign(name, text, where, size, mat):
    # lettering standing upright and facing +X
    curve = bpy.data.curves.new(name, 'FONT')
    curve.body, curve.size, curve.extrude, curve.align_x = text, size, 0.03, 'CENTER'
    ob = bpy.data.objects.new(name, curve)
    scene.collection.objects.link(ob)
    ob.location, ob.rotation_euler = where, (math.radians(90), 0, math.radians(90))
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.convert(target='MESH')
    ob.select_set(False)
    for m in ORDER:
        ob.data.materials.append(MATS[m])
    ob.data.polygons.foreach_set('material_index', [ORDER.index(mat)] * len(ob.data.polygons))
    return ob


def station():
    # the Coast Guard air station: a hangar with its door facing the helipads (+X), offices, a control tower and a flag
    roof = rod('Roof', (0, -11.3, 7 / 0.3), (0, 11.3, 7 / 0.3), 6.25, 'Roof', 32)
    roof.scale = (1, 1, 0.3)                                    # squashed into a low barrel vault
    bits = [slab('Hangar', (0, 0, 3.5), (12, 22, 7), 'Paint', 0.05), roof,
            slab('Plinth', (0, 0, 0.3), (12.3, 22.3, 0.6), 'Concrete', 0.03), slab('Apron', (9.2, -0.5, 0.05), (6.2, 21, 0.1), 'Concrete', 0.02),
            slab('Stripe', (-6.03, 0, 6.25), (0.08, 22, 1.1), 'Accent', 0.01),
            # the offices: a low block on the end of the hangar, with its own door, windows and plant on the roof
            slab('Offices', (-0.5, -14, 1.9), (9, 6, 3.8), 'Paint', 0.05), slab('OfficeRoof', (-0.5, -14, 3.9), (9.6, 6.6, 0.25), 'Roof', 0.03),
            slab('OfficeDoor', (4.03, -15.6, 1.1), (0.08, 1.1, 2.2), 'Accent', 0.01), slab('Cooler', (-2.5, -14.5, 4.4), (1.6, 1.2, 0.8), 'Metal', 0.05),
            slab('Cooler', (0.5, -13.2, 4.3), (1.0, 1.0, 0.6), 'Metal', 0.05), slab('Tank', (-4.2, 14.9, 0.9), (2.6, 1.3, 1.5), 'Metal', 0.3)]
    for i in range(9):
        y = -10 + i * 2.5
        rib = rod('RoofRib', (0, y - 0.07, 7 / 0.3), (0, y + 0.07, 7 / 0.3), 6.31, 'Metal', 32)
        rib.scale = (1, 1, 0.3)
        bits += [rib, slab('Pier', (-6.06, y, 3.6), (0.14, 0.3, 6.6), 'Concrete', 0.02), slab('HighWindow', (-6.04, y + 1.25, 5.0), (0.08, 1.5, 0.8), 'Glass', 0.01)]
    for side in (-1, 1):
        bits += [slab('Stripe', (0, side * 11.03, 6.25), (12, 0.08, 1.1), 'Accent', 0.01), slab('Gutter', (side * 6.15, 0, 7.0), (0.25, 22.6, 0.2), 'Metal', 0.03)]
        bits += [slab('Pier', (x, side * 11.06, 3.6), (0.3, 0.14, 6.6), 'Concrete', 0.02) for x in (-5.85, -2.9, 0, 2.9, 5.85)]
    bits += [drum('Vent', 8.7, 9.4, 0.4, 0.4, 'Metal', (0, y), 12) for y in (-6, 0, 6)] + [drum('VentCap', 9.4, 9.6, 0.6, 0.3, 'Metal', (0, y), 12) for y in (-6, 0, 6)]
    bits += [slab('OfficeWindow', (4.03, y, 2.1), (0.06, 1.5, 1.2), 'Glass', 0.01) for y in (-12.2, -13.9)]
    bits += [slab('OfficeWindow', (x, -17.03, 2.1), (1.5, 0.06, 1.2), 'Glass', 0.01) for x in (-3.4, -0.8, 1.8)]
    # the control tower: plinth, door, slit windows, a walkway with a rail, and glazing bars round the cab
    bits += [drum('TowerFoot', 0, 0.7, 2.1, 1.9, 'Concrete', (-1, 13.6)), slab('TowerDoor', (0.72, 13.6, 1.5), (0.1, 0.9, 2.0), 'Accent', 0.01),
             drum('Walkway', 10.7, 10.95, 3.1, 3.1, 'Metal', (-1, 13.6)), drum('Dish', 13.9, 14.0, 0.7, 0.5, 'Paint', (-0.2, 13.0), 16)]
    bits += [slab('TowerSlit', (0.63, 13.6, z), (0.1, 0.5, 1.1), 'Glass', 0.01) for z in (4.5, 7.5)]
    posts = [(-1 + 3.0 * math.cos(i * math.pi / 8), 13.6 + 3.0 * math.sin(i * math.pi / 8)) for i in range(16)]
    for (x0, y0), (x1, y1) in zip(posts, posts[1:] + posts[:1]):
        bits += [rod('RailPost', (x0, y0, 10.95), (x0, y0, 12.0), 0.035, 'Metal', 6), rod('Rail', (x0, y0, 12.0), (x1, y1, 12.0), 0.035, 'Metal', 6)]
    bits += [rod('Glazing', (-1 + 2.34 * math.cos(i * math.pi / 6), 13.6 + 2.34 * math.sin(i * math.pi / 6), 11),
                 (-1 + 2.64 * math.cos(i * math.pi / 6), 13.6 + 2.64 * math.sin(i * math.pi / 6), 13.2), 0.05, 'Paint', 6) for i in range(12)]
    bits += [
            slab('Door', (6.02, -3, 2.85), (0.1, 11, 5.5), 'Dark', 0.02), slab('Stripe', (6.03, 0, 6.25), (0.08, 22, 1.1), 'Accent', 0.01),
            sign('Name', 'COAST GUARD', (6.1, 0, 5.95), 0.75, 'Paint'),
            drum('Tower', 0, 11, 1.7, 1.5, 'Paint', (-1, 13.6)), drum('Cab', 11, 13.2, 2.3, 2.6, 'Glass', (-1, 13.6)),
            drum('CabRoof', 13.2, 13.6, 2.8, 2.6, 'Accent', (-1, 13.6)), rod('Aerial', (-1, 13.6, 13.6), (-1, 13.6, 17), 0.05, 'Metal', 8),
            rod('Flagpole', (8, -17.5, 0), (8, -17.5, 10), 0.08, 'Metal', 10), slab('Flag', (8, -16.55, 9.35), (0.04, 1.8, 1.1), 'FlagA', 0.005)]
    bits += [slab('Window', (6.03, y, 2.3), (0.06, 1.7, 1.4), 'Glass', 0.01) for y in (5.0, 7.4, 9.8)]
    return join('World_Station', bits)


def lighthouse():
    bands, top, r0, r1 = 5, 26.0, 3.3, 2.1
    radius = lambda z: r0 + (r1 - r0) * z / top
    bits = [drum('Band', top * i / bands, top * (i + 1) / bands, radius(top * i / bands), radius(top * (i + 1) / bands), 'Accent' if i % 2 else 'Paint', sides=32)
            for i in range(bands)]
    bits += [drum('Gallery', top, top + 0.4, 3.2, 3.2, 'Metal', sides=32), drum('Lantern', top + 0.4, top + 3.4, 1.7, 1.7, 'Glass'),
             drum('Cap', top + 3.4, top + 5.4, 2.2, 0, 'Accent'), slab('Door', (3.2, 0, 1.1), (0.3, 1.2, 2.2), 'Dark', 0.02),
             drum('Foot', -0.5, 1.0, 4.3, 3.6, 'Concrete', sides=32), drum('Corbel', top - 0.9, top, 2.3, 3.1, 'Paint', sides=32),
             drum('LanternSill', top + 0.4, top + 0.9, 1.85, 1.85, 'Paint'), ball('Finial', (0, 0, top + 5.5), (0.22, 0.22, 0.22), 'Metal'),
             rod('Rod', (0, 0, top + 5.5), (0, 0, top + 7.2), 0.03, 'Metal', 6), slab('DoorHood', (3.3, 0, 2.4), (0.6, 1.6, 0.15), 'Concrete', 0.02)]
    ring = [(3.05 * math.cos(i * math.pi / 10), 3.05 * math.sin(i * math.pi / 10)) for i in range(20)]
    for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
        bits += [rod('RailPost', (x0, y0, top + 0.4), (x0, y0, top + 1.5), 0.035, 'Metal', 6), rod('Rail', (x0, y0, top + 1.5), (x1, y1, top + 1.5), 0.035, 'Metal', 6)]
    bits += [rod('Glazing', (1.72 * math.cos(i * math.pi / 4), 1.72 * math.sin(i * math.pi / 4), top + 0.9),
                 (1.72 * math.cos(i * math.pi / 4), 1.72 * math.sin(i * math.pi / 4), top + 3.4), 0.05, 'Dark', 6) for i in range(8)]
    # a window on each landing of the stair that winds up inside, each in a stone surround with a sill
    for i, z in enumerate((6.0, 11.5, 17.0, 22.0)):
        a = i * 1.9
        for piece in (slab('Window', (radius(z) + 0.02, 0, z), (0.2, 0.6, 1.1), 'Glass', 0.02),
                      slab('Surround', (radius(z) - 0.06, 0, z), (0.2, 0.9, 1.4), 'Concrete', 0.03),
                      slab('Sill', (radius(z) + 0.05, 0, z - 0.72), (0.3, 1.05, 0.1), 'Concrete', 0.02)):
            piece.matrix_world = Matrix.Rotation(a, 4, 'Z') @ piece.matrix_world
            bits.append(piece)
    # what a builder adds and a toy leaves off: a stone course where each band of paint meets the next, a second rail
    # and a kick plate round the gallery, brackets under it, ribs and a vent on the lantern roof, steps up to the door
    bits += [drum('Course', z - 0.09, z + 0.09, radius(z) + 0.07, radius(z) + 0.07, 'Concrete', sides=32) for z in (top * i / bands for i in range(1, bands))]
    for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
        bits += [rod('MidRail', (x0, y0, top + 0.95), (x1, y1, top + 0.95), 0.025, 'Metal', 6)]
    bits += [drum('KickPlate', top + 0.4, top + 0.55, 3.12, 3.12, 'Metal', sides=32)]
    for i in range(12):
        a = i * math.pi / 6
        bits += [rod('Bracket', (2.25 * math.cos(a), 2.25 * math.sin(a), top - 1.5), (3.1 * math.cos(a), 3.1 * math.sin(a), top - 0.05), 0.07, 'Metal', 6),
                 rod('RoofRib', (2.18 * math.cos(a), 2.18 * math.sin(a), top + 3.42), (0.1 * math.cos(a), 0.1 * math.sin(a), top + 5.32), 0.04, 'Metal', 6)]
    bits += [drum('Vent', top + 5.3, top + 5.6, 0.3, 0.2, 'Metal', sides=12), drum('LanternBase', top + 0.9, top + 1.0, 1.95, 1.95, 'Metal'),
             slab('Step', (4.25, 0, 0.75), (0.5, 1.8, 0.25), 'Concrete', 0.02), slab('Step', (4.7, 0, 0.5), (0.5, 2.0, 0.25), 'Concrete', 0.02),
             slab('DoorFrame', (3.12, 0, 1.2), (0.3, 1.5, 2.5), 'Concrete', 0.03), ball('DoorLamp', (3.55, 0, 2.2), (0.09, 0.09, 0.12), 'Glow')]
    return join('World_Lighthouse', bits)


def boat(name='World_Boat', title='MARY ANN', trawler=False):
    # a little fishing boat: blue hull, white wheelhouse up front, open deck aft where the crew wait for the basket
    hull = loft('Hull', [(0.0, 0.05, 0.5, 1.0, 2), (1.0, 0.9, 0.8, 0.6, 2.2), (3.0, 1.9, 0.9, 0.45, 2.6), (7.0, 2.2, 0.9, 0.4, 3),
                         (12.0, 2.1, 0.85, 0.45, 3), (14.0, 1.8, 0.7, 0.6, 2.6)], lambda s, side, up: 'Paint' if up > 0.7 else 'Accent' if up < -0.45 else 'Navy', ring=24)      # red below the waterline
    bits = [hull, slab('Deck', at(7.6, 0, 1.2), (11.5, 3.7, 0.1), 'Deck', 0.02),
            slab('Wheelhouse', at(4.3, 0, 2.3), (2.8, 2.6, 2.2), 'Paint', 0.06), slab('Windows', at(4.3, 0, 2.75), (2.86, 2.66, 0.7), 'Glass', 0.02),
            slab('HouseRoof', at(4.3, 0, 3.45), (3.2, 3.0, 0.12), 'Navy', 0.03), rod('Mast', at(6.2, 0, 1.2), at(6.2, 0, 6.5), 0.07, 'Metal', 10),
            rod('Boom', at(6.2, 0, 4.6), at(10.5, 0, 3.4), 0.05, 'Metal', 8), drum('Winch', 1.2, 1.9, 0.4, 0.4, 'Metal', (MAST_S - 12.8, 0))]
    def ring(name, centre, major, minor, mat, flat_to='Y'):
        bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=20, minor_segments=8, location=centre,
                                         rotation=(math.pi / 2, 0, 0) if flat_to == 'Y' else (0, 0, 0))
        ob = bpy.context.active_object
        for m in ORDER:
            ob.data.materials.append(MATS[m])
        ob.data.polygons.foreach_set('material_index', [ORDER.index(mat)] * len(ob.data.polygons))
        ob.data.polygons.foreach_set('use_smooth', [True] * len(ob.data.polygons))
        return ob

    # A working boat, not a bath toy: bulwarks with a wooden cap rail round the deck, a rail at the bow, old tyres for
    # fenders, life rings, a radar, lamps, an exhaust stack and the clutter of fishing: boxes, a net and its drum.
    for y in (-1.9, 1.9):
        side = math.copysign(1, y)
        bits += [slab('Bulwark', at(8.4, y, 1.45), (10.4, 0.08, 0.5), 'Navy', 0.01), slab('CapRail', at(8.4, y, 1.72), (10.5, 0.16, 0.06), 'Deck', 0.01)]
        bits += [slab('Stanchion', at(s, y - 0.06 * side, 1.45), (0.07, 0.07, 0.5), 'Paint', 0.005) for s in (4, 5.5, 7, 8.5, 10, 11.5, 13)]
        bits += [ring('Fender', at(s, y + 0.2 * side, 0.95), 0.3, 0.12, 'Rubber') for s in (5.0, 8.5, 12.0)]
        bits += [rod('FenderRope', at(s, y + 0.12 * side, 1.25), at(s, y, 1.72), 0.02, 'Deck', 6) for s in (5.0, 8.5, 12.0)]
        bits.append(ring('LifeRing', at(4.6, 1.36 * side, 2.0), 0.3, 0.085, 'Raft'))
        bits.append(ball('NavLight', at(3.6, 1.2 * side, 3.6), (0.09, 0.07, 0.07), 'Accent' if side > 0 else 'Leaf'))
        bits += [rod('BowPost', at(s, w * side, 1.25), at(s, w * side, 2.0), 0.03, 'Metal', 6) for s, w in ((1.0, 0.75), (2.0, 1.35), (3.0, 1.75))]
        bits += [rod('BowRail', at(1.0, 0.75 * side, z), at(2.0, 1.35 * side, z), 0.03, 'Metal', 6) for z in (1.62, 2.0)]
        bits += [rod('BowRail', at(2.0, 1.35 * side, z), at(3.0, 1.75 * side, z), 0.03, 'Metal', 6) for z in (1.62, 2.0)]
        bits.append(lettering('BoatName', title, 4.3, 1.315 * side, 1.62, 0.3, side > 0))
    bits += [rod('BowRail', at(1.0, -0.75, z), at(1.0, 0.75, z), 0.03, 'Metal', 6) for z in (1.62, 2.0)]
    bits += [slab('Transom', at(13.6, 0, 1.45), (0.08, 3.8, 0.5), 'Navy', 0.01), slab('TransomRail', at(13.6, 0, 1.72), (0.16, 3.9, 0.06), 'Deck', 0.01),
             slab('HouseDoor', at(5.72, -0.5, 2.15), (0.06, 0.7, 1.7), 'Deck', 0.01), ball('DoorKnob', at(5.76, -0.25, 2.15), (0.03, 0.03, 0.03), 'Metal'),
             rod('Stack', at(5.95, 0.9, 1.2), at(5.95, 0.9, 4.3), 0.11, 'Dark', 10), rod('StackTop', at(5.95, 0.9, 4.2), at(5.95, 0.9, 4.36), 0.14, 'Metal', 10),
             rod('RadarPost', at(4.0, 0, 3.5), at(4.0, 0, 4.0), 0.05, 'Metal', 8), slab('Radar', at(4.0, 0, 4.05), (0.14, 1.3, 0.1), 'Paint', 0.02),
             ball('Searchlight', at(3.3, 0, 3.68), (0.16, 0.16, 0.16), 'Metal'), ball('MastLamp', at(6.2, 0, 6.55), (0.08, 0.08, 0.08), 'Paint'),
             rod('Aerial', at(4.9, -0.9, 3.5), at(4.9, -0.9, 5.4), 0.012, 'Dark', 6),
             rod('Stay', at(6.2, 0, 6.3), at(3.2, 0, 3.52), 0.012, 'Dark', 6), rod('Stay', at(6.2, 0, 6.3), at(12.5, 0, 1.9), 0.012, 'Dark', 6),
             rod('NetDrum', at(13.0, -1.2, 2.0), at(13.0, 1.2, 2.0), 0.4, 'Leaf2', 16), rod('NetDrumEnd', at(13.0, -1.3, 2.0), at(13.0, -1.2, 2.0), 0.5, 'Metal', 16),
             rod('NetDrumEnd', at(13.0, 1.2, 2.0), at(13.0, 1.3, 2.0), 0.5, 'Metal', 16),
             slab('DrumLeg', at(13.0, -1.25, 1.6), (0.12, 0.08, 0.8), 'Metal', 0.01), slab('DrumLeg', at(13.0, 1.25, 1.6), (0.12, 0.08, 0.8), 'Metal', 0.01),
             ball('NetPile', at(7.0, -1.2, 1.38), (0.6, 0.45, 0.2), 'Leaf2'), ball('Float', at(6.8, -1.0, 1.55), (0.14, 0.14, 0.14), 'Raft'),
             ball('Float', at(7.3, -1.35, 1.52), (0.14, 0.14, 0.14), 'Tip'), slab('Hatch', at(9.6, 0, 1.28), (1.3, 1.1, 0.08), 'Deck', 0.02)]
    bits += [slab('FishBox', at(6.6 + 0.1 * i, 1.25, 1.4 + 0.28 * i), (0.75, 0.5, 0.26), 'Tip' if i % 2 else 'Accent', 0.02) for i in range(3)]
    if trawler:
        # the second boat is a trawler: the same hull and deck (so the crew stand in the same places), with a flying
        # bridge on top of the wheelhouse and long outrigger booms swung out over each side
        bits += [slab('Bridge', at(4.5, 0, 4.3), (2.2, 2.3, 1.6), 'Tip', 0.05), slab('BridgeGlass', at(4.5, 0, 4.65), (2.26, 2.36, 0.55), 'Glass', 0.02),
                 slab('BridgeRoof', at(4.5, 0, 5.16), (2.7, 2.8, 0.14), 'Accent', 0.03), slab('HouseBand', at(4.3, 0, 1.9), (2.84, 2.64, 0.6), 'Tip', 0.01)]
        for y in (-1, 1):
            bits += [rod('Outrigger', at(6.2, 0.3 * y, 5.6), at(7.6, 5.2 * y, 3.9), 0.13, 'Paint', 8), rod('OutriggerStay', at(6.2, 0, 6.4), at(7.6, 5.2 * y, 3.9), 0.012, 'Dark', 6),
                     rod('TrawlWire', at(7.6, 5.2 * y, 3.9), at(8.6, 5.0 * y, 0.4), 0.012, 'Dark', 6), ball('TrawlFloat', at(8.6, 5.0 * y, 0.45), (0.55, 0.55, 0.55), 'Raft'), ball('OutriggerTip', at(7.6, 5.2 * y, 3.9), (0.3, 0.3, 0.3), 'Raft')]
    return join(name, bits)


def paddock():
    # Where rescued friends wait: a post-and-rail pen with a gap on the station side and a painted sign. Built round
    # the spots RescueGameMode::PaddockSpot hands out, with its own origin in the middle of them.
    x0, x1, y0, y1 = -5.6, 5.6, -10.6, 10.6
    corners = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    bits = []
    for (ax, ay), (bx, by) in zip(corners, corners[1:] + corners[:1]):
        steps = max(2, int(round(math.hypot(bx - ax, by - ay) / 2.6)))
        for i in range(steps):
            px, py = ax + (bx - ax) * i / steps, ay + (by - ay) * i / steps
            qx, qy = ax + (bx - ax) * (i + 1) / steps, ay + (by - ay) * (i + 1) / steps
            bits.append(slab('Post', (px, py, 0.5), (0.16, 0.16, 1.1), 'Deck', 0.02))
            if not (ax == x0 and bx == x0 and abs((py + qy) / 2) < 1.6):      # the gate, facing the station
                bits += [rod('Rail', (px, py, z), (qx, qy, z), 0.05, 'Deck', 6) for z in (0.42, 0.85)]
    bits += [slab('SignPost', (x1, y, 1.2), (0.12, 0.12, 2.4), 'Deck', 0.02) for y in (-1.6, 1.6)]
    bits += [slab('Board', (x1 + 0.02, 0, 2.05), (0.08, 3.6, 0.9), 'Paint', 0.02), sign('Words', 'SAFE AND SOUND', (x1 + 0.08, 0, 1.88), 0.36, 'Accent')]
    # A welcome, not just a pen: bunting strung round it from a tall pole at each corner, a parasol and a bench in one
    # corner, a water trough at one end and hay bales at the other. (All of it clear of where the friends stand.)
    flags = ('FlagA', 'FlagB', 'FlagC', 'FlagD', 'FlagE')
    count = 0
    for (ax, ay), (bx, by) in zip(corners, corners[1:] + corners[:1]):
        bits += [rod('BuntingPole', (ax, ay, 0), (ax, ay, 2.9), 0.05, 'Deck', 8), ball('PoleTop', (ax, ay, 2.95), (0.09, 0.09, 0.09), 'Accent')]
        steps = int(math.hypot(bx - ax, by - ay) / 0.75)
        last = None
        for i in range(steps + 1):
            t = i / steps
            here = (ax + (bx - ax) * t, ay + (by - ay) * t, 2.8 - 1.5 * t * (1 - t))      # the line sags between the poles
            if last:
                bits.append(rod('Line', last, here, 0.012, 'Dark', 4))
                mid = ((last[0] + here[0]) / 2, (last[1] + here[1]) / 2, (last[2] + here[2]) / 2 - 0.2)
                bits.append(slab('Flag', mid, (0.3, 0.02, 0.36) if ay == by else (0.02, 0.3, 0.36), flags[count % len(flags)], 0.004))
                count += 1
            last = here
    bits += [rod('ParasolPole', (-4.7, 9.5, 0), (-4.7, 9.5, 2.4), 0.04, 'Metal', 8), drum('Parasol', 2.1, 2.7, 1.5, 0.05, 'Accent', (-4.7, 9.5), 12),
             drum('ParasolRim', 2.05, 2.12, 1.52, 1.52, 'Paint', (-4.7, 9.5), 12),
             slab('BenchSeat', (-4.7, 8.2, 0.45), (1.5, 0.4, 0.06), 'Deck', 0.01), slab('BenchLeg', (-5.3, 8.2, 0.22), (0.08, 0.36, 0.44), 'Deck', 0.01),
             slab('BenchLeg', (-4.1, 8.2, 0.22), (0.08, 0.36, 0.44), 'Deck', 0.01),
             slab('Trough', (1.5, 9.9, 0.3), (2.2, 0.7, 0.6), 'Deck', 0.05), slab('Water', (1.5, 9.9, 0.58), (2.0, 0.5, 0.06), 'Dolphin', 0.01),      # a wooden trough; the pale wet look stands in for water
             slab('Bale', (-1.6, -9.9, 0.3), (1.1, 0.6, 0.6), 'LeafDry', 0.06), slab('Bale', (-0.3, -9.85, 0.3), (1.1, 0.6, 0.6), 'LeafDry', 0.06),
             slab('Bale', (-0.95, -9.9, 0.9), (1.1, 0.6, 0.6), 'LeafDry', 0.06), slab('Bale', (2.4, -9.8, 0.3), (0.6, 1.1, 0.6), 'LeafDry', 0.06),
             ball('Bucket', (3.6, 9.8, 0.2), (0.2, 0.2, 0.22), 'Accent')]
    # baled hay is tied with twine and never quite square: two cords round each bale, and loose straw lying about them
    for x, y, z, along in ((-1.6, -9.9, 0.3, 0), (-0.3, -9.85, 0.3, 0), (-0.95, -9.9, 0.9, 0), (2.4, -9.8, 0.3, 1)):
        for off in (-0.28, 0.28):
            bits.append(slab('Twine', (x + (0 if along else off), y + (off if along else 0), z), (0.64, 0.035, 0.64) if along else (0.035, 0.64, 0.64), 'Deck', 0.005))
    straw = random.Random(8)
    for _ in range(46):
        x, y, turn = straw.uniform(-2.6, 3.2), straw.uniform(-10.4, -8.9), straw.uniform(0, math.pi)
        bits.append(rod('Straw', (x, y, 0.02), (x + 0.3 * math.cos(turn), y + 0.3 * math.sin(turn), straw.uniform(0.02, 0.1)), 0.012, 'LeafDry', 4))
    return join('World_Paddock', bits)


def windsock():
    # a striped sock on a pole, standing out in the breeze
    bits = [rod('Pole', (0, 0, 0), (0, 0, 6), 0.06, 'Metal', 10), drum('Foot', 0, 0.25, 0.35, 0.3, 'Concrete')]
    for i in range(5):
        r0, r1 = 0.38 - 0.05 * i, 0.38 - 0.05 * (i + 1)
        ring = rod('Sock', (0.15 + 0.5 * i, 0, 5.75 - 0.03 * i * i), (0.15 + 0.5 * (i + 1), 0, 5.75 - 0.03 * (i + 1) * (i + 1)), (r0 + r1) / 2, 'Raft' if i % 2 == 0 else 'Paint', 12)
        bits.append(ring)
    return join('World_Windsock', bits)


def jetty():
    # A timber jetty running out from the beach along +X, its deck a metre above the sea, with a rowing boat moored
    # alongside. The shore end is the origin; z = 0 is sea level.
    bits = []
    for i in range(13):
        bits.append(slab('Plank', (1.0 + i * 2.0, 0, 1.0), (1.92, 2.6, 0.12), 'Deck', 0.02))
    for i in range(7):
        x = 1.0 + i * 4.0
        for y in (-1.25, 1.25):
            bits += [rod('Pile', (x, y, -3.5), (x, y, 1.75 if i % 2 == 0 else 1.05), 0.16, 'Bark', 10), rod('PileCap', (x, y, 0.2), (x, y, 0.5), 0.175, 'Dark', 10)]
        bits.append(slab('Beam', (x, 0, 0.86), (0.2, 2.8, 0.18), 'Bark', 0.01))
    bits += [slab('Stringer', (13.0, y, 0.9), (26.0, 0.14, 0.2), 'Bark', 0.01) for y in (-1.0, 1.0)]
    bits += [rod('Rope', (1.0 + i * 8.0, -1.25, 1.6), (9.0 + i * 8.0, -1.25, 1.6), 0.03, 'Paint', 6) for i in range(3)]
    bits += [drum('Bollard', 1.06, 1.45, 0.13, 0.16, 'Dark', (24.6, y), 10) for y in (-0.9, 0.9)]
    bits += [rod('LadderRail', (22.0 + dx, 1.36, -0.6), (22.0 + dx, 1.36, 1.5), 0.03, 'Metal', 6) for dx in (-0.25, 0.25)]
    bits += [rod('Rung', (21.75, 1.36, z), (22.25, 1.36, z), 0.025, 'Metal', 6) for z in (-0.3, 0.1, 0.5, 0.9)]
    bits += [ring_('LifeRing', (5.0, -1.42, 1.3), 0.3, 0.08, 'Raft'), drum('Lamp', 1.75, 1.95, 0.12, 0.12, 'Glow', (25.0, -1.25), 10)]
    # the rowing boat, tied to a pile
    quad = lambda x, half, z0, z1: [Vector((x, -half, z0)), Vector((x, half, z0)), Vector((x, half, z1)), Vector((x, -half, z1))]
    boat_ = [box('Hull', quad(14.6, 0.72, -0.2, 0.42), quad(17.6, 0.5, -0.1, 0.5), 'Accent', 0.08), box('Bow', quad(17.6, 0.5, -0.1, 0.5), quad(18.5, 0.06, 0.1, 0.58), 'Accent', 0.05),
             slab('Inside', (16.1, 0, 0.42), (2.8, 1.1, 0.06), 'Deck', 0.01), slab('Thwart', (15.6, 0, 0.47), (0.3, 1.3, 0.05), 'Paint', 0.01),
             slab('Thwart', (16.9, 0, 0.5), (0.3, 1.1, 0.05), 'Paint', 0.01), rod('Oar', (15.0, 0.3, 0.52), (17.6, 0.25, 0.56), 0.03, 'Bark', 6),
             slab('Gunwale', (16.1, 0.64, 0.48), (3.0, 0.07, 0.06), 'Paint', 0.01), slab('Gunwale', (16.1, -0.64, 0.48), (3.0, 0.07, 0.06), 'Paint', 0.01)]
    for part in boat_:
        part.matrix_world = Matrix.Translation((0, 2.25, 0)) @ part.matrix_world
    bits += boat_ + [rod('Mooring', (17.9, 2.25, 0.55), (17.0, 1.25, 1.0), 0.02, 'Paint', 5)]
    return join('World_Jetty', bits)


def ring_(name, centre, major, minor, mat):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=20, minor_segments=8, location=centre, rotation=(math.pi / 2, 0, 0))
    ob = bpy.context.active_object
    for m in ORDER:
        ob.data.materials.append(MATS[m])
    ob.data.polygons.foreach_set('material_index', [ORDER.index(mat)] * len(ob.data.polygons))
    ob.data.polygons.foreach_set('use_smooth', [True] * len(ob.data.polygons))
    return ob


def gull():
    # A seagull facing +X, in three pieces so it can beat its wings: the body, and each wing modelled about the
    # shoulder (close to the middle line). RescueGameMode sets a few wheeling over each island.
    body = join('World_Gull', [ball('Body', (0, 0, 0), (0.32, 0.09, 0.085), 'Paint'), ball('Head', (0.3, 0, 0.035), (0.08, 0.07, 0.07), 'Paint'),
                               cone('Beak', (0.36, 0, 0.03), (0.5, 0, 0.005), 0.028, 'Tip'), slab('Tail', (-0.38, 0, 0.0), (0.22, 0.13, 0.02), 'Paint', 0.005),
                               ball('Eye', (0.34, 0.055, 0.05), (0.014, 0.014, 0.014), 'Dark'), ball('Eye', (0.34, -0.055, 0.05), (0.014, 0.014, 0.014), 'Dark')])
    wings = []
    for side, tag in ((1, 'L'), (-1, 'R')):
        root_ = [Vector((0.15, 0.05 * side, 0.02)), Vector((-0.14, 0.05 * side, 0.02)), Vector((-0.14, 0.05 * side, 0.045)), Vector((0.15, 0.05 * side, 0.045))]
        wrist = [Vector((0.12, 0.6 * side, 0.06)), Vector((-0.12, 0.6 * side, 0.06)), Vector((-0.12, 0.6 * side, 0.08)), Vector((0.12, 0.6 * side, 0.08))]
        tip = [Vector((-0.08, 1.15 * side, 0.03)), Vector((-0.2, 1.15 * side, 0.03)), Vector((-0.2, 1.15 * side, 0.04)), Vector((-0.08, 1.15 * side, 0.04))]
        wings.append(join('World_GullWing' + tag, [box('Wing', root_, wrist, 'Seam', 0.004), box('WingTip', wrist, tip, 'Dark', 0.003)]))
    return [body] + wings


def dolphin():
    # a dolphin facing +X, about 2.6 m long: grey back, pale belly, a smile; RescueGameMode sets pods of them leaping
    bits = [ball('Body', (0, 0, 0), (1.15, 0.33, 0.36), 'Dolphin'), ball('Belly', (0.1, 0, -0.1), (0.95, 0.29, 0.28), 'Paint'),
            ball('Head', (0.85, 0, 0.02), (0.42, 0.27, 0.27), 'Dolphin'), cone('Beak', (1.1, 0, -0.04), (1.55, 0, -0.08), 0.12, 'Seam'),
            cone('Fin', (-0.1, 0, 0.25), (-0.45, 0, 0.75), 0.2, 'Seam'), cone('TailStock', (-0.8, 0, 0), (-1.5, 0, 0.02), 0.2, 'Seam'),
            ball('Eye', (1.0, 0.2, 0.08), (0.035, 0.03, 0.035), 'Dark'), ball('Eye', (1.0, -0.2, 0.08), (0.035, 0.03, 0.035), 'Dark')]
    for side in (-1, 1):
        bits += [cone('Fluke', (-1.4, 0, 0.02), (-1.75, 0.5 * side, 0.02), 0.13, 'Seam'), cone('Flipper', (0.45, 0.25 * side, -0.15), (0.15, 0.6 * side, -0.4), 0.11, 'Seam')]
    for part in bits:
        if part.name.startswith(('Fin', 'Fluke', 'Flipper')):
            part.scale = (1, 1, 1) if part.name.startswith('Fin') else (1, 1, 0.35)      # flukes and flippers are flat
    bits[4].scale = (1, 0.3, 1)                                                           # the back fin is a blade
    return join('World_Dolphin', bits)


def crates():
    # a stack of supply crates on a pallet, two fuel drums and a traffic cone
    bits = [slab('Pallet', (0, 0, 0.08), (2.6, 1.4, 0.16), 'Deck', 0.01)]
    for x, y, z, yaw in ((-0.65, 0, 0.66, 0.05), (0.62, 0.05, 0.66, -0.08), (-0.1, 0, 1.66, 0.2)):
        box_ = slab('Crate', (0, 0, 0), (1.15, 1.15, 1.0), 'Deck', 0.03)
        band = slab('Band', (0, 0, 0), (1.18, 0.12, 1.03), 'Metal', 0.01)
        lid = slab('Stencil', (0.58, 0, 0.1), (0.02, 0.6, 0.3), 'Accent', 0.005)
        for part in (box_, band, lid):
            part.matrix_world = Matrix.Translation((x, y, z)) @ Matrix.Rotation(yaw, 4, 'Z') @ part.matrix_world
        bits += [box_, band, lid]
    for x, y in ((2.1, 0.3), (2.25, -0.75)):
        bits += [drum('Drum', 0, 1.1, 0.36, 0.36, 'Accent', (x, y), 20), drum('DrumRim', 0.36, 0.42, 0.38, 0.38, 'Metal', (x, y), 20),
                 drum('DrumRim', 0.74, 0.8, 0.38, 0.38, 'Metal', (x, y), 20), drum('DrumCap', 1.1, 1.13, 0.3, 0.3, 'Metal', (x, y), 20)]
    bits += [drum('Cone', 0.04, 0.75, 0.2, 0.03, 'Raft', (-2.0, 0.9), 16), slab('ConeFoot', (-2.0, 0.9, 0.02), (0.5, 0.5, 0.04), 'Raft', 0.01),
             drum('ConeBand', 0.34, 0.46, 0.125, 0.095, 'Paint', (-2.0, 0.9), 16)]
    return join('World_Crates', bits)


def pad_lights():
    # the ring of lights that marks a helipad after dark, each on a short stalk
    bits = []
    for i in range(12):
        x, y = 8.9 * math.cos(i * math.pi / 6), 8.9 * math.sin(i * math.pi / 6)
        bits += [drum('Stalk', -0.3, 0.12, 0.07, 0.07, 'Metal', (x, y), 8), ball('Lens', (x, y, 0.17), (0.11, 0.11, 0.09), 'Glow')]
    return join('World_PadLights', bits)


def driftwood():
    # a bleached, sea-worn branch lying where the tide left it
    pick = random.Random(21)
    bits = [limb((-1.6, 0, 0.14), (0.2, 0.15, 0.2), 0.14, 0.11, 'Bleached'), limb((0.2, 0.15, 0.2), (1.7, -0.2, 0.3), 0.11, 0.05, 'Bleached')]
    for x, y, z in ((0.2, 0.9, 0.45), (0.9, -0.8, 0.5), (-0.6, 0.7, 0.35)):
        bits.append(limb((x * 0.3, y * 0.15, 0.18), (x, y, z), 0.06, 0.02, 'Bleached'))
    return join('World_Driftwood', bits)


def frond(length, droop, mat, pairs=30):
    # One palm leaf, growing from the origin along +X: a midrib that arches up and then hangs under its own weight,
    # with a row of narrow leaflets down each side that fold a little below it and droop at their tips, the way a
    # real feather palm's do. No two leaflets are quite the same length or set at quite the same angle.
    bm = bmesh.new()
    pick = random.Random(int(length * 1000) + int(droop * 100))
    spine = lambda t: Vector((length * t * (1 - 0.25 * droop * t), 0, length * (0.3 * t - droop * t * t)))
    rib = [(bm.verts.new(spine(i / 8) + Vector((0, -0.03, 0))), bm.verts.new(spine(i / 8) + Vector((0, 0.03, 0)))) for i in range(9)]
    for a, b in zip(rib, rib[1:]):
        bm.faces.new((a[0], a[1], b[1], b[0])).material_index = ORDER.index(mat)
    for i in range(pairs):
        t = (i + 1.5) / (pairs + 1.5)
        root, along = spine(t), (spine(t + 0.02) - spine(t - 0.02)).normalized()
        reach = length * 0.38 * math.sin(math.pi * min(t * 1.15, 1)) ** 0.7 + 0.08 * length
        half = along * (length / pairs * 0.52)
        for side in (-1, 1):
            far = reach * pick.uniform(0.82, 1.1)
            out = Vector((0, side * far * 0.86, -far * pick.uniform(0.3, 0.55))) + along * far * pick.uniform(0.15, 0.45)
            mid = root + out * 0.55
            a, b, c, d = (bm.verts.new(q) for q in (root - half, root + half, mid + half * 0.7, mid - half * 0.7))
            point = bm.verts.new(root + out - Vector((0, 0, far * 0.2)))
            bm.faces.new((a, b, c, d)).material_index = ORDER.index(mat)
            bm.faces.new((d, c, point)).material_index = ORDER.index(mat)
    return finish(bm, 'Frond', False)


def crown(top, count, length, seed, dry=3):
    # a head of fronds: the youngest stand nearly upright in the middle, the oldest hang down brown round the trunk
    pick, bits = random.Random(seed), []
    for i in range(count):
        age = i / (count - 1)
        leaf = frond(length * pick.uniform(0.8, 1.1) * (0.75 + 0.35 * math.sin(math.pi * age)), 0.25 + 0.5 * age, 'LeafDry' if i >= count - dry else 'Leaf')
        leaf.matrix_world = (Matrix.Translation(top) @ Matrix.Rotation(math.radians(137.5 * i + pick.uniform(-12, 12)), 4, 'Z')
                             @ Matrix.Rotation(math.radians(-68 + 100 * age + pick.uniform(-8, 8)), 4, 'Y') @ Matrix.Rotation(pick.uniform(-0.3, 0.3), 4, 'X'))
        bits.append(leaf)
    return bits


def palm(name, height, lean, seed):
    # a coconut palm: a ringed trunk that leans and then straightens toward the light, swollen at the foot
    steps = 18
    bend = lambda t: Vector((lean * (t * t * (1.5 - 0.5 * t)), 0.25 * lean * math.sin(t * 3), height * t))
    bm = bmesh.new()
    rings = []
    for i in range(steps + 1):
        t = i / steps
        radius = (0.2 + 0.16 * (1 - t) ** 5) * (1 - 0.35 * t) * (1.07 if i % 2 else 1.0)      # leaf scars ring the trunk
        frame = (bend(min(t + 0.02, 1)) - bend(max(t - 0.02, 0))).to_track_quat('Z', 'Y').to_matrix()
        rings.append([bm.verts.new(bend(t) + frame @ Vector((radius * math.cos(a * math.pi / 5), radius * math.sin(a * math.pi / 5), 0))) for a in range(10)])
    for a, b in zip(rings, rings[1:]):
        for i in range(10):
            bm.faces.new((a[i], a[(i + 1) % 10], b[(i + 1) % 10], b[i])).material_index = ORDER.index('Bark')
    top = bend(1)
    bits = [finish(bm, 'Trunk', True)] + crown(top, 23, 3.3, seed)
    bits += [ball('Coconut', top + Vector((0.24 * math.cos(a), 0.24 * math.sin(a), -0.28)), (0.15, 0.15, 0.17), 'Deck') for a in (0, 1.4, 2.9, 4.4)]
    return join(name, bits)


def limb(a, b, r0, r1, mat='Bark'):
    a, b = Vector(a), Vector(b)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=r0, radius2=r1, depth=(b - a).length,
                          matrix=Matrix.Translation((a + b) / 2) @ (b - a).to_track_quat('Z', 'Y').to_matrix().to_4x4())
    for f in bm.faces:
        f.material_index = ORDER.index(mat)
    return finish(bm, 'Limb', True)


def tree(name, height, seed):
    # a forest tree for the hillsides: a short bole forking into boughs, each carrying a dense head of leaves
    pick = random.Random(seed)
    fork = Vector((pick.uniform(-0.3, 0.3), pick.uniform(-0.3, 0.3), height * 0.45))
    bits = [limb((0, 0, -0.4), fork, 0.34, 0.22)]
    for i in range(7):
        a = i * 2.4 + pick.uniform(-0.3, 0.3)
        out = height * (0.0 if i == 0 else pick.uniform(0.28, 0.5))
        tip = fork + Vector((out * math.cos(a), out * math.sin(a), height * pick.uniform(0.35, 0.55)))
        bits.append(limb(fork, tip, 0.17, 0.06))
        bits += [leaf for leaf in crown(tip, 12, height * 0.34, seed * 10 + i, dry=1)]
    for ob in bits:
        for poly in ob.data.polygons:
            if poly.material_index == ORDER.index('Leaf'):
                poly.material_index = ORDER.index('Leaf2')
    return join(name, bits)


def broadleaf(name, height, spread, seed, mat):
    # A broad-leaved forest tree: a trunk that forks and forks again, and at the end of every bough a cloud of twigs,
    # each a spray of six pointed leaves folded along the midrib. Thousands of them catching the light at different
    # angles is what makes a canopy look like leaves and not like a green lump.
    pick = random.Random(seed)
    bits, tips = [], []
    fork = Vector((pick.uniform(-0.4, 0.4), pick.uniform(-0.4, 0.4), height * pick.uniform(0.3, 0.42)))
    bits.append(limb((0, 0, -0.4), fork, 0.4, 0.26))
    for i in range(5):
        a = i * 2 * math.pi / 5 + pick.uniform(-0.4, 0.4)
        elbow = fork + Vector((spread * 0.45 * math.cos(a), spread * 0.45 * math.sin(a), height * pick.uniform(0.18, 0.3)))
        bits.append(limb(fork, elbow, 0.2, 0.12))
        for j in range(2):
            b = a + pick.uniform(-0.9, 0.9)
            tip = elbow + Vector((spread * 0.45 * math.cos(b), spread * 0.45 * math.sin(b), height * pick.uniform(0.12, 0.3)))
            bits.append(limb(elbow, tip, 0.1, 0.04))
            tips.append(tip)
    tips.append(fork + Vector((0, 0, height * 0.62)))
    bm = bmesh.new()
    for tip in tips:
        size = spread * pick.uniform(0.34, 0.5)
        for _ in range(9):
            out = Vector((pick.gauss(0, 1), pick.gauss(0, 1), pick.gauss(0, 0.6))).normalized()
            bits.append(limb(tip, tip + Vector((out.x, out.y, out.z * 0.6)) * size * pick.uniform(0.6, 0.95), 0.035, 0.012))
        for _ in range(150):
            out = Vector((pick.gauss(0, 1), pick.gauss(0, 1), pick.gauss(0, 0.7))).normalized()
            at_ = tip + Vector((out.x, out.y, out.z * 0.6)) * size * pick.uniform(0.35, 1.0)
            face = (out + Vector((pick.uniform(-0.6, 0.6), pick.uniform(-0.6, 0.6), 0.7))).normalized()      # mostly turned up and out, to the light
            side = face.cross(Vector((0, 0, 1))).normalized()
            up = face.cross(side).normalized()
            spin = pick.uniform(0, 2 * math.pi)
            for k in range(6):
                turn = spin + k * math.pi / 3 + pick.uniform(-0.35, 0.35)
                along = (side * math.cos(turn) + up * math.sin(turn) + face * pick.uniform(-0.15, 0.45)).normalized()
                across = along.cross(face).normalized()
                lift = across.cross(along).normalized()
                long_, wide = pick.uniform(0.27, 0.43), pick.uniform(0.07, 0.1)
                root = at_ + along * 0.05
                point = root + along * long_ - lift * long_ * 0.12
                edge = [root + along * long_ * f + across * wide * w * s + lift * wide * 0.4 for s in (1, -1) for f, w in ((0.3, 1.0), (0.68, 0.8))]
                v = [bm.verts.new(p) for p in (root, edge[0], edge[1], point, edge[3], edge[2])]
                bm.faces.new(v[:4]).material_index = ORDER.index(mat)
                bm.faces.new((v[0], v[3], v[4], v[5])).material_index = ORDER.index(mat)
        # behind the sprays, a few broad dark leaves fill the heart of each head, so the crown is not something to see through
        for _ in range(12):
            out = Vector((pick.gauss(0, 1), pick.gauss(0, 1), pick.gauss(0, 0.7))).normalized()
            at_ = tip + Vector((out.x, out.y, out.z * 0.6)) * size * pick.uniform(0.1, 0.38)
            side = out.cross(Vector((0.3, 0.2, 1))).normalized() * size * 0.2
            up = out.cross(side).normalized() * size * 0.2
            bm.faces.new([bm.verts.new(at_ + side * sx + up * sy) for sx, sy in ((-1, -0.6), (0, -1), (1, -0.6), (1, 0.6), (0, 1), (-1, 0.6))]).material_index = ORDER.index(mat)
    bits.append(finish(bm, 'Leaves', False, recalc=False))
    return join(name, bits)


def camp():
    # a ridge tent with its door open toward +X, and a ring of stones round a fire in front of it
    bm = bmesh.new()
    v = [bm.verts.new(p) for p in ((-1.5, -1.3, 0), (-1.5, 1.3, 0), (-1.5, 0, 1.7), (1.5, -1.3, 0), (1.5, 1.3, 0), (1.5, 0, 1.7))]
    for f in ((0, 1, 2), (3, 5, 4), (0, 2, 5, 3), (1, 4, 5, 2)):
        bm.faces.new([v[i] for i in f]).material_index = ORDER.index('Raft')
    bits = [finish(bm, 'Tent', False), slab('TentDoor', (1.52, 0, 0.55), (0.02, 0.7, 1.0), 'Dark', 0.005),
            rod('RidgePole', (-1.6, 0, 1.72), (1.6, 0, 1.72), 0.03, 'Deck', 6), ball('Embers', (3.6, 0, 0.12), (0.3, 0.3, 0.1), 'Glow')]
    bits += [rod('GuyLine', (sx * 1.6, 0, 1.72), (sx * 2.6, sy * 0.9, 0), 0.012, 'Paint', 4) for sx in (-1, 1) for sy in (-1, 1)]
    bits += [ball('Stone', (3.6 + 0.6 * math.cos(i * math.pi / 4), 0.6 * math.sin(i * math.pi / 4), 0.08), (0.17, 0.14, 0.12), 'Rock') for i in range(8)]
    bits += [limb((3.6 + 0.45 * math.cos(a), 0.45 * math.sin(a), 0.05), (3.6 - 0.2 * math.cos(a), -0.2 * math.sin(a), 0.42), 0.06, 0.05) for a in (0.3, 2.4, 4.5)]
    bits += [limb((4.6, -1.2, 0.2), (4.9, 1.0, 0.2), 0.2, 0.18), slab('Backpack', (2.3, 1.5, 0.3), (0.35, 0.5, 0.6), 'Navy', 0.08)]
    return join('World_Camp', bits)


def truck():
    # the station's fuel truck, nose toward +X: cab, bonnet, an orange tank on the back with its hose reel
    bits = [slab('Chassis', (0, 0, 0.6), (5.4, 1.8, 0.22), 'Dark', 0.03), slab('Cab', (1.45, 0, 1.4), (1.7, 1.95, 1.45), 'Paint', 0.14),
            slab('Bonnet', (2.75, 0, 1.05), (1.05, 1.9, 0.75), 'Paint', 0.12), slab('Windscreen', (2.31, 0, 1.68), (0.05, 1.6, 0.62), 'Glass', 0.01),
            slab('RearWindow', (0.59, 0, 1.7), (0.05, 1.2, 0.45), 'Glass', 0.01), slab('Grille', (3.29, 0, 1.0), (0.04, 1.2, 0.4), 'Dark', 0.01),
            slab('Bumper', (3.33, 0, 0.62), (0.14, 2.0, 0.22), 'Metal', 0.03), slab('RearBumper', (-2.74, 0, 0.62), (0.12, 1.9, 0.2), 'Metal', 0.03),
            rod('Tank', (-2.45, 0, 1.55), (0.35, 0, 1.55), 0.82, 'Accent', 28), ball('TankEnd', (-2.45, 0, 1.55), (0.22, 0.8, 0.8), 'Accent'),
            ball('TankEnd', (0.35, 0, 1.55), (0.22, 0.8, 0.8), 'Accent'), slab('TankBed', (-1.05, 0, 0.8), (3.1, 1.7, 0.2), 'Metal', 0.03),
            drum('Hatch', 2.36, 2.46, 0.28, 0.25, 'Metal', (-1.0, 0), 16), slab('Catwalk', (-1.05, 0, 2.38), (2.4, 0.4, 0.04), 'Metal', 0.01),
            rod('HoseReel', (-2.55, -0.55, 0.95), (-2.55, 0.55, 0.95), 0.3, 'Dark', 16), ball('Beacon', (1.45, 0, 2.2), (0.12, 0.12, 0.1), 'Accent'),
            slab('BeaconBar', (1.45, 0, 2.14), (0.25, 1.1, 0.06), 'Metal', 0.02), rod('Exhaust', (0.75, 0.85, 0.8), (0.75, 0.85, 2.5), 0.05, 'Metal', 8),
            rod('Strap', (-1.9, 0, 1.55), (-1.83, 0, 1.55), 0.84, 'Metal', 28), rod('Strap', (-0.25, 0, 1.55), (-0.18, 0, 1.55), 0.84, 'Metal', 28)]
    for side in (-1, 1):
        bits += [slab('Window', (1.5, side * 0.98, 1.72), (1.05, 0.04, 0.55), 'Glass', 0.01), slab('Stripe', (1.45, side * 0.985, 1.12), (1.7, 0.03, 0.22), 'Accent', 0.005),
                 slab('Mirror', (2.2, side * 1.12, 1.6), (0.05, 0.16, 0.26), 'Dark', 0.01), ball('Lamp', (3.3, side * 0.7, 1.0), (0.05, 0.14, 0.11), 'Glass'),
                 slab('Mudguard', (2.4, side * 0.93, 0.98), (1.15, 0.2, 0.08), 'Dark', 0.03), slab('Step', (1.4, side * 1.0, 0.55), (0.9, 0.2, 0.05), 'Metal', 0.01)]
        for x in (2.4, -1.25, -2.1):
            bits += [rod('Wheel', (x, side * 0.62, 0.45), (x, side * 0.98, 0.45), 0.45, 'Dark', 20), rod('Hub', (x, side * 0.97, 0.45), (x, side * 1.0, 0.45), 0.2, 'Metal', 12)]
    return join('World_Truck', bits)


def table():
    # a picnic table for the crew's lunch
    bits = [slab('Top', (0, 0, 0.76), (1.9, 0.85, 0.06), 'Deck', 0.01)]
    bits += [slab('Bench', (0, side * 0.72, 0.46), (1.9, 0.3, 0.05), 'Deck', 0.01) for side in (-1, 1)]
    for x in (-0.7, 0.7):
        bits += [rod('Leg', (x, -0.8, 0), (x, 0.3, 0.76), 0.035, 'Deck', 6), rod('Leg', (x, 0.8, 0), (x, -0.3, 0.76), 0.035, 'Deck', 6),
                 rod('Rail', (x, -0.78, 0.43), (x, 0.78, 0.43), 0.035, 'Deck', 6)]
    bits += [ball('Mug', (0.3, 0.1, 0.84), (0.05, 0.05, 0.06), 'Paint'), slab('LunchBox', (-0.4, -0.1, 0.87), (0.3, 0.2, 0.16), 'Accent', 0.03)]
    return join('World_Table', bits)


def flowers():
    # a flower bed somebody at the station looks after: a low mound of leaves with blooms standing out of it
    pick = random.Random(21)
    # (the green under the blooms is clumps of real leaves, not a cushion)
    bits = []
    for i in range(8):
        bits += crown(Vector((pick.uniform(-1.4, 1.4), pick.uniform(-0.45, 0.45), 0.02)), 5, pick.uniform(0.4, 0.6), 300 + i, dry=0)
    # each bloom is a ring of seven petals, cupped a little and no two the same length, round a small dark eye
    petals = bmesh.new()
    for i in range(34):
        x, y, tall = pick.uniform(-1.6, 1.6), pick.uniform(-0.5, 0.5), pick.uniform(0.22, 0.48)
        top = Vector((x + pick.uniform(-0.05, 0.05), y + pick.uniform(-0.05, 0.05), tall))
        size, mat = pick.uniform(0.1, 0.15), ORDER.index(('Blush', 'Paint', 'Raft', 'Accent')[i % 4])
        spin = pick.uniform(0, 1)
        for k in range(7):
            a, long_ = (k + spin) * 2 * math.pi / 7, size * pick.uniform(0.85, 1.15)
            out, side = Vector((math.cos(a), math.sin(a), 0)), Vector((-math.sin(a), math.cos(a), 0))
            root, mid, tip = top + out * size * 0.15, top + out * long_ * 0.6 + Vector((0, 0, long_ * 0.12)), top + out * long_ + Vector((0, 0, long_ * 0.28))
            ring = [root, mid - side * size * 0.3, tip, mid + side * size * 0.3]
            for order in (ring, ring[::-1]):      # both faces, so a bloom shows from beneath as well
                petals.faces.new([petals.verts.new(q) for q in order]).material_index = mat
        bits += [rod('Stem', (x, y, 0.05), top, 0.012, 'Leaf', 4), ball('Eye', top + Vector((0, 0, size * 0.1)), (size * 0.2, size * 0.2, size * 0.14), 'Deck')]
    bits.append(finish(petals, 'Petals', False, recalc=False))
    return join('World_Flowers', bits)


def beach():
    # somebody's day at the seaside: three parasols with a towel under each, a beach ball, a bucket and a sandcastle
    bits = []
    for i, (x, y, shade, towel) in enumerate(((0, 0, 'Accent', 'Paint'), (3.4, 1.5, 'Navy', 'Blush'), (-3.0, 2.3, 'Raft', 'Navy'))):
        bits += [rod('Pole', (x, y, 0), (x - 0.25, y, 2.15), 0.03, 'Metal', 6), drum('Shade', 1.85, 2.3, 1.35, 0.05, shade, (x - 0.25, y), 10),
                 drum('ShadeRim', 1.8, 1.86, 1.37, 1.37, 'Paint', (x - 0.25, y), 10), slab('Towel', (x + 0.9, y - 0.5, 0.02), (1.8, 0.8, 0.03), towel, 0.01)]
    bits += [ball('BeachBall', (1.3, 3.1, 0.26), (0.26, 0.26, 0.26), 'Raft'), ball('BallStripe', (1.3, 3.1, 0.26), (0.265, 0.09, 0.265), 'Paint'),
             drum('Sandcastle', 0, 0.38, 0.5, 0.32, 'Bleached', (-1.1, -1.9), 8), drum('Turret', 0.38, 0.66, 0.17, 0.12, 'Bleached', (-1.1, -1.9), 8),
             rod('CastleFlag', (-1.1, -1.9, 0.66), (-1.1, -1.9, 0.95), 0.012, 'Deck', 4), slab('Pennon', (-1.02, -1.9, 0.9), (0.16, 0.01, 0.09), 'Accent', 0.002),
             drum('Bucket', 0, 0.24, 0.1, 0.13, 'Accent', (-0.2, -2.3), 10), slab('Spade', (0.25, -2.4, 0.02), (0.4, 0.09, 0.02), 'Navy', 0.005)]
    return join('World_Beach', bits)


def whale():
    # a humpback, nose toward +X, about fifteen metres long: slate grey above (navy vanished against deep blue water, pale grey looked like a beluga), pale below, long flippers and broad flukes
    bits = [ball('Body', (0, 0, 0), (6.0, 1.7, 1.6), 'Whale'), ball('Tail', (-6.2, 0, 0.1), (3.2, 0.8, 0.7), 'Whale'),
            ball('Belly', (0.8, 0, -0.55), (4.8, 1.45, 1.15), 'Paint'), ball('Hump', (-2.0, 0, 1.35), (0.9, 0.22, 0.45), 'Whale')]
    for side in (-1, 1):
        bits += [ball('Fluke', (-9.2, side * 1.3, 0.15), (1.0, 1.5, 0.14), 'Whale'), ball('Flipper', (2.0, side * 2.4, -0.9), (0.7, 1.9, 0.14), 'Paint'),
                 ball('Eye', (4.6, side * 1.22, 0.1), (0.1, 0.06, 0.1), 'Dark')]
    return join('World_Whale', bits)


def sail():
    # a sailing dinghy, bow toward +X, z = 0 at the waterline: white hull, orange jib, somebody at the tiller
    bm = bmesh.new()
    for corners, mat in ((((0.25, 0, 1.3), (-2.5, 0, 1.3), (0.25, 0, 6.4)), 'Paint'), (((0.55, 0, 1.0), (2.7, 0, 0.6), (0.5, 0, 5.4)), 'Raft')):
        for side in (-1, 1):
            cloth = [bm.verts.new((x, side * 0.012 + 0.25 * (z - 1) / 5, z)) for x, _, z in corners]      # the sail bellies a little to leeward
            bm.faces.new(cloth if side > 0 else cloth[::-1]).material_index = ORDER.index(mat)
    bits = [finish(bm, 'Sails', False, recalc=False), ball('Hull', (0, 0, 0.12), (2.9, 0.95, 0.55), 'Paint'), ball('Keel', (0, 0, -0.25), (2.4, 0.5, 0.35), 'Navy'),
            slab('Deck', (-0.2, 0, 0.52), (4.2, 1.3, 0.08), 'Deck', 0.03), slab('Stripe', (0, 0, 0.36), (5.3, 1.86, 0.1), 'Accent', 0.04),
            rod('Mast', (0.4, 0, 0.4), (0.4, 0, 6.6), 0.05, 'Metal', 8), rod('Boom', (0.4, 0, 1.25), (-2.6, 0, 1.25), 0.04, 'Metal', 8),
            rod('Forestay', (2.75, 0, 0.55), (0.45, 0, 5.6), 0.012, 'Dark', 4), rod('Tiller', (-2.3, 0, 0.7), (-1.6, 0.15, 0.85), 0.025, 'Deck', 6),
            ball('Sailor', (-1.5, 0.3, 1.0), (0.24, 0.24, 0.34), 'Accent'), ball('Head', (-1.5, 0.3, 1.5), (0.17, 0.17, 0.18), 'FurA'),
            ball('Pennant', (0.4, 0, 6.7), (0.18, 0.02, 0.07), 'Accent')]
    return join('World_Sail', bits)


def bush(name, count, length, seed):
    # low scrub: a clump of the same leaves springing straight from the ground
    return join(name, crown(Vector((0, 0, 0.05)), count, length, seed, dry=2))


def rock(name, size, seed):
    # a boulder: a ball pushed in and out by layered noise, with finer lumps and pits over the big ones
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=5, radius=1)
    for v in bm.verts:
        p = v.co.copy()
        lump = noise.noise(p * 0.9 + Vector((seed, 0, 0))) * 0.45 + noise.noise(p * 2.3 + Vector((0, seed, 0))) * 0.18 + abs(noise.noise(p * 4.5 + Vector((0, 0, seed)))) * 0.1
        lump += noise.noise(p * 9 + Vector((seed, seed, 0))) * 0.035 - abs(noise.noise(p * 17 + Vector((0, seed, seed)))) * 0.02
        v.co = Vector((p.x * size[0], p.y * size[1], p.z * size[2])) * (1 + lump) + Vector((0, 0, size[2] * 0.45))
    for f in bm.faces:
        f.material_index = ORDER.index('Rock')
    return finish(bm, name, True)


scenery = [truck(), table(), flowers(), sail(), whale(), beach(), station(), lighthouse(), boat(), boat('World_Boat2', 'SEA OTTER', True), paddock(), windsock(), crates(), pad_lights(), driftwood(), camp(), jetty(), *gull(), dolphin(),
           palm('World_Palm', 7.2, 1.6, 1), palm('World_Palm2', 9.0, 3.2, 2), palm('World_Palm3', 5.4, 0.7, 3),
           bush('World_Bush', 11, 1.5, 4), bush('World_Bush2', 8, 1.0, 5), tree('World_Tree', 6.5, 6), tree('World_Tree2', 8.5, 7),
           broadleaf('World_Tree3', 9.0, 5.0, 8, 'Leaf2'), broadleaf('World_Tree4', 11.5, 6.5, 9, 'Leaf3'), broadleaf('World_Tree5', 7.0, 6.0, 10, 'Leaf3'),
           rock('World_Rock', (1.7, 1.3, 1.0), 1.0), rock('World_Rock2', (1.2, 1.5, 1.5), 7.3), rock('World_Rock3', (2.4, 1.6, 0.8), 13.1),
           join('World_Buoy', [drum('Body', -0.4, 1.3, 0.75, 0.55, 'Accent'), drum('Post', 1.3, 2.6, 0.1, 0.1, 'Metal', sides=8), ball('Lamp', (0, 0, 2.7), (0.18, 0.18, 0.18), 'Tip')])]


# ---------------------------------------------------------------- baked shading
def bake(ob, size=2048):
    # Flat paint is what makes a model look like a toy. This works out, for every point on the model's skin, how much
    # open sky it can see (creases, joints, seams and undersides come out dark) and writes it as a picture,
    # B_<name>.png. The web game's material shader turns that into shade and grime.
    others = [o for o in scene.objects if o is not ob and not o.hide_render]
    for o in others:
        o.hide_render = True
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.002)
    bpy.ops.object.mode_set(mode='OBJECT')
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 32
    scene.cycles.use_denoising = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new('World')
    scene.world.light_settings.distance = 1.2          # how far away a neighbouring surface still shades this one, metres
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
    print('MODEL baked %s' % ob.name)


# ---------------------------------------------------------------- size, place, export
def settle(ob, shift, scale=K):
    ob.matrix_world = Matrix.Scale(scale, 4) @ Matrix.Translation(shift) @ ob.matrix_world
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


settle(body, (0, 0, -REF_Z))
settle(main_rotor, (0, 0, 0))
settle(tail_rotor, (0, 0, 0))
settle(door, (0, 0, -REF_Z))
settle(rescue_basket, (0, 0, 0), 1)
settle(life_raft, (0, 0, 0), 1)
for ob in friends + scenery:
    settle(ob, (1.8, 0, 0) if ob.name.startswith('World_Boat') else (0, 0, 0), 1)      # the boat's hull was lofted off-centre
for ob in [body, door, rescue_basket, life_raft] + friends + [s for s in scenery if s.name in ('World_Boat', 'World_Boat2', 'World_Station', 'World_Lighthouse', 'World_Paddock', 'World_Jetty', 'World_Truck')]:
    bake(ob)
for ob in [body, door, main_rotor, tail_rotor, rescue_basket, life_raft] + friends + scenery:
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.ops.export_scene.fbx(filepath='%s/%s.fbx' % (OUT, ob.name), use_selection=True, object_types={'MESH'}, mesh_smooth_type='FACE')
    print('MODEL %s: %d triangles' % (ob.name, sum(len(p.vertices) - 2 for p in ob.data.polygons)))

# Rotor mount positions in export metres; tools/pack_models.py converts them to the web game's axes.
print('MODEL main rotor at (0, 0, %.3f), tail rotor at (%.3f, %.3f, %.3f)' % (
    (HUB_Z - REF_Z) * K, (MAST_S - TAIL_HUB[0]) * K, -TAIL_HUB[1] * K, (TAIL_HUB[2] - REF_Z) * K))

# a quick look for whoever ran this: preview.png, three-quarter view with the rotors in place
rescue_basket.location = (2, -4.5, -1.95)
life_raft.location = (5.5, -4, -1.95)
for ob in scenery:
    ob.hide_render = True
for i, ob in enumerate(friends):
    ob.location = (7.5 - i * 1.15, -6.2, -1.95)
    ob.rotation_euler = (0, 0, math.radians(-50))
main_rotor.location = (0, 0, (HUB_Z - REF_Z) * K)
tail_rotor.location = ((MAST_S - TAIL_HUB[0]) * K, TAIL_HUB[1] * K, (TAIL_HUB[2] - REF_Z) * K)
cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
scene.collection.objects.link(cam)
cam.location = (13, -11, 4)
cam.rotation_euler = (Vector((-1.5, 0, -0.6)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
scene.camera = cam
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light, scene.display.shading.color_type = 'STUDIO', 'MATERIAL'
scene.display.shading.show_cavity = True
scene.render.resolution_x, scene.render.resolution_y = 1280, 720
scene.render.filepath = OUT + '/preview.png'
bpy.ops.render.render(write_still=True)
