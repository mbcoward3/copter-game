# Packs the Blender-made models (the FBX files tools/build_models.py writes) into one small
# file the web game can carry inside its single HTML page: src/assets/models.bin, plus each model's baked shading as a
# small greyscale JPEG (src/assets/ao/<name>.jpg).
# Run with:  blender --background --python tools/pack_models.py -- <folder of FBX files> <src/assets>
#
# models.bin is zlib-deflated: a uint32 length, that many bytes of JSON, then the vertex data the JSON points into.
# Positions are 16-bit within each model's bounding box, normals 8-bit, UVs 16-bit. Axes are turned to the game's:
# nose/front +Z, up +Y (Blender's X, Y, Z become Z, X, Y).
import json
import os
import struct
import sys
import zlib
import bmesh
import bpy
import numpy as np
import random
from mathutils import Vector

# (more source folders may follow the output folder: tools/build_vehicles.py writes the game's own models to another)
SRC, OUT, *MORE = (os.path.abspath(p) for p in sys.argv[sys.argv.index('--') + 1:])
with open(os.path.join(os.path.dirname(__file__), '..', 'src', 'assets', 'model-contracts.json')) as contracts_file:
    CONTRACTS = json.load(contracts_file)
AO_SIZE = {'Jayhawk_Body': 1024}       # the rest are 512
# The plants were modelled leaf by leaf for an engine that draws unlimited triangles. Here each keeps one leaf in N,
# grown to cover the gap, and gets a second, sparser copy (<name>_far) for the far side of the bay.
THIN = {'World_Tree': (4, 16), 'World_Tree2': (4, 16), 'World_Tree3': (5, 16), 'World_Tree4': (5, 16), 'World_Tree5': (5, 16),
        'World_Palm': (3, 9), 'World_Palm2': (3, 9), 'World_Palm3': (3, 9), 'World_Bush': (2, 6), 'World_Bush2': (2, 6)}
# The broad-leaved trees go further: each surviving leaf becomes a square card (half-width in metres, near and far)
# that the game paints with a whole spray of leaves, so a crown is a couple of thousand cards and still looks leafy.
CARDS = {'World_Tree3': (0.55, 0.85), 'World_Tree4': (0.55, 0.85), 'World_Tree5': (0.55, 0.85)}
SKIP = ('World_Flowers',)
# smooth lumps that carry far more triangles than a browser needs: the share to keep
DECIMATE = {'Friend_': 0.4, 'World_Rock': 0.12, 'Jayhawk_Raft': 0.5, 'World_Whale': 0.5, 'World_PadLights': 0.4}
HERO_LOD = {'Jayhawk_Body': .38, 'Vehicle_Plane': .45, 'Vehicle_Boat': .4}

blob = bytearray()
index = {}


def push(arr):
    while len(blob) % 4:
        blob.append(0)
    off = len(blob)
    blob.extend(arr.tobytes())
    return off


