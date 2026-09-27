import {cp, mkdir, readdir, rm, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
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
    execFileSync('glib-compile-schemas', ['--strict', path.join(dist, 'schemas')], {stdio: 'inherit'});
    await writeFile(path.join(dist, 'package.json'), JSON.stringify({type: 'module'}));
    console.log('Built Luna - Desktop in dist/');
}
