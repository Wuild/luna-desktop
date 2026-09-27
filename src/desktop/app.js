import {DesktopSettings} from '../settings/settings.js';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import {desktopLauncher} from './launchers.js';
import {gridMetrics, arrangeIcons, groupDrop, intersects, cellPosition} from './layout.js';
import {anchoredPosition} from './placement.js';
import {DesktopButton} from './iconButton.js';
import {WidgetHost, discoverWidgets} from './widgetHost.js';
import {followAppearance} from './appearance.js';
import {menu, copyItems, canPaste, pasteInto, properties} from './fileActions.js';
import {wallpaperMenuEntries} from './wallpaper.js';

const [extensionPath, layoutPath] = ARGV;
GLib.set_prgname('org.luna.Desktop');
const schema = Gio.SettingsSchemaSource.new_from_directory(`${extensionPath}/schemas`, Gio.SettingsSchemaSource.get_default(), false)
    .lookup('org.gnome.shell.extensions.luna-desktop', true);
const settings = new DesktopSettings(new Gio.Settings({settings_schema: schema}));
const directory = Gio.File.new_for_path(GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP) || `${GLib.get_home_dir()}/Desktop`);
const layoutFile = Gio.File.new_for_path(layoutPath);
const app = new Adw.Application({application_id: 'org.luna.Desktop', flags: Gio.ApplicationFlags.NON_UNIQUE});
let views = [], files = [], layouts = [], generation = 0, refreshId = 0;
let selected = new Set();
let directoryMonitor, layoutMonitor, settingsId, stopAppearance;
let activeDrag = null, pendingPopulate = false, editingDesktop = false;
const css = new Gtk.CssProvider();
const widgetHost = new WidgetHost(extensionPath, settings);
const volumes = Gio.VolumeMonitor.get();
const volumeSignals = [];

