export function concentricGeometry(size: number, count: number, thickness: number, gap: number) {
    const outer = size / 2 - 4, available = Math.max(2, outer - 6);
    gap = Math.max(0, Math.min(gap, available / (count * 3)));
    const stroke = Math.max(1, Math.min(thickness, (available - gap * (count - 1)) / count));
    return Array.from({length: count}, (_, index) => ({radius: outer - stroke / 2 - index * (stroke + gap), stroke}));
}
