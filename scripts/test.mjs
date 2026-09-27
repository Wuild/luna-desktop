import {execFileSync} from 'node:child_process';
execFileSync('gjs', ['-m', 'tests/audio-capture-smoke.js'], {stdio: 'inherit', timeout: 10000});
const tests = ['desktop-grid', 'desktop-placement', 'desktop-launchers', 'widget-snapping', 'weather-model', 'resource-metrics', 'now-playing'];
for (const test of tests) execFileSync('gjs', ['-m', `tests/${test}.test.js`], {stdio: 'inherit', timeout: 20000});
execFileSync(process.execPath, ['--test', 'tests/now-playing-spectrum.test.mjs'], {stdio: 'inherit', timeout: 20000});
execFileSync(process.execPath, ['--test', 'tests/standalone.test.mjs', 'tests/snap-layouts.test.mjs'], {stdio: 'inherit'});
execFileSync('gjs', ['-m', 'tests/desktop-settings-smoke.js'], {stdio: 'inherit', env: {...process.env, GSETTINGS_BACKEND: 'memory'}, timeout: 20000});
