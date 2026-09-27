import {cp, mkdir, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import os from 'node:os';
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = process.env.LUNA_BUILD_DIR || path.join(root, 'dist');
if (process.argv.includes('--clean')) await rm(dist, {recursive: true, force: true});
else {
    await mkdir(dist, {recursive: true});
    await cp(path.join(root, 'metadata.json'), path.join(dist, 'metadata.json'));
    await cp(path.join(root, 'LICENSE'), path.join(dist, 'LICENSE'));
    await cp(path.join(root, 'LICENSE-NOTICE'), path.join(dist, 'LICENSE-NOTICE'));
    await cp(path.join(root, 'schemas'), path.join(dist, 'schemas'), {recursive: true});
    async function assets(directory) {
        for (const entry of await readdir(path.join(root, 'src', directory), {withFileTypes: true})) {
            const relative = path.join(directory, entry.name);
            if (entry.name === '__pycache__') continue;
            if (entry.isDirectory()) await assets(relative);
            else if (!/\.(ts|js)$/.test(entry.name)) await cp(path.join(root, 'src', relative), path.join(dist, relative));
        }
    }
    await assets('');
    const nativeRoot = path.join(root, 'native/build');
    try {
        const manifest = JSON.parse(await readFile(path.join(nativeRoot, 'build.json'), 'utf8'));
        const hash = createHash('sha256');
        for (const file of ['native/luna-tiling.h', 'native/luna-tiling.c', 'scripts/build-native.py']) hash.update(await readFile(path.join(root, file)));
        if (manifest.sourceHash === hash.digest('hex') && manifest.meta === '18' && manifest.architecture === os.machine()) {
            await mkdir(path.join(dist, 'native'), {recursive: true});
            for (const file of ['libluna-tiling.so', 'LunaTiling-1.0.typelib', 'build.json'])
                await cp(path.join(nativeRoot, file), path.join(dist, 'native', file));
        } else console.warn('Native tiling bridge is stale; run pnpm build:native to rebuild it.');
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
    execFileSync('glib-compile-schemas', ['--strict', path.join(dist, 'schemas')], {stdio: 'inherit'});
    await writeFile(path.join(dist, 'package.json'), JSON.stringify({type: 'module'}));
    console.log(`Built Luna - Desktop in ${dist}`);
}
