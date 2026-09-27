import {gridMetrics, gridOrigin, nearestCell, arrangeIcons, cellPosition, groupDrop, intersects} from '../dist/desktop/layout.js';
function assert(condition, message) { if (!condition) throw new Error(message); }
const monitor = {width: 1280, height: 674};
const grid = gridMetrics(monitor, 96, 104);
const item = name => ({file: {get_uri: () => name}});
const items = ['one', 'two', 'three', 'four'].map(item);
const positions = {one: {x: 0.95, y: 0.95}, two: {x: 0.95, y: 0.95}, three: {x: -10, y: 30}};
const arranged = arrangeIcons(items, positions, monitor, grid);
assert(arranged.size === 4, 'All icons get cells');
assert(new Set([...arranged.values()].map(cell => `${cell.column}:${cell.row}`)).size === 4, 'Colliding saved positions resolve to distinct cells');
for (const {x, y} of arranged.values()) {
    assert((x - gridOrigin(grid).x) % (grid.width + grid.gap) === 0, 'Horizontal grid alignment');
    assert((y - gridOrigin(grid).y) % (grid.height + grid.gap) === 0, 'Vertical grid alignment');
    assert(x >= 0 && y >= 0 && x + grid.width <= monitor.width && y + grid.height <= monitor.height, 'Cells fit monitor');
}
const near = nearestCell(grid, 125, 142, new Set(['1:1']));
assert(near && !(near.column === 1 && near.row === 1), 'Drops avoid occupied cells');
const full = new Set();
for (let c = 0; c < grid.columns; c++) for (let r = 0; r < grid.rows; r++) full.add(`${c}:${r}`);
assert(nearestCell(grid, 0, 0, full) === null, 'Full grid never overlaps another icon');
for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    const cell = arrangeIcons([items[0]], {}, monitor, grid, corner).get(items[0]);
    assert(cell.column === (corner.endsWith('right') ? grid.columns - 1 : 0), `Corner column: ${corner}`);
    assert(cell.row === (corner.startsWith('bottom') ? grid.rows - 1 : 0), `Corner row: ${corner}`);
}
const right = gridMetrics(monitor, 104, 102, 16, 8, 'top-right');
const last = cellPosition(right, right.columns - 1, 0);
assert(monitor.width - last.x - right.width === cellPosition(right, 0, 0).x, 'Grid has equal left and right margins');
assert(nearestCell(right, 0, 0).column === 0, 'Top-right arrangement can still drop at the left edge');
const bottom = gridMetrics(monitor, 104, 102, 16, 8, 'bottom-right');
assert(monitor.height - cellPosition(bottom, 0, bottom.rows - 1).y - bottom.height === cellPosition(bottom, 0, 0).y, 'Grid has equal top and bottom margins');
for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right'])
    assert(JSON.stringify(gridOrigin(gridMetrics(monitor, 104, 102, 16, 8, corner))) === JSON.stringify(gridOrigin(right)), 'Arrangement never moves the grid');
const group = [cellPosition(grid, 0, 0), cellPosition(grid, 0, 1)];
const moved = groupDrop(grid, group, 208, 112, new Set(['2:1']));
assert(moved && moved[1].row - moved[0].row === 1 && moved[0].column === moved[1].column,
    'Group preserves its shape when avoiding obstacles');
assert(moved.every(cell => !(cell.column === 2 && cell.row === 1)), 'Group avoids occupied cells');
assert(intersects({x: 0, y: 0, width: 120, height: 230}, group[0], grid.width, grid.height), 'Box intersects first icon');
assert(!intersects({x: 400, y: 400, width: 10, height: 10}, group[0], grid.width, grid.height), 'Box excludes distant icon');
print('LUNA_DESKTOP_DESKTOP_GRID_PASS');
