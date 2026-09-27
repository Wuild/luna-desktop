// Equal-height cards with natural widths. Preserve MRU order when packing rows.
export function switcherLayout(aspects, maxWidth, previewHeight = 180, minWidth = 180, options = {}) {
    const padding = (options.padding ?? 12) * 2, spacing = options.spacing ?? 12, decoration = 14 + spacing;
    const available = Math.max(1, maxWidth - padding);
    const widths = aspects.map(aspect => Math.min(Math.max(1, available - decoration),
        Math.max(minWidth, Math.round(previewHeight * (Number.isFinite(aspect) && aspect > 0 ? aspect : 1)))));
    const rows = [];
    for (let index = 0; index < widths.length; index++) {
        const width = widths[index] + decoration;
        let row = rows.at(-1);
        if (!row || row.width + width > available) { row = {indices: [], width: 0}; rows.push(row); }
        row.indices.push(index); row.width += width;
    }
    return {widths, rows, previewHeight, padding, spacing, decoration, panelWidth: Math.max(0, ...rows.map(row => row.width)) + padding};
}

export function adjacentRow(layout, index, direction) {
    const rowIndex = layout.rows.findIndex(row => row.indices.includes(index));
    const target = layout.rows[rowIndex + direction];
    if (!target) return index;
    const centers = row => {
        let x = (layout.panelWidth - layout.padding - row.width) / 2;
        return row.indices.map(i => { const width = layout.widths[i] + layout.decoration; const center = x + width / 2; x += width; return [i, center]; });
    };
    const x = centers(layout.rows[rowIndex]).find(([i]) => i === index)[1];
    return centers(target).reduce((best, item) => Math.abs(item[1] - x) < Math.abs(best[1] - x) ? item : best)[0];
}
