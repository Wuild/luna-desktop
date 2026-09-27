import {execFileSync} from 'node:child_process';
const tests = ['desktop-grid', 'desktop-placement', 'desktop-launchers', 'widget-snapping', 'weather-model', 'resource-metrics', 'now-playing'];
for (const test of tests) execFileSync('gjs', ['-m', `tests/${test}.test.js`], {stdio: 'inherit', timeout: 20000});
execFileSync('python3', ['tests/now-playing-spectrum.test.py'], {stdio: 'inherit', timeout: 20000});
execFileSync(process.execPath, ['--test', 'tests/standalone.test.mjs'], {stdio: 'inherit'});
execFileSync('gjs', ['-m', 'tests/desktop-settings-smoke.js'], {stdio: 'inherit', env: {...process.env, GSETTINGS_BACKEND: 'memory'}, timeout: 20000});
