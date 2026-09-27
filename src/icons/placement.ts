import type {Monitor, SavedPosition} from './types.js';
// Distances from screen edges survive monitor and work-area resizing. Legacy
// normalized positions are migrated as soon as an item is laid out once.
export function anchoredPosition(monitor: Pick<Monitor, 'id' | 'width' | 'height'>, x: number, y: number, width: number, height: number, previous: SavedPosition | null = null): SavedPosition {
    const anchorX = previous?.anchorX ?? (x + width / 2 > monitor.width / 2 ? 'right' : 'left');
    const anchorY = previous?.anchorY ?? (y + height / 2 > monitor.height / 2 ? 'bottom' : 'top');
    return {monitor: monitor.id, x: x / monitor.width, y: y / monitor.height, anchorX, anchorY,
        offsetX: Number.isFinite(previous?.offsetX) ? previous!.offsetX! : anchorX === 'right' ? monitor.width - x - width : x,
        offsetY: Number.isFinite(previous?.offsetY) ? previous!.offsetY! : anchorY === 'bottom' ? monitor.height - y - height : y};
}
export function restoredPosition(saved: SavedPosition, monitor: Pick<Monitor, 'width' | 'height'>, width: number, height: number) {
    return {
        x: Number.isFinite(saved?.offsetX) ? saved.anchorX === 'right' ? monitor.width - width - saved.offsetX! : saved.offsetX! : saved.x * monitor.width,
        y: Number.isFinite(saved?.offsetY) ? saved.anchorY === 'bottom' ? monitor.height - height - saved.offsetY! : saved.offsetY! : saved.y * monitor.height,
    };
}
