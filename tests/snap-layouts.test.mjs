import {test} from 'node:test';
import assert from 'node:assert/strict';
import {layouts, frame, edgeTarget, boundaries, resizeBoundary} from '../src/shell/snapLayouts.js';
test('layouts exactly cover monitors, including negative origins and odd widths', () => {
    for (const layout of layouts) {
        const area = {x: -1921, y: 37, width: 1921, height: 1043};
        const frames = layout.tiles.map(t => frame(area, t));
        assert.equal(frames.reduce((sum, r) => sum + r.width * r.height, 0), area.width * area.height);
        for (const a of frames) for (const b of frames) if (a !== b)
            assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
    }
});
test('edges and corners choose their matching tile', () => {
    const a = {x: -1000, y: 30, width: 1000, height: 800};
    assert.deepEqual(edgeTarget(a, -999, 400), {layout: 0, index: 0});
    assert.deepEqual(edgeTarget(a, -1, 829), {layout: 4, index: 3});
    assert.deepEqual(edgeTarget(a, -999, 31), {layout: 4, index: 0});
    assert.equal(edgeTarget(a, -500, 400), null);
    assert.deepEqual(edgeTarget(a, -500, 30), {layout: 5, index: 0});
});
test('shared resizing preserves coverage and enforces minimum sizes', () => {
    const tiles = layouts[4].tiles;
    const b = boundaries(tiles).find(b => b.axis === 0);
    const resized = resizeBoundary(tiles, b, .95, tiles.map(() => [.2, .2]));
    assert.equal(resized[0][2], .8);
    assert.equal(resized[1][0], .8);
    assert.equal(resized[2][2], .8);
    assert.equal(resized[3][0], .8);
    assert.deepEqual(tiles, layouts[4].tiles);
    assert.ok(Math.abs(resized.reduce((sum, t) => sum + t[2] * t[3], 0) - 1) < 1e-9);
});
test('impossible minimum sizes leave the layout intact', () => {
    const tiles = layouts[0].tiles;
    assert.deepEqual(resizeBoundary(tiles, boundaries(tiles)[0], .8, [[.7, .2], [.7, .2]]), tiles);
});

test('spacing is exact at shared edges, including odd gaps', () => {
    const area = {x: -1001, y: 31, width: 1001, height: 801};
    for (const gap of [0, 1, 8, 13, 48]) {
        const left = frame(area, layouts[0].tiles[0], gap);
        const right = frame(area, layouts[0].tiles[1], gap);
        assert.equal(right.x - left.x - left.width, gap);
        assert.equal(left.x - area.x, gap);
        assert.equal(area.x + area.width - right.x - right.width, gap);
        const top = frame(area, layouts[4].tiles[0], gap);
        const bottom = frame(area, layouts[4].tiles[2], gap);
        assert.equal(bottom.y - top.y - top.height, gap);
    }
});

// Alt+Tab packs unequal widths without stretching portrait or ultrawide windows.
import {switcherLayout, adjacentRow} from '../src/shell/switcherLayout.js';
test('switcher cards preserve natural widths, a minimum, and row limits', () => {
    const layout = switcherLayout([.5, 2, 1, 4], 800);
    assert.deepEqual(layout.widths, [180, 360, 180, 720]);
    assert.equal(layout.previewHeight, 180);
    assert.ok(layout.panelWidth <= 800);
    assert.deepEqual(layout.rows.flatMap(row => row.indices), [0, 1, 2, 3]);
    assert.ok(layout.rows.every(row => row.width <= 776));
    const narrow = switcherLayout([20, .1], 300);
    assert.ok(narrow.widths.every(width => width <= 250));
    assert.ok(narrow.panelWidth <= 300);
});
test('vertical switcher navigation chooses nearest card in adjacent row', () => {
    const layout = switcherLayout([1, 2, 1, 1], 650);
    assert.deepEqual(layout.rows.map(row => row.indices), [[0, 1], [2, 3]]);
    assert.equal(adjacentRow(layout, 0, 1), 2);
    assert.equal(adjacentRow(layout, 1, 1), 3);
    assert.equal(adjacentRow(layout, 3, -1), 1);
    assert.equal(adjacentRow(layout, 0, -1), 0);
});
