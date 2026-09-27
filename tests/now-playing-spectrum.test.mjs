import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RATE, SIZE, levels, chooseStream, latestWindow} from '../dist/desktop/widgets/now-playing/spectrum.js';
test('stream selection prefers the player PID and excludes paused or unrelated streams', () => {
    const streams = [{index: 1, properties: {'application.name': 'Unrelated'}},
        {index: 2, properties: {'application.name': 'Firefox'}},
        {index: 3, properties: {'application.process.id': '123'}}];
    const player = {Identity: 'Firefox', pid: 123};
    assert.equal(chooseStream(streams, player).index, 3);
    streams[2].corked = true;
    assert.equal(chooseStream(streams, player).index, 2);
    assert.equal(chooseStream(streams.slice(0, 1), player), null);
    assert.equal(chooseStream(streams, {}), null);
    assert.equal(chooseStream([{properties: {'application.id': 'org.test.Player'}}], {DesktopEntry: 'org.test.Player.desktop'})?.properties['application.id'], 'org.test.Player');
});
test('FFT preserves silence, loudness contrast and sensitivity', () => {
    const tone = amplitude => Array.from({length: SIZE}, (_, i) => amplitude * Math.sin(2 * Math.PI * 1000 * i / RATE));
    assert.deepEqual(levels(Array(SIZE).fill(0)), Array(24).fill(0));
    const quiet = Math.max(...levels(tone(0.01))), loud = Math.max(...levels(tone(0.4)));
    assert(loud > quiet * 4 && loud > 0.8);
    assert(Math.max(...levels(tone(0.05), 24, 2)) > Math.max(...levels(tone(0.05))));
    assert(levels(tone(0.2)).every(value => value >= 0 && value <= 1));
});
test('backlogs retain only the newest aligned frame and overlap', () => {
    const bytes = new Uint8Array(SIZE * 16 + 2);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < SIZE * 4; i++) view.setFloat32(i * 4, i, true);
    const [frame, retained] = latestWindow(bytes);
    assert.equal(new DataView(frame.buffer).getFloat32(0, true), SIZE * 3);
    assert.equal(retained.length, (SIZE - Math.round(RATE / 60)) * 4 + 2);
    assert.equal(latestWindow(retained)[0], null);
});
