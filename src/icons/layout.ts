import type {Monitor, Grid, Cell, IconItem, Corner, SavedPosition, Rectangle, Point} from './types.js';
import {restoredPosition} from './placement.js';
export function gridMetrics(monitor: Pick<Monitor, 'width' | 'height'>, width: number, height: number, padding = 16, gap = 8, corner: Corner = 'top-left'): Grid {
    return {width, height, padding, gap, corner, areaWidth: monitor.width, areaHeight: monitor.height,
        columns: Math.max(1, Math.floor((monitor.width - padding * 2 + gap) / (width + gap))),
        rows: Math.max(1, Math.floor((monitor.height - padding * 2 + gap) / (height + gap)))};
}
export function gridOrigin(grid: Grid) {
    // Center the lattice itself. Arrangement corners only choose which cells
    // fill first; they must not change drop coordinates or edge access.
    const occupiedWidth = grid.columns * grid.width + (grid.columns - 1) * grid.gap;
    const occupiedHeight = grid.rows * grid.height + (grid.rows - 1) * grid.gap;
    return {
        x: Math.max(0, (grid.areaWidth - occupiedWidth) / 2),
        y: Math.max(0, (grid.areaHeight - occupiedHeight) / 2),
    };
}
export function cellPosition(grid: Grid, column: number, row: number): Cell {
    const origin = gridOrigin(grid);
    return {column, row, x: origin.x + column * (grid.width + grid.gap),
        y: origin.y + row * (grid.height + grid.gap)};
}
export function nearestCell(grid: Grid, x: number, y: number, occupied: ReadonlySet<string> = new Set()): Cell | null {
    const origin = gridOrigin(grid);
    const column = Math.max(0, Math.min(grid.columns - 1, Math.round((x - origin.x) / (grid.width + grid.gap))));
    const row = Math.max(0, Math.min(grid.rows - 1, Math.round((y - origin.y) / (grid.height + grid.gap))));
    let best = null, distance = Infinity;
    for (let c = 0; c < grid.columns; c++) for (let r = 0; r < grid.rows; r++) {
        if (occupied.has(`${c}:${r}`)) continue;
        const d = (c - column) ** 2 + (r - row) ** 2;
        if (d < distance) { distance = d; best = cellPosition(grid, c, r); }
    }
    return best;
}
// Preserve saved cells before assigning new icons, resolving collisions and
// clamping old positions after a display or icon-size change.
export function arrangeIcons<T extends IconItem>(items: readonly T[], positions: Record<string, SavedPosition>, monitor: Pick<Monitor, 'width' | 'height'>, grid: Grid, corner: Corner = 'top-left', snap = true, drivesOpposite = true): Map<T, Cell> {
    const result = new Map<T, Cell>(), occupied = new Set<string>();
    const assign = (item: T, x: number, y: number) => {
        const cell = nearestCell(grid, x, y, occupied);
        if (cell) { occupied.add(`${cell.column}:${cell.row}`); result.set(item, cell); }
    };
    for (const item of items) {
        const saved = positions[item.file.get_uri()];
        if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
            const point = restoredPosition(saved, monitor, grid.width, grid.height);
            if (snap) assign(item, point.x, point.y);
            else {
                const x = Math.max(0, Math.min(point.x, monitor.width - grid.width));
                const y = Math.max(0, Math.min(point.y, monitor.height - grid.height));
                const cell = nearestCell(grid, x, y);
                if (!cell) continue;
                result.set(item, {...cell, x, y});
                occupied.add(`${cell.column}:${cell.row}`);
            }
        }
    }
    for (const item of items) if (!result.has(item)) {
        let cell;
        for (let ci = 0; ci < grid.columns && !cell; ci++) for (let ri = 0; ri < grid.rows; ri++) {
            const c = (item.drive && drivesOpposite ? !corner.endsWith('right') : corner.endsWith('right')) ? grid.columns - 1 - ci : ci;
            const r = corner.startsWith('bottom') ? grid.rows - 1 - ri : ri;
            if (!occupied.has(`${c}:${r}`)) { cell = cellPosition(grid, c, r); break; }
        }
        if (cell) assign(item, cell.x, cell.y);
    }
    return result;
}

// Find a single grid translation for the whole selection, preserving its shape.
export function groupDrop(grid: Grid, cells: readonly Cell[], dx: number, dy: number, occupied: ReadonlySet<string> = new Set()): Cell[] | null {
    if (!cells.length) return null;
    const minColumn = Math.min(...cells.map(cell => cell.column));
    const maxColumn = Math.max(...cells.map(cell => cell.column));
    const minRow = Math.min(...cells.map(cell => cell.row));
    const maxRow = Math.max(...cells.map(cell => cell.row));
    let best = null, distance = Infinity;
    for (let dc = -minColumn; dc < grid.columns - maxColumn; dc++) {
        for (let dr = -minRow; dr < grid.rows - maxRow; dr++) {
            if (cells.some(cell => occupied.has(`${cell.column + dc}:${cell.row + dr}`))) continue;
            const score = (dc * (grid.width + grid.gap) - dx) ** 2 + (dr * (grid.height + grid.gap) - dy) ** 2;
            if (score < distance) {
                distance = score;
                best = cells.map(cell => cellPosition(grid, cell.column + dc, cell.row + dr));
            }
        }
    }
    return best;
}
export function intersects(rect: Rectangle, cell: Point, width: number, height: number): boolean {
    return rect.x < cell.x + width && rect.x + rect.width > cell.x &&
        rect.y < cell.y + height && rect.y + rect.height > cell.y;
}
