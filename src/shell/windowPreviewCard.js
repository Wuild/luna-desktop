import {_, ngettext, formatText} from '../i18n.js';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';
import Pango from 'gi://Pango';

let interfaceSettings;
function styleSettings() {
    return interfaceSettings ??= new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
}
export function clearStyleSettings() { interfaceSettings = null; }
export function darkStyle() { return styleSettings().get_string('color-scheme') === 'prefer-dark'; }
export function watchStyle(actor, update) {
    styleSettings().connectObject('changed::color-scheme', update, actor);
    update();
}

export function previewButtonStyle(active, margin = 0) {
    const outline = darkStyle() ? 'rgba(255,255,255,0.9)' : 'rgba(30,30,30,0.85)';
    return `padding: 5px; margin: ${margin}px; border: 2px solid ${active ? outline : 'transparent'}; background-color: ${active ? 'rgba(0,0,0,0.6)' : 'transparent'}; border-radius: 6px; transition-duration: 120ms;`;
}

export function windowPreviewCard(window, preview, width, groupSize = 0) {
    const card = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, width,
        style: 'background-color: rgba(245,245,245,0.94); color: #202020; border-radius: 4px; spacing: 0;'});
    watchStyle(card, () => card.set_style(`background-color: ${darkStyle() ? 'rgba(42,42,46,0.96)' : 'rgba(245,245,245,0.94)'}; color: ${darkStyle() ? '#f5f5f5' : '#202020'}; border-radius: 4px; spacing: 0;`));
    const title = groupSize ? formatText(ngettext('Snap group · %d window', 'Snap group · %d windows', groupSize), groupSize) : window.get_title() || _('Window');
    const header = new St.BoxLayout({style: 'spacing: 8px; padding: 10px;'});
    const app = Shell.WindowTracker.get_default().get_window_app(window);
    const icon = groupSize ? new St.Icon({icon_name: 'view-grid-symbolic', icon_size: 20}) : app?.create_icon_texture(20);
    if (icon) header.add_child(icon);
    const label = new St.Label({text: title, y_align: Clutter.ActorAlign.CENTER, x_expand: true});
    label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    header.add_child(label);
    card.add_child(header);
    card.add_child(preview);
    return {card, label, title, header};
}
