import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
const root = new URL('../dist/', import.meta.url);
test('Desktop has its own identity and schema', () => {
    const metadata = JSON.parse(readFileSync(new URL('metadata.json', root)));
    assert.equal(metadata.uuid, 'luna-desktop@wuild');
    assert.equal(metadata['settings-schema'], 'org.gnome.shell.extensions.luna-desktop');
    const schema = readFileSync(new URL('schemas/org.gnome.shell.extensions.luna-desktop.gschema.xml', root), 'utf8');
    assert(!schema.includes('lunabar'));
    for (const [, key] of schema.matchAll(/<key name="([^"]+)"/g)) assert(key.startsWith('desktop-'), key);
});
test('All relative module dependencies and widget assets are packaged', () => {
    function inspect(folder) {
        for (const entry of readdirSync(folder, {withFileTypes: true})) {
            const file = new URL(entry.name, folder);
            if (entry.isDirectory()) inspect(new URL(entry.name + '/', folder));
            else if (entry.name.endsWith('.js')) {
                const source = readFileSync(file, 'utf8');
                for (const [, specifier] of source.matchAll(/(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g)) {
                    if (specifier.startsWith('.')) assert(existsSync(new URL(specifier, file)), `${file}: ${specifier}`);
                }
            }
        }
    }
    inspect(root);
    for (const id of ['clock', 'sticky-note', 'weather', 'now-playing', 'resources']) {
        const manifest = JSON.parse(readFileSync(new URL(`desktop/widgets/${id}/widget.json`, root)));
        assert.equal(manifest.id, id);
        assert(existsSync(new URL(`desktop/widgets/${id}/widget.js`, root)));
    }
    assert(existsSync(new URL('desktop/widgets/now-playing/spectrum.py', root)));
});
