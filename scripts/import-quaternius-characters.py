#!/usr/bin/env python3
"""Re-download the verified CC0 GLB mirror and actual model thumbnails.
No package dependencies. Official Drive IDs remain in manifest for provenance;
the official endpoint returned quota-exceeded HTML during preparation.
"""
from pathlib import Path
import argparse, hashlib, json, struct, subprocess

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / 'public/assets/characters'

def inspect_glb(path):
    data = path.read_bytes()
    assert data[:4] == b'glTF', f'{path}: not a GLB (possibly an HTML download error)'
    assert struct.unpack_from('<I', data, 4)[0] == 2
    assert struct.unpack_from('<I', data, 8)[0] == len(data)
    length, kind = struct.unpack_from('<II', data, 12)
    assert kind == 0x4e4f534a
    gltf = json.loads(data[20:20 + length])
    assert gltf.get('skins') and gltf.get('animations') and gltf.get('meshes')
    assert all('uri' not in resource or resource['uri'].startswith('data:')
               for resource in gltf.get('buffers', []) + gltf.get('images', [])), 'External dependency'
    names = [a['name'] for a in gltf['animations']]
    for expected in ['Idle', 'Walk', 'Run', 'Jump', 'Victory']:
        assert any(n.split('|')[-1] == expected for n in names), f'Missing {expected}'
    return data, gltf

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    manifest = json.loads((DIRECTORY / 'manifest.json').read_text())
    for asset in manifest['assets']:
        model = DIRECTORY / (asset['id'] + '.glb')
        thumbnail = DIRECTORY / (asset['id'] + '.webp')
        if not args.verify_only:
            for url, output in [(asset['url'], model), (asset['thumbnailUrl'], thumbnail)]:
                temporary = output.with_suffix(output.suffix + '.download')
                subprocess.run(['curl', '--fail', '--location', '--silent', '--show-error',
                                '--max-time', '60', url, '--output', str(temporary)], check=True)
                if output == model:
                    data, _ = inspect_glb(temporary)
                    assert hashlib.sha256(data).hexdigest() == asset['sha256'], 'Source changed; inspect before replacing'
                temporary.replace(output)
        data, gltf = inspect_glb(model)
        assert hashlib.sha256(data).hexdigest() == asset['sha256']
        assert [a['name'] for a in gltf['animations']] == asset['animations']
        assert thumbnail.read_bytes()[:4] == b'RIFF'
        print(f"{asset['id']}: {len(data):,} bytes, {asset['triangles']:,} triangles, {asset['joints']} joints, {len(gltf['animations'])} clips")

if __name__ == '__main__':
    main()
