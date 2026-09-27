#!/usr/bin/env python3
"""Build the optional GNOME 50 rectangle bridge against installed Mutter headers."""
import hashlib
import json
import os
from pathlib import Path
import platform
import shlex
import subprocess

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'native/build'
OUT.mkdir(exist_ok=True)
def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)
def pkg(*args):
    return subprocess.check_output(['pkg-config', *args], text=True).strip()
flags = shlex.split(pkg('--cflags', 'libmutter-18'))
libs = shlex.split(pkg('--libs', 'gobject-2.0'))
girdir = pkg('--variable=girdir', 'libmutter-18')
# On split developer/runtime installations, this can be the runtime's private libdir.
private_libdir = os.environ.get('LUNA_MUTTER_LIBDIR', pkg('--variable=libdir', 'mutter-clutter-18'))
run([os.environ.get('CC', 'cc'), '-shared', '-fPIC', '-Wall', '-Wextra', '-Werror',
     '-Wl,-z,relro,-z,now', '-o', str(OUT / 'libluna-tiling.so'),
     str(ROOT / 'native/luna-tiling.c'), *flags, *libs])
env = dict(os.environ, GI_SCANNER_DISABLE_CACHE='1')
env['LD_LIBRARY_PATH'] = private_libdir + ':' + env.get('LD_LIBRARY_PATH', '')
run(['g-ir-scanner', '--no-libtool', '--warn-all', '--warn-error', '--namespace=LunaTiling', '--nsversion=1.0',
     '--identifier-prefix=LunaTiling', '--symbol-prefix=luna_tiling', '--include=Meta-18',
     f'--add-include-path={girdir}', '--library=luna-tiling', f'--library-path={OUT}',
     f'--library-path={private_libdir}', '--pkg=libmutter-18', f'--output={OUT}/LunaTiling-1.0.gir',
     str(ROOT / 'native/luna-tiling.h'), str(ROOT / 'native/luna-tiling.c')], env=env)
run(['g-ir-compiler', f'--includedir={girdir}', str(OUT / 'LunaTiling-1.0.gir'),
     f'--output={OUT}/LunaTiling-1.0.typelib'])
fingerprint = hashlib.sha256(b''.join((ROOT / p).read_bytes() for p in
    ['native/luna-tiling.h', 'native/luna-tiling.c', 'scripts/build-native.py'])).hexdigest()
(OUT / 'build.json').write_text(json.dumps({'meta': '18', 'architecture': platform.machine(), 'sourceHash': fingerprint}))
print(f'Built optional native tiling bridge in {OUT}')
