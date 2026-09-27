import GdkPixbuf from 'gi://GdkPixbuf';
import {dominantColor} from '../../../widgets/colors.js';
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import {applyTextStyle} from '../textStyle.js';
import {httpClient} from '../http.js';
import {visualizer} from './visualizer.js';
import {mediaClient, choosePlayer} from './player.js';

export function create(context) {
    const {options} = context;
    const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 10, valign: Gtk.Align.CENTER, vexpand: true});
    const label = () => { const item = new Gtk.Label({xalign: 0, ellipsize: Pango.EllipsizeMode.END, hexpand: true}); applyTextStyle(item, options); return item; };
    const header = new Gtk.Box({spacing: 6, visible: options.showApp !== false});
    const appIcon = new Gtk.Image({icon_name: 'audio-x-generic-symbolic', pixel_size: 16});
    const identity = label(); identity.label = 'Now Playing'; header.append(appIcon); header.append(identity);
    const row = new Gtk.Box({spacing: 12});
    const artwork = new Gtk.Image({icon_name: 'audio-x-generic-symbolic', pixel_size: Math.max(40, Math.min(160, Number(options.artSize) || 80))});
    artwork.visible = options.showArtwork !== false;
    const info = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 4, hexpand: true, valign: Gtk.Align.CENTER});
    const title = label(); const artist = label(); const album = label();
    const attrs = new Pango.AttrList(); attrs.insert(Pango.attr_size_new(Math.max(12, Math.min(36, Number(options.textSize) || 18)) * Pango.SCALE)); title.attributes = attrs;
    album.visible = options.showAlbum !== false;
    info.append(title); info.append(artist); info.append(album); row.append(artwork); row.append(info);
    const controls = new Gtk.Box({spacing: 6, halign: Gtk.Align.CENTER});
    controls.visible = options.showControls !== false;
    const status = label(); status.visible = false;
    let disposed = false, busy = false, selected = null, lastArt = '', artTicket = 0;
    context.onDispose(() => { disposed = true; artTicket++; });
    const media = mediaClient(context), http = httpClient(context), fileCancel = new Gio.Cancellable();
    context.onDispose(() => fileCancel.cancel());
    const buttons = {};
    for (const [method, name, tooltip] of [['Previous', 'media-skip-backward-symbolic', 'Previous track'], ['PlayPause', 'media-playback-start-symbolic', 'Play or pause'], ['Next', 'media-skip-forward-symbolic', 'Next track']]) {
        const button = new Gtk.Button({icon_name: name, tooltip_text: tooltip}); button.add_css_class('flat');
        button.connect('clicked', async () => {
            if (!selected) return;
            try { await media.command(selected.name, method); if (!disposed) await update(); }
            catch { if (!disposed) { status.label = 'Player did not accept this control'; status.visible = true; } }
        });
        controls.append(button); buttons[method] = button;
    }
    // Opacity preserves card geometry while hover controls appear/disappear.
    const reveal = visible => { controls.opacity = visible ? 1 : 0; controls.can_target = visible; for (const button of Object.values(buttons)) button.focusable = visible; };
    if (options.controlsOnHover !== false && !context.editing) {
        reveal(false);
        const motion = new Gtk.EventControllerMotion();
        motion.connect('enter', () => reveal(true)); motion.connect('leave', () => reveal(false)); box.add_controller(motion);
        const focus = new Gtk.EventControllerFocus();
        focus.connect('enter', () => reveal(true)); focus.connect('leave', () => { if (!motion.contains_pointer) reveal(false); }); box.add_controller(focus);
    }
    box.append(header); box.append(row); box.append(controls);
    const spectrum = options.showVisualizer === true ? visualizer(context) : null;
    let widget = box;
    if (spectrum && options.visualizerPlacement === 'background') {
        // Measure the foreground while drawing the spectrum behind the whole card.
        widget = new Gtk.Overlay({hexpand: true, vexpand: true});
        spectrum.area.height_request = 0;
        spectrum.area.vexpand = true;
        spectrum.area.can_target = false;
        spectrum.area.opacity = 0.35;
        widget.set_child(spectrum.area);
        widget.add_overlay(box);
        widget.set_measure_overlay(box, true);
    } else if (spectrum) box.append(spectrum.area);
    box.append(status);
    const loadArt = async url => {
        const ticket = ++artTicket;
        artwork.set_from_icon_name('audio-x-generic-symbolic');
        spectrum?.setArtworkColor(null);
        const extractColor = spectrum && options.visualizerColorMode === 'artwork';
        if (!url || (options.showArtwork === false && !extractColor)) return;
        try {
            let bytes;
            if (/^https?:\/\//i.test(url)) bytes = await http.bytes(url);
            else if (url.startsWith('file://')) bytes = await new Promise((resolve, reject) => {
                Gio.File.new_for_uri(url).load_bytes_async(fileCancel, (file, result) => {
                    try { resolve(file.load_bytes_finish(result)[0]); } catch (e) { reject(e); }
                });
            });
            if (!disposed && ticket === artTicket && bytes) {
                if (options.showArtwork !== false) artwork.set_from_paintable(Gdk.Texture.new_from_bytes(bytes));
                if (extractColor) {
                    const stream = Gio.MemoryInputStream.new_from_bytes(bytes);
                    try {
                        const pixbuf = GdkPixbuf.Pixbuf.new_from_stream_at_scale(stream, 32, 32, true, fileCancel);
                        spectrum.setArtworkColor(dominantColor(pixbuf.get_pixels(), pixbuf.width, pixbuf.height, pixbuf.rowstride, pixbuf.n_channels));
                    } finally { stream.close(null); }
                }
            }
        } catch { /* Keep the music fallback for unavailable artwork. */ }
    };
    const update = async () => {
        if (disposed || busy) return;
        busy = true;
        try {
            const players = await media.players();
            if (disposed) return;
            selected = choosePlayer(players, String(options.player ?? ''), selected?.name, options.excludedApps);
            context.setVisible?.(options.hideWhenIdle !== true || selected?.PlaybackStatus === 'Playing');
            spectrum?.setPlayer(selected);
            const metadata = selected?.Metadata ?? {};
            identity.label = selected?.Identity || selected?.DesktopEntry || 'Now Playing';
            const desktop = String(selected?.DesktopEntry ?? '');
            const app = desktop ? Gio.DesktopAppInfo.new(desktop.endsWith('.desktop') ? desktop : `${desktop}.desktop`) : null;
            appIcon.gicon = app?.get_icon() ?? Gio.ThemedIcon.new('audio-x-generic-symbolic');
            title.label = String(metadata['xesam:title'] || (selected ? 'No track information' : 'Nothing playing'));
            artist.label = Array.isArray(metadata['xesam:artist']) ? metadata['xesam:artist'].join(', ') : '';
            album.label = String(metadata['xesam:album'] ?? '');
            buttons.Previous.sensitive = !!selected?.CanControl && !!selected?.CanGoPrevious;
            buttons.Next.sensitive = !!selected?.CanControl && !!selected?.CanGoNext;
            buttons.PlayPause.sensitive = !!selected?.CanControl && !!(selected.PlaybackStatus === 'Playing' ? selected.CanPause : selected.CanPlay);
            buttons.PlayPause.icon_name = selected?.PlaybackStatus === 'Playing' ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
            const art = String(metadata['mpris:artUrl'] ?? '');
            if (art !== lastArt) { lastArt = art; loadArt(art); }
            status.visible = false;
        } catch { if (!disposed) { spectrum?.setPlayer(null); status.label = 'Media players unavailable'; status.visible = true; } }
        finally { busy = false; }
    };
    title.label = 'Nothing playing';
    context.setVisible?.(options.hideWhenIdle !== true);
    update(); context.every(2000, update);
    return widget;
}
