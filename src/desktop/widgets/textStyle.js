import Gtk from 'gi://Gtk?version=4.0';

export function applyTextStyle(label, options) {
    const color = /^#[0-9a-f]{6}$/i.test(options.textColor) ? options.textColor : '#ffffff';
    const alpha = Math.max(0.1, Math.min(1, Number(options.shadowStrength ?? 80) / 100));
    const css = new Gtk.CssProvider();
    css.load_from_string(`label { color: ${color}; text-shadow: ${options.shadow !== false ?
        `0 1px 3px rgba(0,0,0,${alpha}), 0 0 1px rgba(0,0,0,${alpha})` : 'none'}; }`);
    label.get_style_context().add_provider(css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION + 1);
}

export function applyIconStyle(icon, options) {
    const color = /^#[0-9a-f]{6}$/i.test(options.textColor) ? options.textColor : '#ffffff';
    const alpha = Math.max(0.1, Math.min(1, Number(options.shadowStrength ?? 80) / 100));
    const css = new Gtk.CssProvider();
    css.load_from_string(`image { color: ${color}; -gtk-icon-shadow: ${options.shadow !== false ?
        `0 1px 3px rgba(0,0,0,${alpha}), 0 0 1px rgba(0,0,0,${alpha})` : 'none'}; }`);
    icon.get_style_context().add_provider(css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION + 1);
}
