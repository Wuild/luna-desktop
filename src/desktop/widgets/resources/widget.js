import Gtk from 'gi://Gtk?version=4.0';
import Cairo from 'cairo';
import {ResourceSampler} from './metrics.js';
import {concentricGeometry} from './rings.js';
import {applyTextStyle} from '../textStyle.js';

const NAMES = {cpu: 'CPU', gpu: 'GPU', memory: 'MEM', swap: 'SWAP', disk: 'DISK', download: 'DOWN', upload: 'UP', battery: 'BAT'};
const safeColor = value => /^#[0-9a-f]{6}$/i.test(value) ? value : '#80bfff';
const rgb = value => [1, 3, 5].map(offset => parseInt(safeColor(value).slice(offset, offset + 2), 16) / 255);
const isRate = metric => metric === 'download' || metric === 'upload';
const format = (metric, value) => value === null ? '—' : isRate(metric) ? value >= 1e6 ? `${(value / 1e6).toFixed(1)}MB/s` : `${Math.round(value / 1e3)}KB/s` : `${Math.round(value)}%`;

export function create(context) {
    const options = context.options;
    const size = Math.max(48, Math.min(180, Number(options.ringSize) || 88));
    const shadow = options.shadow !== false;
    const shadowAlpha = Math.max(0.1, Math.min(1, Number(options.shadowStrength ?? 80) / 100));
    const thickness = Math.max(2, Math.min(18, Number(options.thickness) || 6));
    const metrics = Object.keys(NAMES).filter(metric => options[`show${metric[0].toUpperCase()}${metric.slice(1)}`] ?? ['cpu', 'gpu', 'memory'].includes(metric));
    if (!metrics.length) return new Gtk.Label({label: context.editing ? 'Choose rings in Customize' : ''});
    const concentric = options.layout === 'single';
    const degrees = {full: 360, 'three-quarter': 270, half: 180, quarter: 90}[options.arc] ?? Math.max(30, Math.min(360, Number(options.arcDegrees) || 270));
    const sweep = degrees * Math.PI / 180;
    const start = -Math.PI / 2 + (Number(options.rotation) || 0) * Math.PI / 180;
    const values = Object.fromEntries(metrics.map(metric => [metric, null]));
    const drawings = [], labels = [];
    const drawRing = (cr, width, height, metric, radius, stroke) => {
        cr.setLineCap(Cairo.LineCap.ROUND);
        if (shadow) for (const [extra, alpha, offset] of [[6, 0.12, 2], [3, 0.22, 1], [0, 0.45, 1]]) {
            cr.setLineWidth(stroke + extra); cr.setSourceRGBA(0, 0, 0, alpha * shadowAlpha);
            cr.arc(width / 2, height / 2 + offset, radius, start, start + sweep); cr.stroke();
        }
        cr.setLineWidth(stroke);
        cr.setSourceRGBA(...rgb(options.textColor || '#ffffff'), 0.16);
        cr.arc(width / 2, height / 2, radius, start, start + sweep); cr.stroke();
        const value = values[metric];
        const progress = isRate(metric) ? Math.min(100, value * 8 / (Math.max(1, Number(options.networkScale) || 100) * 1e6) * 100) : value;
        if (progress !== null && progress > 0) {
            cr.setSourceRGB(...rgb(options[`${metric}Color`]));
            cr.arc(width / 2, height / 2, radius, start, start + progress / 100 * sweep); cr.stroke();
        }
    };
    const drawingArea = () => new Gtk.DrawingArea({content_width: size, content_height: size, halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER});
    let content;
    if (concentric) {
        content = new Gtk.Box({orientation: options.orientation === 'vertical' ? Gtk.Orientation.VERTICAL : Gtk.Orientation.HORIZONTAL,
            spacing: 12, halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER});
        const drawing = drawingArea();
        drawing.set_draw_func((_area, cr, width, height) => {
            const geometry = concentricGeometry(Math.min(width, height), metrics.length, thickness, Number(options.ringGap) || 0);
            metrics.forEach((metric, index) => drawRing(cr, width, height, metric, geometry[index].radius, geometry[index].stroke));
        });
        drawings.push(drawing); content.append(drawing);
        if (options.showLabels !== false || options.showValues !== false) {
            const legend = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 4, valign: Gtk.Align.CENTER});
            for (const metric of metrics) {
                const label = new Gtk.Label({xalign: 0}); applyTextStyle(label, options);
                legend.append(label); labels.push({label, metric, legend: true});
            }
            content.append(legend);
        }
    } else {
        const columns = options.orientation === 'vertical' ? 1 : options.orientation === 'horizontal' ? metrics.length :
            Math.max(1, Math.min(metrics.length, Math.floor((options.width - 24) / (size + 10))));
        content = new Gtk.FlowBox({selection_mode: Gtk.SelectionMode.NONE, homogeneous: true,
            column_spacing: 10, row_spacing: 10, min_children_per_line: options.orientation === 'horizontal' ? columns : 1, max_children_per_line: columns});
        for (const metric of metrics) {
            const column = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 4});
            const label = new Gtk.Label({halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER, can_target: false, visible: options.showValues !== false});
            applyTextStyle(label, options); labels.push({label, metric});
            const overlay = new Gtk.Overlay(), drawing = drawingArea();
            drawing.set_draw_func((_area, cr, width, height) => drawRing(cr, width, height, metric, Math.max(1, Math.min(width, height) / 2 - thickness / 2 - 2), thickness));
            drawings.push(drawing); overlay.set_child(drawing); overlay.add_overlay(label); column.append(overlay);
            if (options.showLabels !== false) {
                const title = new Gtk.Label({label: NAMES[metric]}); applyTextStyle(title, options); column.append(title);
            }
            content.insert(column, -1);
        }
    }
    const updateLabels = () => labels.forEach(({label, metric, legend}) => {
        const text = format(metric, values[metric]);
        if (legend) label.set_markup(`<span foreground="${safeColor(options[`${metric}Color`])}">●</span> ${options.showLabels !== false ? NAMES[metric] : ''}${options.showLabels !== false && options.showValues !== false ? '  ' : ''}${options.showValues !== false ? text : ''}`);
        else {
            const textSize = Math.max(9, Math.min(size * 0.21, (size - thickness * 2 - 14) / (text.length * 0.6)));
            label.set_markup(`<span size="${Math.round(textSize * 1024)}" weight="bold">${text}</span>`);
        }
    });
    updateLabels();
    const sampler = new ResourceSampler(options); let disposed = false, pending = false;
    context.onDispose(() => { disposed = true; sampler.dispose(); });
    const update = async () => {
        if (pending || disposed) return;
        pending = true;
        try {
            const sample = await sampler.sample(); if (disposed) return;
            Object.assign(values, sample); updateLabels(); drawings.forEach(drawing => drawing.queue_draw());
        } finally { pending = false; }
    };
    update().catch(console.error);
    context.every(Math.max(500, Number(options.interval) || 1000), () => update().catch(console.error));
    return content;
}
