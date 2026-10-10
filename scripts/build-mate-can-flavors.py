"""Reuse the authored can geometry with each existing El Tony photographic label."""
import copy
import json
import struct
from pathlib import Path

root = Path(__file__).resolve().parents[1]
public = root / 'apps/client/public'
source = (public / 'models/mate-can-mint.glb').read_bytes()
json_length = struct.unpack_from('<I', source, 12)[0]
model = json.loads(source[20:20 + json_length])
binary = source[28 + json_length:]
image_view = model['images'][0]['bufferView']
view = model['bufferViews'][image_view]
start = view.get('byteOffset', 0)
old_size = (view['byteLength'] + 3) // 4 * 4
for flavor in ['basic', 'light', 'ginger']:
    edited = copy.deepcopy(model)
    label = (public / f'assets/tony-mate/cans/{flavor}.png').read_bytes()
    padded = label + b'\0' * (-len(label) % 4)
    difference = len(padded) - old_size
    payload = binary[:start] + padded + binary[start + old_size:]
    for i, item in enumerate(edited['bufferViews']):
        if i == image_view:
            item['byteLength'] = len(label)
        elif item.get('byteOffset', 0) >= start + old_size:
            item['byteOffset'] += difference
    edited['buffers'][0]['byteLength'] = model['buffers'][0]['byteLength'] + difference
    edited['images'][0]['name'] = flavor
    for material in edited['materials']:
        material['name'] = material.get('name', '').replace('mint', flavor)
    encoded = json.dumps(edited, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    glb = struct.pack('<III', 0x46546c67, 2, 28 + len(encoded) + len(payload))
    glb += struct.pack('<II', len(encoded), 0x4e4f534a) + encoded
    glb += struct.pack('<II', len(payload), 0x004e4942) + payload
    output = public / f'models/mate-can-{flavor}.glb'
    output.write_bytes(glb)
    print(f'{output.name}: {len(glb)} bytes')