function error(parent, message) {
    const dialog = new Gtk.MessageDialog({transient_for: parent, modal: true, message_type: Gtk.MessageType.ERROR,
        buttons: Gtk.ButtonsType.CLOSE, text: message});
    dialog.connect('response', () => dialog.destroy());
    dialog.present();
}
function openFile(file, parent) {
    const context = Gdk.Display.get_default().get_app_launch_context();
    context.unsetenv('WAYLAND_SOCKET');
    const launcher = desktopLauncher(file);
    if (launcher) {
        try { launcher.launch([], context); }
        catch (e) { error(parent, e.message); }
        return;
    }
    Gio.AppInfo.launch_default_for_uri_async(file.get_uri(), context, null, (_source, result) => {
        try { Gio.AppInfo.launch_default_for_uri_finish(result); } catch (e) { error(parent, e.message); }
    });
}
function rename(item, parent) {
    const dialog = new Gtk.Dialog({title: 'Rename', transient_for: parent, modal: true});
    dialog.add_button('Cancel', Gtk.ResponseType.CANCEL);
    dialog.add_button('Rename', Gtk.ResponseType.OK);
    dialog.set_default_response(Gtk.ResponseType.OK);
    const entry = new Gtk.Entry({text: item.name, activates_default: true, margin_top: 16, margin_bottom: 16, margin_start: 16, margin_end: 16});
    dialog.get_content_area().append(entry);
    dialog.connect('response', (_dialog, response) => {
        const name = entry.text.trim();
        dialog.destroy();
        if (response !== Gtk.ResponseType.OK || !name || name === '.' || name === '..' || name.includes('/')) return;
        item.file.set_display_name_async(name, GLib.PRIORITY_DEFAULT, null, (file, result) => {
            try {
                const renamed = file.set_display_name_finish(result);
                const positions = readPositions();
                if (positions[item.file.get_uri()]) {
                    positions[renamed.get_uri()] = positions[item.file.get_uri()];
                    delete positions[item.file.get_uri()];
                    settings.set_string('desktop-icon-positions', JSON.stringify(positions));
                }
                refresh();
            } catch (e) { error(parent, e.message); }
        });
    });
    dialog.present();
}
function trashItems(items, parent) {
    const eligible = items.filter(item => !item.special);
    if (!eligible.length) return;
    let remaining = eligible.length;
    const failures = [];
    for (const item of eligible) item.file.trash_async(GLib.PRIORITY_DEFAULT, null, (file, result) => {
        try { file.trash_finish(result); } catch (e) { failures.push(`${item.name}: ${e.message}`); console.error('Trash failed', e.message); }
        if (--remaining === 0) {
            refresh();
            if (failures.length) error(parent, failures.join('\n'));
        }
    });
}
function trash(item, parent) { trashItems([item], parent); }
function newFolder(parent) {
    const dialog = new Gtk.Dialog({title: 'New folder', transient_for: parent, modal: true});
    dialog.add_button('Cancel', Gtk.ResponseType.CANCEL);
    dialog.add_button('Create', Gtk.ResponseType.OK);
    dialog.set_default_response(Gtk.ResponseType.OK);
    const entry = new Gtk.Entry({text: 'New Folder', activates_default: true, margin_top: 16, margin_bottom: 16, margin_start: 16, margin_end: 16});
    dialog.get_content_area().append(entry);
    dialog.connect('response', (_d, response) => {
        const name = entry.text.trim();
        dialog.destroy();
        if (response !== Gtk.ResponseType.OK || !name || name === '.' || name === '..' || name.includes('/')) return;
        directory.get_child(name).make_directory_async(GLib.PRIORITY_DEFAULT, null, (file, result) => {
            try { file.make_directory_finish(result); refresh(); } catch (e) { error(parent, e.message); }
        });
    });
    dialog.present();
}
function readPositions() {
    try { return JSON.parse(settings.get_string('desktop-icon-positions')); } catch { return {}; }
}
function style() {
    const color = settings.get_string('desktop-label-color');
    const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : '#ffffff';
    const accent = settings.get_string('desktop-accent-color');
    const safeAccent = /^#[0-9a-f]{6}$/i.test(accent) ? accent : '#3584e4';
    css.load_from_string(`
window.luna-desktop-desktop { background: rgba(0,0,0,0.004); }
.desktop-widget { padding: 12px; border-radius: 12px; background: alpha(@window_bg_color, 0.85); color: @window_fg_color; border: 1px solid alpha(@window_fg_color, 0.18); }
.desktop-widget-header { font-weight: bold; }
.desktop-editor { padding: 16px 20px; border-radius: 16px; box-shadow: 0 6px 24px rgba(0,0,0,0.3); }
.desktop-editor-title { font-size: 15px; font-weight: bold; }
.desktop-editor-hint { font-size: 12px; opacity: 0.75; }
.desktop-item { min-width: 0; min-height: 0; padding: 0; border: 0; outline: 1px solid transparent; outline-offset: -1px; border-radius: ${settings.get_int('desktop-corner-radius')}px; background: transparent; box-shadow: none; }
.desktop-grid-target { border: 1px dashed alpha(${safeAccent}, 0.9); background: alpha(${safeAccent}, 0.14); border-radius: ${settings.get_int('desktop-corner-radius')}px; }
.desktop-item:hover { background: rgba(255,255,255,0.12); outline-color: rgba(255,255,255,0.15); }
.desktop-item.drop-target { background: alpha(${safeAccent}, 0.5); outline: 2px solid ${safeAccent}; outline-offset: -2px; }
.desktop-item.selected, .desktop-item:focus-visible { background: alpha(${safeAccent}, 0.3); outline-color: alpha(${safeAccent}, 0.8); }
.desktop-item label { color: ${settings.get_boolean('desktop-label-color-override') ? safeColor : 'white'}; font-size: ${settings.get_int('desktop-label-size')}px; text-shadow: ${settings.get_boolean('desktop-label-shadow') ? '0 1px 3px rgba(0,0,0,0.9)' : 'none'}; }
`);
}
function select(uris) {
    selected = new Set(uris);
    for (const view of views) for (const record of view.items ?? []) {
        if (selected.has(record.item.file.get_uri())) record.button.add_css_class('selected');
        else record.button.remove_css_class('selected');
    }
}
function modified(gesture) {
    return !!(gesture.get_current_event_state() & (Gdk.ModifierType.CONTROL_MASK | Gdk.ModifierType.SHIFT_MASK));
}
function populate() {
    if (editingDesktop) selected.clear();
    if (activeDrag) { pendingPopulate = true; return; }
    pendingPopulate = false;
    const positions = readPositions();
    const size = settings.get_int('desktop-icon-size');
    const labelRows = settings.get_int('desktop-label-rows');
    const labelHeight = Math.ceil(settings.get_int('desktop-label-size') * 1.4) * labelRows;
    const padding = settings.get_int('desktop-button-padding');
    const width = Math.max(settings.get_int('desktop-button-width'), size + padding * 2), height = size + labelHeight + 4 + padding * 2;
    const corner = settings.get_string('desktop-arrange-corner');
    const updatedPositions = {...positions};
    const primary = layouts.find(m => m.primary) ?? layouts[0];
    for (const view of views) {
        for (let child = view.fixed.get_first_child(); child;) {
            const next = child.get_next_sibling();
            if (!widgetHost.instances.some(instance => instance.card === child || instance.header === child)) view.fixed.remove(child);
            child = next;
        }
        const monitor = view.monitor;
        const items = (settings.get_boolean('desktop-icons-enabled') ? files : []).filter(item => {
            const saved = positions[item.file.get_uri()];
            const target = settings.get_string('desktop-monitor-mode') === 'primary' ? primary :
                layouts.find(m => m.id === saved?.monitor) ?? primary;
            return target?.id === monitor.id;
        });
        view.grid = gridMetrics(monitor, width, height, 16, settings.get_int('desktop-grid-spacing'), corner);
        view.grid.columns = Math.max(view.grid.columns, Math.ceil(items.length / view.grid.rows));
        view.canvasWidth = Math.max(monitor.width, view.grid.padding * 2 + view.grid.columns * (width + view.grid.gap) - view.grid.gap);
        view.grid.areaWidth = view.canvasWidth;
        view.fixed.set_size_request(view.canvasWidth, monitor.height - 16);
        const placement = arrangeIcons(items, positions, monitor, view.grid, corner, settings.get_boolean('desktop-snap-to-grid'), settings.get_boolean('desktop-drives-opposite'));
        view.items = [];
        for (const item of items) {
            const position = placement.get(item);
            if (!position) continue;
            // Record auto-placement too: visibility toggles must not repack the desktop.
            const original = positions[item.file.get_uri()];
            const missingDisplay = original?.monitor && !layouts.some(display => display.id === original.monitor);
            if (!missingDisplay) updatedPositions[item.file.get_uri()] = anchoredPosition(monitor, position.x, position.y, width, height, original);
            const button = new DesktopButton(width, height, {tooltip_text: item.name});
            const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 4, halign: Gtk.Align.FILL, valign: Gtk.Align.CENTER, margin_start: padding, margin_end: padding, margin_top: padding, margin_bottom: padding});
            box.append(new Gtk.Image({gicon: item.icon, pixel_size: size}));
            box.append(new Gtk.Label({label: item.name, wrap: true, wrap_mode: Pango.WrapMode.WORD_CHAR,
                ellipsize: Pango.EllipsizeMode.END, lines: labelRows, height_request: labelHeight, max_width_chars: 14, justify: Gtk.Justification.CENTER}));
            button.set_child(box);
            button.can_target = button.focusable = !editingDesktop;
            view.fixed.put(button, position.x, position.y);
            const record = {button, item, position, dragged: false};
            view.items.push(record);
            const click = new Gtk.GestureClick({button: 3});
            click.connect('pressed', (gesture, count, x, y) => {
                if (gesture.get_current_button() === 3) {
                    if (!selected.has(item.file.get_uri())) select([item.file.get_uri()]);
                    const selection = files.filter(file => selected.has(file.file.get_uri()));
                    const ordinary = selection.every(file => !file.special);
                    const actions = [['Open', () => selection.forEach(file => openFile(file.file, view.window))], null,
                        ['Cut', () => copyItems(selection, true), ordinary], ['Copy', () => copyItems(selection), ordinary],
                        ['Rename…', () => rename(item, view.window), ordinary && selection.length === 1],
                        ['Move to Trash', () => trashItems(selection, view.window), ordinary], null,
                        ['Properties', () => properties(selection)]];
                    if (item.mount?.can_eject() || item.mount?.can_unmount()) actions.push(null,
                        [item.mount.can_eject() ? 'Eject' : 'Unmount', () => {
                            const method = item.mount.can_eject() ? 'eject_with_operation' : 'unmount_with_operation';
                            item.mount[method](Gio.MountUnmountFlags.NONE, new Gtk.MountOperation({parent: view.window}), null, (mount, result) => {
                                try { mount[`${method}_finish`](result); } catch (e) { error(view.window, e.message); }
                            });
                        }]);
                    menu(view.fixed, record.position.x + x, record.position.y + y, actions);
                }
            });
            button.connect('clicked', () => {
                if (record.dragged || record.modified) return;
                select([item.file.get_uri()]);
                const now = GLib.get_monotonic_time();
                const doubleClick = record.lastClick && now - record.lastClick < Gtk.Settings.get_default().gtk_double_click_time * 1000;
                record.lastClick = now;
                if (settings.get_boolean('desktop-single-click') || doubleClick) {
                    record.lastClick = 0;
                    openFile(item.file, view.window);
                }
            });
            button.add_controller(click);
            const keys = new Gtk.EventControllerKey();
            keys.connect('key-pressed', (_controller, key) => {
                if (key === Gdk.KEY_Return || key === Gdk.KEY_KP_Enter) { openFile(item.file, view.window); return true; }
                if (key === Gdk.KEY_F2 && !item.special) { rename(item, view.window); return true; }
                if (key === Gdk.KEY_Delete && !item.special) { trashItems(files.filter(file => selected.has(file.file.get_uri())), view.window); return true; }
                return false;
            });
            button.add_controller(keys);
        }
        view.targets = [];
        view.rubberband = new Gtk.Box({can_target: false, visible: false});
        view.rubberband.add_css_class('desktop-grid-target');
        view.fixed.put(view.rubberband, 0, 0);
    }
    widgetHost.mount(views, editingDesktop && !layouts.some(monitor => monitor.overview)).catch(console.error);
    if (editingDesktop) showEditToolbar();
    syncOverview();
    select(selected);
    const encoded = JSON.stringify(updatedPositions);
    if (encoded !== settings.get_string('desktop-icon-positions')) settings.set_string('desktop-icon-positions', encoded);
}
function showEditToolbar() {
    const view = views.find(candidate => candidate.monitor.primary) ?? views[0];
    if (!view) return;
    const toolbar = new Gtk.Box({spacing: 12});
    toolbar.add_css_class('desktop-widget');
    toolbar.add_css_class('desktop-editor');
    const description = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 4, margin_end: 12});
    const title = new Gtk.Label({label: 'Arrange your desktop', xalign: 0});
    title.add_css_class('desktop-editor-title');
    const hint = new Gtk.Label({label: 'Drag anywhere on a widget · Esc to finish', xalign: 0});
    hint.add_css_class('desktop-editor-hint');
    description.append(title); description.append(hint); toolbar.append(description);
    const add = new Gtk.MenuButton({label: 'Add widget', valign: Gtk.Align.CENTER});
    const picker = new Gtk.Popover();
    const list = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 6, margin_top: 8, margin_bottom: 8, margin_start: 8, margin_end: 8});
    const enabled = settings.get_strv('desktop-enabled-widgets');
    for (const definition of discoverWidgets(extensionPath)) {
        const present = enabled.includes(definition.id) && settings.get_boolean('desktop-widgets-enabled');
        const item = new Gtk.Button({sensitive: definition.multiple === true || !present});
        item.add_css_class('flat');
        const labels = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 4});
        const name = new Gtk.Label({label: definition.name + (present && !definition.multiple ? ' · Added' : ''), xalign: 0});
        name.add_css_class('heading'); labels.append(name);
        const detail = new Gtk.Label({label: definition.description || '', xalign: 0, wrap: true, max_width_chars: 40});
        detail.add_css_class('dim-label'); labels.append(detail); item.set_child(labels);
        item.connect('clicked', () => {
            picker.popdown();
            if (!definition.multiple) { item.sensitive = false; name.label = `${definition.name} · Added`; }
            const current = settings.get_strv('desktop-enabled-widgets');
            const id = definition.multiple && current.includes(definition.id) ? `${definition.id}:${GLib.uuid_string_random()}` : definition.id;
            settings.set_strv('desktop-enabled-widgets', [...new Set([...current, id])]);
            settings.set_boolean('desktop-widgets-enabled', true);
        });
        list.append(item);
    }
    picker.set_child(list); add.set_popover(picker);
    const done = new Gtk.Button({label: 'Done', valign: Gtk.Align.CENTER});
    done.add_css_class('suggested-action');
    done.connect('clicked', () => { editingDesktop = false; populate(); });
    toolbar.append(add); toolbar.append(done);
    const [, width] = toolbar.measure(Gtk.Orientation.HORIZONTAL, -1);
    view.fixed.put(toolbar, Math.max(16, (view.monitor.width - width) / 2), 16);
}
function attachDrag(view) {
    const drag = new Gtk.GestureDrag({button: 1, propagation_phase: Gtk.PropagationPhase.CAPTURE});
    drag.connect('drag-begin', (_gesture, x, y) => {
        if (editingDesktop || view.window._desktopMenuOpen) { drag.set_state(Gtk.EventSequenceState.DENIED); return; }
        let picked = view.fixed.pick(x, y, Gtk.PickFlags.DEFAULT);
        for (let parent = picked; parent; parent = parent.get_parent()) {
            if (parent.has_css_class('desktop-widget')) { drag.set_state(Gtk.EventSequenceState.DENIED); return; }
        }
        view.window.set_focus(null);
        while (picked && !(picked instanceof DesktopButton)) picked = picked.get_parent();
        const record = view.items?.find(entry => entry.button === picked);
        const previous = new Set(selected);
        if (!record) {
            const base = modified(drag) ? previous : new Set();
            select(base);
            activeDrag = {view, box: true, x, y, base, previous};
            return;
        }
        record.modified = modified(drag);
        const uri = record.item.file.get_uri();
        if (modified(drag)) {
            const next = new Set(selected);
            if (next.has(uri)) next.delete(uri); else next.add(uri);
            select(next);
        } else if (!selected.has(uri)) select([uri]);
        const records = view.items.filter(entry => selected.has(entry.item.file.get_uri()));
        for (const entry of view.items) entry.dragged = false;
        if (!selected.has(uri)) { drag.set_state(Gtk.EventSequenceState.DENIED); return; }
        for (const target of view.targets) view.fixed.remove(target);
        view.targets = records.map(() => {
            const target = new Gtk.Box({width_request: view.grid.width, height_request: view.grid.height, can_target: false, visible: false});
            target.add_css_class('desktop-grid-target');
            view.fixed.put(target, 0, 0);
            return target;
        });
        activeDrag = {view, destination: view, anchor: records.indexOf(record), records,
            starts: records.map(entry => ({...entry.position})), previous, pointerStart: {x, y}, ghosts: [],
            images: records.map(entry => new Gtk.WidgetPaintable({widget: entry.button}).get_current_image())};
    });
    drag.connect('drag-update', (_gesture, dx, dy) => {
        if (activeDrag?.view !== view) return;
        if (!activeDrag.moved && Math.hypot(dx, dy) < 6) return;
        activeDrag.moved = true;
        drag.set_state(Gtk.EventSequenceState.CLAIMED);
        if (activeDrag.box) {
            const {x, y, base} = activeDrag;
            const rect = {x: Math.min(x, x + dx), y: Math.min(y, y + dy), width: Math.abs(dx), height: Math.abs(dy)};
            view.fixed.move(view.rubberband, rect.x, rect.y);
            view.rubberband.set_size_request(Math.max(1, rect.width), Math.max(1, rect.height));
            view.rubberband.visible = true;
            const next = new Set(base);
            for (const entry of view.items) if (intersects(rect, entry.position, view.grid.width, view.grid.height))
                next.add(entry.item.file.get_uri());
            select(next);
            return;
        }
        const {records, starts, pointerStart, anchor} = activeDrag;
        const globalX = view.monitor.x + pointerStart.x + dx - view.scroll.hadjustment.value;
        const globalY = view.monitor.y + pointerStart.y + dy;
        const destination = settings.get_string('desktop-monitor-mode') === 'primary' ? view :
            views.find(candidate => globalX >= candidate.monitor.x && globalX < candidate.monitor.x + candidate.monitor.width &&
                globalY >= candidate.monitor.y && globalY < candidate.monitor.y + candidate.monitor.height) ?? view;
        if (activeDrag.destination !== destination) {
            for (const ghost of activeDrag.ghosts) ghost.get_parent()?.remove(ghost);
            for (const target of activeDrag.destination.targets) target.visible = false;
            activeDrag.ghosts = [];
            activeDrag.destination = destination;
            if (destination !== view) {
                activeDrag.ghosts = activeDrag.images.map(image => {
                    const ghost = new Gtk.Picture({paintable: image, width_request: destination.grid.width,
                        height_request: destination.grid.height, can_target: false});
                    destination.fixed.put(ghost, 0, 0);
                    return ghost;
                });
            }
        }
        const localX = globalX - destination.monitor.x + destination.scroll.hadjustment.value;
        const localY = globalY - destination.monitor.y;
        const bases = destination === view ? starts : starts.map(cell => cellPosition(destination.grid, cell.column, cell.row));
        const offsetX = localX - (pointerStart.x - starts[anchor].x) - bases[anchor].x;
        const offsetY = localY - (pointerStart.y - starts[anchor].y) - bases[anchor].y;
        const trashTarget = records.some(entry => !entry.item.special) ? destination.items.find(entry =>
            entry.item.file.get_uri() === 'trash:///' && !records.includes(entry) &&
            intersects({x: localX, y: localY, width: 1, height: 1}, entry.position,
                destination.grid.width, destination.grid.height)) : null;
        if (activeDrag.trashTarget !== trashTarget) {
            activeDrag.trashTarget?.button.remove_css_class('drop-target');
            trashTarget?.button.add_css_class('drop-target');
            activeDrag.trashTarget = trashTarget;
        }
        const x = Math.max(-Math.min(...bases.map(cell => cell.x)),
            Math.min(offsetX, destination.canvasWidth - destination.grid.width - Math.max(...bases.map(cell => cell.x))));
        const y = Math.max(-Math.min(...bases.map(cell => cell.y)),
            Math.min(offsetY, destination.monitor.height - destination.grid.height - Math.max(...bases.map(cell => cell.y))));
        records.forEach((entry, i) => {
            entry.dragged = true;
            entry.button.opacity = destination === view ? 1 : 0;
            if (destination === view) view.fixed.move(entry.button, bases[i].x + x, bases[i].y + y);
            else destination.fixed.move(activeDrag.ghosts[i], bases[i].x + x, bases[i].y + y);
        });
        const occupied = new Set(destination.items.filter(entry => !records.includes(entry))
            .map(entry => `${entry.position.column}:${entry.position.row}`));
        activeDrag.cells = settings.get_boolean('desktop-snap-to-grid') ? groupDrop(destination.grid, bases, x, y, occupied) :
            bases.map(cell => ({...cell, x: cell.x + x, y: cell.y + y}));
        while (destination.targets.length < records.length) {
            const target = new Gtk.Box({width_request: destination.grid.width, height_request: destination.grid.height, can_target: false});
            target.add_css_class('desktop-grid-target');
            destination.fixed.put(target, 0, 0); destination.targets.push(target);
        }
        destination.targets.forEach((target, i) => {
            target.visible = settings.get_boolean('desktop-highlight-grid') && i < records.length && !!activeDrag.cells && !trashTarget;
            if (target.visible) destination.fixed.move(target, activeDrag.cells[i].x, activeDrag.cells[i].y);
        });
    });
    const finish = cancel => {
        if (activeDrag?.view !== view) return;
        const {records, starts, cells, moved, box, previous, trashTarget, destination, ghosts} = activeDrag;
        trashTarget?.button.remove_css_class('drop-target');
        const dropToTrash = !cancel && moved && !!trashTarget;
        view.rubberband.visible = false;
        for (const surface of views) for (const target of surface.targets) target.visible = false;
        for (const ghost of ghosts ?? []) ghost.get_parent()?.remove(ghost);
        if (cancel) select(previous);
        if (!box) {
            const latest = readPositions();
            records.forEach((entry, i) => {
                entry.position = !cancel && moved && !dropToTrash && cells ? cells[i] : starts[i];
                entry.button.opacity = 1;
                view.fixed.move(entry.button, entry.position.x, entry.position.y);
                if (!cancel && moved && !dropToTrash && cells) latest[entry.item.file.get_uri()] = anchoredPosition(destination.monitor, entry.position.x, entry.position.y, destination.grid.width, destination.grid.height);
            });
            if (!cancel && moved && !dropToTrash) settings.set_string('desktop-icon-positions', JSON.stringify(latest));
        }
        activeDrag = null;
        if (dropToTrash) trashItems(records.map(entry => entry.item), view.window);
        if (pendingPopulate || (!box && destination !== view)) GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => { populate(); return GLib.SOURCE_REMOVE; });
    };
    drag.connect('drag-end', () => finish(false));
    drag.connect('cancel', () => finish(true));
    view.fixed.add_controller(drag);
    const keys = new Gtk.EventControllerKey();
    keys.set_propagation_phase(Gtk.PropagationPhase.CAPTURE);
    keys.connect('key-pressed', (_keys, key, _code, state) => {
        const focus = view.window.get_focus();
        if (editingDesktop) {
            if (key === Gdk.KEY_Escape) { editingDesktop = false; populate(); return true; }
            return false;
        }
        if (focus instanceof Gtk.TextView || focus instanceof Gtk.Entry || focus?.get_ancestor(Gtk.TextView)) return false;
        if ((state & Gdk.ModifierType.CONTROL_MASK) && (key === Gdk.KEY_a || key === Gdk.KEY_A)) {
            select(view.items.map(entry => entry.item.file.get_uri())); return true;
        }
        if (state & Gdk.ModifierType.CONTROL_MASK) {
            const selection = files.filter(file => selected.has(file.file.get_uri()));
            if (key === Gdk.KEY_c || key === Gdk.KEY_x) { copyItems(selection, key === Gdk.KEY_x); return true; }
            if (key === Gdk.KEY_v) { pasteInto(directory).then(refresh).catch(e => error(view.window, e.message)); return true; }
        }
        if (key === Gdk.KEY_Escape) {
            if (activeDrag) { finish(true); drag.set_state(Gtk.EventSequenceState.DENIED); }
            else if (editingDesktop) { editingDesktop = false; populate(); }
            else select([]);
            return true;
        }
        return false;
    });
    view.fixed.add_controller(keys);
}
function refresh(arrange = false) {
    const ticket = ++generation;
    if (!settings.get_boolean('desktop-icons-enabled')) { files = []; select([]); populate(); return; }
    directory.enumerate_children_async('standard::name,standard::display-name,standard::icon,standard::is-hidden,standard::content-type,standard::size,time::modified',
        Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null, (file, result) => {
            let enumerator;
            try { enumerator = file.enumerate_children_finish(result); }
            catch (e) { console.error(e); return; }
            const found = [];
            const next = () => enumerator.next_files_async(100, GLib.PRIORITY_DEFAULT, null, (e, r) => {
                try {
                    const batch = e.next_files_finish(r);
                    if (batch.length && ticket === generation) {
                        for (const info of batch) if (!info.get_is_hidden() || settings.get_boolean('desktop-show-hidden')) {
                            const file = directory.get_child(info.get_name());
                            const launcher = desktopLauncher(file);
                            found.push({file, name: launcher?.get_display_name() ?? info.get_display_name(), icon: launcher?.get_icon() ?? info.get_icon(), type: info.get_content_type() || '', size: info.get_size(), modified: info.get_attribute_uint64('time::modified')});
                        }
                        next(); return;
                    }
                    enumerator.close_async(GLib.PRIORITY_DEFAULT, null, () => {});
                    if (ticket !== generation) return;
                    const order = settings.get_string('desktop-sort-order');
                    found.sort((a, b) => (order === 'size' ? b.size - a.size : order === 'modified' ? b.modified - a.modified :
                        order === 'type' ? a.type.localeCompare(b.type) : 0) || a.name.localeCompare(b.name));
                    const special = [];
                    if (settings.get_boolean('desktop-show-home')) special.push({file: Gio.File.new_for_path(GLib.get_home_dir()), name: 'Home', icon: Gio.ThemedIcon.new('user-home'), special: true});
                    if (settings.get_boolean('desktop-show-trash')) special.push({file: Gio.File.new_for_uri('trash:///'), name: 'Trash', icon: Gio.ThemedIcon.new('user-trash'), special: true});
                    const drives = volumes.get_mounts().filter(mount => {
                        if (mount.is_shadowed()) return false;
                        const native = mount.get_root().is_native();
                        return native ? settings.get_boolean('desktop-show-external-drives') &&
                            (mount.can_eject() || mount.get_drive()?.is_removable() || mount.get_volume()?.get_identifier('class') !== 'network') :
                            settings.get_boolean('desktop-show-network-drives');
                    }).map(mount => ({file: mount.get_root(), name: mount.get_name(), icon: mount.get_icon(), special: true, drive: true, mount}));
                    files = [...special, ...found, ...drives];
                    if (arrange === true) settings.set_string('desktop-icon-positions', '{}');
                    populate();
                } catch (failure) { console.error(failure); enumerator.close_async(GLib.PRIORITY_DEFAULT, null, () => {}); }
            });
            next();
        });
}
function syncOverview() {
    const overview = layouts.some(monitor => monitor.overview);
    for (const view of views) {
        for (const item of view.items ?? []) item.button.visible = true;
        for (let child = view.fixed.get_first_child(); child; child = child.get_next_sibling())
            if (child.has_css_class('desktop-editor')) child.visible = !overview;
    }
    for (const instance of widgetHost.instances) instance.setEditing(editingDesktop && !overview);
}
function geometry() {
    try {
        const next = JSON.parse(new TextDecoder().decode(layoutFile.load_contents(null)[1]));
        // File monitors can report the same layout more than once. Recreating
        // every desktop window would unnecessarily unmap icons and widgets.
        if (views.length && JSON.stringify(next) === JSON.stringify(layouts)) return;
        const geometryOnly = monitors => JSON.stringify(monitors.map(({overview, wallpaperPath, ...monitor}) => monitor));
        if (views.length && geometryOnly(next) === geometryOnly(layouts)) {
            layouts = next; syncOverview(); return;
        }
        layouts = next;
    }
    catch (e) { console.error(e); return; }
    activeDrag = null;
    widgetHost.clear();
    for (const view of views) view.window.destroy();
    views = layouts.map(monitor => {
        const window = new Gtk.ApplicationWindow({application: app, title: `Luna Desktop:${monitor.index}`,
            decorated: false, resizable: true, default_width: monitor.width, default_height: monitor.height});
        window.add_css_class('luna-desktop-desktop');
        const fixed = new Gtk.Fixed({hexpand: true, vexpand: true});
        const scroll = new Gtk.ScrolledWindow({hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            vscrollbar_policy: Gtk.PolicyType.NEVER, propagate_natural_width: false, propagate_natural_height: false});
        scroll.set_child(fixed);
        window.set_child(scroll);
        const click = new Gtk.GestureClick({button: 3});
        click.set_propagation_phase(Gtk.PropagationPhase.BUBBLE);
        click.connect('pressed', (_gesture, _count, x, y) => {
            if (editingDesktop) { click.set_state(Gtk.EventSequenceState.CLAIMED); return; }
            const picked = fixed.pick(x, y, Gtk.PickFlags.DEFAULT);
            if (picked !== fixed) return;
            menu(fixed, x, y, [
                [editingDesktop ? 'Finish Editing' : 'Edit Desktop', () => { editingDesktop = !editingDesktop; populate(); }], null,
                ['New Folder…', () => newFolder(window)],
                ['Paste', () => pasteInto(directory).then(refresh).catch(e => error(window, e.message)), canPaste()], null,
                ['Select All', () => select(files.map(item => item.file.get_uri()))],
                ['Arrange Icons', () => { settings.set_string('desktop-icon-positions', '{}'); populate(); }],
                ['Sort By', ['Name', 'Type', 'Modified', 'Size'].map(label => [label, () => {
                    settings.set_string('desktop-sort-order', label.toLowerCase()); refresh(true);
                }])],
                ['Layout', [
                    [settings.get_boolean('desktop-snap-to-grid') ? 'Turn Off Grid Snapping' : 'Snap to Grid', () => settings.set_boolean('desktop-snap-to-grid', !settings.get_boolean('desktop-snap-to-grid'))],
                    [settings.get_boolean('desktop-show-hidden') ? 'Hide Hidden Files' : 'Show Hidden Files', () => settings.set_boolean('desktop-show-hidden', !settings.get_boolean('desktop-show-hidden'))],
                    [settings.get_boolean('desktop-widgets-enabled') ? 'Hide Widgets' : 'Show Widgets', () => settings.set_boolean('desktop-widgets-enabled', !settings.get_boolean('desktop-widgets-enabled'))],
                ]], null,
                ['Open Desktop in Files', () => openFile(directory, window)],
                ...wallpaperMenuEntries(() => layouts.find(layout => layout.wallpaperPath)?.wallpaperPath, message => error(window, message)),
                ['Desktop Settings', () => Gio.Subprocess.new(['gnome-extensions', 'prefs', 'luna-desktop@wuild'], Gio.SubprocessFlags.NONE)],
            ]);
        });
        fixed.add_controller(click);

        const view = {monitor, window, fixed, scroll};
        attachDrag(view);
        return view;
    });
    populate();
    for (const view of views) view.window.present();
}
app.connect('activate', () => {
    app.hold();
    // The inherited descriptor authenticates only this process, not launched apps.
    GLib.unsetenv('WAYLAND_SOCKET');
    if (!directory.query_exists(null)) directory.make_directory_with_parents(null);
    Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    stopAppearance = followAppearance();
    style(); geometry(); refresh();
    directoryMonitor = directory.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
    directoryMonitor.connect('changed', () => {
        if (refreshId) GLib.Source.remove(refreshId);
        refreshId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => { refreshId = 0; refresh(); return GLib.SOURCE_REMOVE; });
    });
    layoutMonitor = layoutFile.monitor_file(Gio.FileMonitorFlags.NONE, null);
    layoutMonitor.connect('changed', (_m, _f, _o, event) => {
        if (event === Gio.FileMonitorEvent.CHANGES_DONE_HINT) geometry();
    });
    for (const signal of ['mount-added', 'mount-removed', 'mount-changed']) volumeSignals.push(volumes.connect(signal, () => refresh()));
    settingsId = settings.connect('changed', (_s, key) => {
        if (key === 'desktop-widget-positions') return;
        if (['desktop-widget-options', 'desktop-enabled-widgets', 'desktop-widgets-enabled', 'desktop-widget-edge-spacing'].includes(key)) {
            widgetHost.mount(views, editingDesktop && !layouts.some(monitor => monitor.overview)).catch(console.error); return;
        }
        if (key === 'desktop-sort-order') { refresh(true); return; }
        if (key === 'desktop-icon-positions') { if (settings.get_string(key) === '{}') populate(); return; }
        if (key.startsWith('desktop-') || key === 'desktop-accent-color') { style(); refresh(); }
    });
});
app.connect('shutdown', () => {
    generation++;
    widgetHost.clear();
    for (const id of volumeSignals) volumes.disconnect(id);
    if (refreshId) GLib.Source.remove(refreshId);
    directoryMonitor?.cancel(); layoutMonitor?.cancel();
    if (settingsId) settings.disconnect(settingsId);
    stopAppearance?.();
});
app.run([]);
