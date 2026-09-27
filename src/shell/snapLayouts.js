// Normalized rectangles keep layouts independent of monitor origin and scale.
export const layouts = [
    {name: 'Halves', tiles: [[0, 0, .5, 1], [.5, 0, .5, 1]]},
    {name: 'Large left', tiles: [[0, 0, 2 / 3, 1], [2 / 3, 0, 1 / 3, 1]]},
    {name: 'Thirds', tiles: [[0, 0, 1 / 3, 1], [1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 1 / 3, 1]]},
    {name: 'Main and two', tiles: [[0, 0, .5, 1], [.5, 0, .5, .5], [.5, .5, .5, .5]]},
    {name: 'Quarters', tiles: [[0, 0, .5, .5], [.5, 0, .5, .5], [0, .5, .5, .5], [.5, .5, .5, .5]]},
    {name: 'Maximize', tiles: [[0, 0, 1, 1]]},
];
export function frame(area, tile, gap = 0) {
    const [x, y, w, h] = tile;
    const left = Math.round(area.x + area.width * x), top = Math.round(area.y + area.height * y);
    const insetLeft = x === 0 ? gap : Math.floor(gap / 2);
    const insetTop = y === 0 ? gap : Math.floor(gap / 2);
    const insetRight = x + w >= .9999 ? gap : Math.ceil(gap / 2);
    const insetBottom = y + h >= .9999 ? gap : Math.ceil(gap / 2);
    return {x: left + insetLeft, y: top + insetTop,
        width: Math.max(1, Math.round(area.x + area.width * (x + w)) - left - insetLeft - insetRight),
        height: Math.max(1, Math.round(area.y + area.height * (y + h)) - top - insetTop - insetBottom)};
}
export function edgeTarget(area, x, y, distance = 24) {
    const left = x <= area.x + distance, right = x >= area.x + area.width - distance;
    const top = y <= area.y + distance, bottom = y >= area.y + area.height - distance;
    if (left || right) {
        if (top || bottom) return {layout: 4, index: (bottom ? 2 : 0) + (right ? 1 : 0)};
        return {layout: 0, index: right ? 1 : 0};
    }
    return top ? {layout: 5, index: 0} : null;
}
const near = (a, b) => Math.abs(a - b) < .0001;
export function boundaries(tiles) {
    const result = [];
    for (const axis of [0, 1]) {
        for (const tile of tiles) {
            const value = tile[axis] + tile[axis + 2];
            if (value >= .9999 || result.some(b => b.axis === axis && near(b.value, value))) continue;
            const before = tiles.map((t, i) => near(t[axis] + t[axis + 2], value) ? i : -1).filter(i => i >= 0);
            const after = tiles.map((t, i) => near(t[axis], value) ? i : -1).filter(i => i >= 0);
            if (after.length) result.push({axis, value, before, after});
        }
    }
    return result;
}
export function resizeBoundary(tiles, boundary, value, minimums) {
    const {axis, before, after} = boundary;
    const low = Math.max(...before.map(i => tiles[i][axis] + minimums[i][axis]));
    const high = Math.min(...after.map(i => tiles[i][axis] + tiles[i][axis + 2] - minimums[i][axis]));
    if (low > high) return tiles.map(t => [...t]);
    const position = Math.max(low, Math.min(high, value));
    return tiles.map((tile, i) => {
        const t = [...tile];
        if (before.includes(i)) t[axis + 2] = position - t[axis];
        if (after.includes(i)) { t[axis + 2] += t[axis] - position; t[axis] = position; }
        return t;
    });
}