def thin(me, every, seed, far, card=0):
    # keeps one leaf in "every" and grows the survivors (or, with card set, swaps each for a square card that size)
    bm = bmesh.new()
    bm.from_mesh(me)
    uv = bm.loops.layers.uv.verify()
    cards = []
    leafy = {i for i, m in enumerate(me.materials) if m and m.name.startswith(('Leaf', 'Blush', 'Raft', 'Accent', 'Paint'))}
    pick = random.Random(seed)
    seen, doomed, total, kept = set(), [], 0, 0
    for f in bm.faces:
        if f in seen or f.material_index not in leafy:
            continue
        island, stack = [], [f]
        seen.add(f)
        while stack:
            g = stack.pop()
            island.append(g)
            for v in g.verts:
                for h in v.link_faces:
                    if h not in seen and h.material_index in leafy:
                        seen.add(h)
                        stack.append(h)
        if len(island) > 2:
            continue                    # a midrib, not a leaf
        total += 1
        if pick.random() * every < 1:
            kept += 1
            verts = list({v for g in island for v in g.verts})
            mid = sum((v.co for v in verts), Vector()) / len(verts)
            if card:
                normal = island[0].normal.copy()
                along = max(((a.co - b.co) for a in verts for b in verts), key=lambda d: d.length)
                along = (along - normal * along.dot(normal)).normalized()
                across = normal.cross(along).normalized()
                size = card * pick.uniform(0.8, 1.2)
                cards.append(([mid + (along * sx + across * sy) * size for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))], island[0].material_index))
                doomed += island
                continue
            grow = min(every ** 0.5 * 0.9, 4.0)
            for v in verts:
                v.co = mid + (v.co - mid) * grow
        else:
            doomed += island
    # twigs and coconuts are lost among leaves this size, and cost as much as the leaves do
    seen = set()
    for f in bm.faces:
        if f in seen or me.materials[f.material_index].name.split('.')[0] not in ('Bark', 'Deck'):
            continue
        island, stack = [], [f]
        seen.add(f)
        while stack:
            g = stack.pop()
            island.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h not in seen:
                        seen.add(h)
                        stack.append(h)
        verts = list({v for g in island for v in g.verts})
        length = max((v.co - verts[0].co).length for v in verts)
        if me.materials[f.material_index].name.startswith('Deck') or sum(g.calc_area() for g in island) / (6.283 * max(length, 0.01)) < (0.09 if far else 0.05):
            doomed += island
    bmesh.ops.delete(bm, geom=list(set(doomed)), context='FACES')
    for corners, slot in cards:
        face = bm.faces.new([bm.verts.new(c) for c in corners])
        face.material_index = slot
        for loop, st in zip(face.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
            loop[uv].uv = st
    bm.to_mesh(me)
    bm.free()
    return total, kept


def pack(name, ob, out_name, every, folder):
    me = ob.data
    note = ''
    if every:
        note = ' leaves %d -> %d' % thin(me, every, len(name), out_name.endswith('_far'), CARDS.get(name, (0, 0))[out_name.endswith('_far')])
    ratio = HERO_LOD.get(name, 0) if out_name.endswith('_far') and name in HERO_LOD else next((r for k, r in DECIMATE.items() if name.startswith(k)), 0)
    if ratio:
        mod = ob.modifiers.new('Decimate', 'DECIMATE')
        mod.ratio = ratio
        bpy.context.view_layer.objects.active = ob
        ob.select_set(True)
        bpy.ops.object.modifier_apply(modifier=mod.name)
        me = ob.data
    name = out_name
    me.calc_loop_triangles()
    nt = len(me.loop_triangles)
    world = np.array(ob.matrix_world)
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3) @ world[:3, :3].T + world[:3, 3]
    tri_loops = np.empty(nt * 3, np.int32)
    me.loop_triangles.foreach_get('loops', tri_loops)
    tri_mat = np.empty(nt, np.int32)
    me.loop_triangles.foreach_get('material_index', tri_mat)
    loop_vert = np.empty(len(me.loops), np.int32)
    me.loops.foreach_get('vertex_index', loop_vert)
    nor = np.empty(len(me.loops) * 3, np.float32)
    me.corner_normals.foreach_get('vector', nor)
    nor = nor.reshape(-1, 3) @ np.linalg.inv(world[:3, :3])
    nor /= np.maximum(np.linalg.norm(nor, axis=1, keepdims=True), 1e-9)
    has_uv = me.uv_layers.active is not None
    uv = np.zeros(len(me.loops) * 2, np.float32)
    if has_uv:
        me.uv_layers.active.data.foreach_get('uv', uv)
    uv = np.clip(uv.reshape(-1, 2), 0, 1)

    # triangles grouped by material, in slot order
    order = np.argsort(tri_mat, kind='stable')
    loops = tri_loops.reshape(-1, 3)[order].reshape(-1)
    mats = tri_mat[order]
    pos = co[loop_vert[loops]][:, [1, 2, 0]]             # Blender X, Y, Z -> game Z, X, Y
    lo, hi = pos.min(0), pos.max(0)
    span = np.maximum(hi - lo, 1e-6)
    qpos = np.round((pos - lo) / span * 65535).astype(np.uint16)
    qnor = np.round(nor[loops][:, [1, 2, 0]] * 127).astype(np.int8)
    quv = np.round(uv[loops] * 65535).astype(np.uint16)
    quv[:, 1] = 65535 - quv[:, 1]                        # pictures are read top row first in the browser

    # weld corners that came out identical
    key = np.concatenate([qpos.astype(np.int32), qnor.astype(np.int32), quv.astype(np.int32)], axis=1)
    _, first, inverse = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inverse = inverse.reshape(-1)
    nv = len(first)
    idx = inverse.astype(np.uint16 if nv < 65536 else np.uint32)
    groups, start = [], 0
    for m in np.unique(mats):
        count = int((mats == m).sum()) * 3
        slot = me.materials[m] if m < len(me.materials) else None
        groups.append({'mat': slot.name.split('.')[0] if slot else 'Paint', 'start': start, 'count': count})
        start += count
    nor4 = np.zeros((nv, 4), np.int8)
    nor4[:, :3] = qnor[first]
    entry = {'nv': nv, 'min': [float(v) for v in lo], 'size': [float(v) for v in span], 'groups': groups,
             'pos': push(np.ascontiguousarray(qpos[first])), 'nor': push(nor4),
             'idx': push(idx), 'ni': int(len(idx)), 'wide': nv >= 65536}
    if has_uv:
        entry['uv'] = push(np.ascontiguousarray(quv[first]))
    index[name] = entry
    base_name = name[:-4] if name.endswith('_far') else name
    if base_name in CONTRACTS:
        entry['contract'] = CONTRACTS[base_name]
    print('PACK %-20s %6d tris %6d verts  size %s  mats %s%s' % (
        name, nt, nv, ' x '.join('%.2f' % v for v in span), ','.join(g['mat'] for g in groups), note))

    # A vehicle's far body keeps the near body's UVs, so it wears the near body's baked shade (no second picture).
    if name.endswith('_far') and name[:-4] in HERO_LOD:
        entry['ao'] = True
        return
    bake = os.path.join(folder, 'B_%s.png' % name)
    if os.path.exists(bake) and not every:
        img = bpy.data.images.load(bake)
        size = AO_SIZE.get(name, 512)
        img.scale(size, size)
        s = bpy.context.scene.render.image_settings
        s.file_format, s.color_mode, s.quality = 'JPEG', 'BW', 82
        os.makedirs(os.path.join(OUT, 'ao'), exist_ok=True)
        img.save_render(os.path.join(OUT, 'ao', name + '.jpg'), scene=bpy.context.scene)
        entry['ao'] = True



for folder in [SRC] + MORE:
    for fname in sorted(os.listdir(folder)):
        stem, ext = os.path.splitext(fname)
        if ext != '.fbx' or stem in SKIP:
            continue
        for far in (False, True):
            every = THIN.get(stem, (0, 0))[far]
            if far and not every and stem not in HERO_LOD:
                continue
            bpy.ops.wm.read_factory_settings(use_empty=True)
            bpy.ops.wm.fbx_import(filepath=os.path.join(folder, fname))
            meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
            if len(meshes) != 1:
                raise ValueError('%s must export one packed mesh (found %d); export animated parts separately' % (stem, len(meshes)))
            pack(stem, meshes[0], stem + ('_far' if far else ''), every, folder)

head = json.dumps(index, separators=(',', ':')).encode()
while len(head) % 4:
    head += b' '
raw = struct.pack('<I', len(head)) + head + bytes(blob)
with open(os.path.join(OUT, 'models.bin'), 'wb') as f:
    f.write(zlib.compress(raw, 9))
print('PACK wrote models.bin: %d KB raw, %d KB packed' % (len(raw) // 1024, os.path.getsize(os.path.join(OUT, 'models.bin')) // 1024))
