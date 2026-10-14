# Shrinks the scanned ground photographs (Poly Haven, CC0) to sizes the single-page web game can carry:
# src/assets/ground/<name>_c.jpg (colour, 1024) and <name>_n.jpg (DirectX-style normal map, 512).
# Run with:  blender --background --python tools/pack_textures.py -- <folder of 2k photos> <src/assets>
import os
import sys
import bpy

SRC, OUT = (os.path.abspath(p) for p in sys.argv[sys.argv.index('--') + 1:][:2])
PHOTOS = {'sand': 'aerial_beach_01', 'rock': 'coast_sand_rocks_02', 'moss': 'aerial_grass_rock'}
os.makedirs(os.path.join(OUT, 'ground'), exist_ok=True)
s = bpy.context.scene.render.image_settings
s.file_format, s.color_mode = 'JPEG', 'RGB'
bpy.context.scene.view_settings.view_transform = 'Standard'
for name, photo in PHOTOS.items():
    for kind, suffix, size, quality in (('diff', 'c', 1024, 80), ('nor_dx', 'n', 512, 84)):
        img = bpy.data.images.load(os.path.join(SRC, '%s_%s_2k.jpg' % (photo, kind)))
        if kind != 'diff':
            img.colorspace_settings.name = 'Non-Color'
        img.scale(size, size)
        s.quality = quality
        path = os.path.join(OUT, 'ground', '%s_%s.jpg' % (name, suffix))
        img.save_render(path, scene=bpy.context.scene)
        print('TEX %s %d KB' % (os.path.basename(path), os.path.getsize(path) // 1024))
