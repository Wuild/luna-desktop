import type {Rectangle, Size} from '../icons/types.js';
export interface SnappedRectangle extends Rectangle {guides: {x?: number; y?: number};}
// All coordinates are local logical pixels on the destination monitor.
export function snapWidget(rect: Rectangle, others: readonly Rectangle[], area: Size, distance = 10, margin = 16): SnappedRectangle {
    const axes = [
        {key: 'x', size: 'width', extent: area.width},
        {key: 'y', size: 'height', extent: area.height},
    ] as const;
    const result: SnappedRectangle = {...rect, guides: {}};
    for (const {key, size, extent} of axes) {
        const anchors = [0, rect[size] / 2, rect[size]];
        const candidates = [{position: margin, guide: margin},
            {position: (extent - rect[size]) / 2, guide: extent / 2},
            {position: extent - margin - rect[size], guide: extent - margin}];
        for (const other of others) {
            const targets = [other[key], other[key] + other[size] / 2, other[key] + other[size]];
            // Match like edges/centers; also allow a consistent 12px gutter.
            targets.forEach((target, i) => candidates.push({position: target - anchors[i], guide: target}));
            candidates.push({position: other[key] + other[size] + 12, guide: other[key] + other[size] + 12},
                {position: other[key] - 12 - rect[size], guide: other[key] - 12});
        }
        let best = null, delta = distance + 0.001;
        for (const candidate of candidates) {
            if (candidate.position < margin || candidate.position + rect[size] > extent - margin) continue;
            const difference = Math.abs(candidate.position - rect[key]);
            if (difference < delta) { best = candidate; delta = difference; }
        }
        if (best) { result[key] = best.position; result.guides[key] = best.guide; }
    }
    return result;
}
