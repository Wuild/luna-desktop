import Gtk from 'gi://Gtk?version=4.0';
import GLib from 'gi://GLib';
import {applyTextStyle} from '../textStyle.js';

export function create(context) {
    const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 8, valign: Gtk.Align.CENTER, vexpand: true});
    const time = new Gtk.Label();
    const size = Math.max(16, Math.min(72, Number(context.options.textSize) || 32));
    const date = new Gtk.Label({wrap: true});
    applyTextStyle(time, context.options);
    applyTextStyle(date, context.options);
    date.visible = context.options.showDate !== false;
    box.append(time); box.append(date);
    const update = () => {
        const now = GLib.DateTime.new_now_local();
        time.set_markup(`<span size="${size * 1024}">${now.format(context.options.format === '12h' ? '%I:%M %p' : '%H:%M')}</span>`);
        date.label = now.format('%A, %e %B %Y');
    };
    update(); context.every(1000, update);
    return box;
}
