import {anchoredPosition, restoredPosition} from '../dist/desktop/placement.js';
import {arrangeIcons, gridMetrics} from '../dist/desktop/layout.js';
function assert(value, message) { if (!value) throw new Error(message); }
const large = {id: 'display', width: 1600, height: 1000};
const small = {id: 'display', width: 1100, height: 700};
const right = anchoredPosition(large, 1280, 804, 304, 180);
const smaller = restoredPosition(right, small, 304, 180);
assert(smaller.x === 780 && smaller.y === 504, 'Widget keeps its right and bottom edge distances');
const refreshed = anchoredPosition(small, smaller.x, smaller.y, 304, 180, right);
assert(JSON.stringify(restoredPosition(refreshed, large, 304, 180)) === JSON.stringify({x: 1280, y: 804}), 'Repeated resize is reversible');
const left = anchoredPosition(large, 16, 16, 104, 102);
assert(restoredPosition(left, small, 104, 102).x === 16, 'Left icons do not move proportionally');
const file = {file: {get_uri: () => 'drive'}, drive: true};
const original = anchoredPosition(large, 1472, 16, 104, 102);
let record = original;
for (const monitor of [small, large, small, large]) {
    const grid = gridMetrics(monitor, 104, 102);
    const cell = arrangeIcons([file], {drive: record}, monitor, grid).get(file);
    record = anchoredPosition(monitor, cell.x, cell.y, 104, 102, record);
}
assert(record.offsetX === original.offsetX && record.offsetY === original.offsetY, 'Grid rounding does not accumulate resize drift');
print('LUNA_DESKTOP_DESKTOP_PLACEMENT_PASS');
