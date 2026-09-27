import Gtk from 'gi://Gtk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {widgetToolbar} from './widgetToolbar.js';
import {snapWidget} from './widgetSnapping.js';
import {anchoredPosition, restoredPosition} from './placement.js';
import {widgetOptions, customizeWidget} from './widgetSettings.js';

export function readJSON(file, fallback = {}) {
    try { return JSON.parse(new TextDecoder().decode(file.load_contents(null)[1])); }
    catch { return fallback; }
}
export {widgetRoots, discoverWidgets, widgetInstances} from '../widgets/catalog.js';
import {discoverWidgets, widgetInstances} from '../widgets/catalog.js';
export class WidgetHost {
    constructor(extensionPath, settings) {
        this.path = extensionPath; this.settings = settings; this.instances = []; this.generation = 0; this.order = [];
    }
    dispose(instance) {
        for (const cleanup of instance.cleanups.reverse()) {
            try { cleanup(); } catch (e) { console.error(e); }
        }
        instance.card.get_parent()?.remove(instance.card);
        this.instances = this.instances.filter(other => other !== instance);
    }
    clear() {
        this.generation++;
        for (const instance of [...this.instances]) this.dispose(instance);
    }
    raise(instance) {
        const {card, view, id} = instance;
        if (!view || card.get_parent() !== view.fixed) return;
        let last = null;
        for (let child = view.fixed.get_first_child(); child; child = child.get_next_sibling())
            if (child !== card && this.instances.some(other => other.card === child)) last = child;
        if (last) card.insert_after(view.fixed, last);
        this.order = [id, ...this.order.filter(value => value !== id)];
    }
    async mount(views, editing = false) {
        if (!this.settings.get_boolean('desktop-widgets-enabled')) { this.clear(); return; }
        const generation = ++this.generation;
        views = views.map(view => {
            const existing = this.instances.find(instance => instance.view?.fixed === view.fixed)?.view;
            return existing ? Object.assign(existing, view) : view;
        });
        const enabled = this.settings.get_strv('desktop-enabled-widgets');
        for (const instance of [...this.instances])
            if (!enabled.includes(instance.id) || !views.includes(instance.view)) this.dispose(instance);
        let positions;
        try { positions = JSON.parse(this.settings.get_string('desktop-widget-positions')); } catch { positions = {}; }
        for (const definition of widgetInstances(discoverWidgets(this.path), enabled).sort((a, b) =>
            (this.order.includes(a.id) ? this.order.indexOf(a.id) : 1000) - (this.order.includes(b.id) ? this.order.indexOf(b.id) : 1000))) {
            const primary = views.find(view => view.monitor.primary) ?? views[0];
            const saved = positions[definition.id];
            const view = views.find(v => v.monitor.id === saved?.monitor) ?? primary;
            if (!view) continue;
            const options = widgetOptions(this.settings, definition);
            const margin = this.settings.get_int('desktop-widget-edge-spacing');
            const previous = this.instances.find(instance => instance.id === definition.id);
            if (saved && previous?.setEditing && previous.view === view && previous.margin === margin && JSON.stringify(previous.options) === JSON.stringify(options)) {
                previous.setEditing(editing);
                continue;
            }
            const previousRect = saved && previous?.view === view ? previous.rect : null;
            if (previous) this.dispose(previous);
            const cleanups = [];
            const dragHandles = [], resizeHandles = [];
            const card = new Gtk.Overlay();
            card.add_css_class('desktop-widget');
            card.can_target = editing || (definition.interactive === true && options.interactive === true);
            card.opacity = Math.max(0.1, Math.min(1, Number(options.opacity) / 100));
            const color = /^#[0-9a-f]{6}$/i.test(options.backgroundColor) ? options.backgroundColor : '#202024';
            const alpha = Math.max(0, Math.min(1, Number(options.backgroundOpacity) / 100));
            const radius = Math.max(0, Math.min(48, Number(options.cornerRadius) || 0));
            const css = new Gtk.CssProvider();
            const updateStyle = () => css.load_from_string(`.desktop-widget { background: ${options.background ? `alpha(${color}, ${alpha})` : editing ? 'alpha(@window_bg_color, 0.8)' : 'transparent'};
                padding: ${definition.typeId === 'sticky-note' ? '0' : '12'}px;
                box-shadow: ${definition.typeId === 'sticky-note' && options.background ? '0 3px 9px rgba(0,0,0,0.22)' : 'none'};
                border-radius: ${radius}px; border: 1px ${editing ? 'dashed alpha(@window_fg_color, 0.5)' : 'solid transparent'}; color: ${definition.typeId === 'sticky-note' && /^#[0-9a-f]{6}$/i.test(options.textColor) ? options.textColor : 'white'}; }`);
            updateStyle();
            card.get_style_context().add_provider(css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION + 1);
            const instance = {id: definition.id, card, cleanups, options, margin};
            let requestedVisible = true;
            instance.setEditing = value => {
                editing = value;
                instance.drag?.set_propagation_phase(value ? Gtk.PropagationPhase.CAPTURE : Gtk.PropagationPhase.BUBBLE);
                instance.toolbar?.setEditing(value);
                card.can_target = value || (definition.interactive === true && options.interactive === true);
                card.visible = value || requestedVisible;
                updateStyle();
            };
            this.instances.push(instance);
            try {
                const module = await import(definition.directory.get_child('widget.js').get_uri());
                if (generation !== this.generation) return;
                const storage = Gio.File.new_for_path(`${GLib.get_user_data_dir()}/luna-desktop/widget-state/${definition.id}.json`);
                const context = Object.freeze({
                    remove: () => {
                        const dialog = new Gtk.Dialog({title: 'Remove note?', transient_for: view.window, modal: true});
                        dialog.get_content_area().append(new Gtk.Label({label: 'Remove this note from the desktop?', margin_top: 20, margin_bottom: 20, margin_start: 20, margin_end: 20}));
                        dialog.add_button('Cancel', Gtk.ResponseType.CANCEL);
                        dialog.add_button('Remove', Gtk.ResponseType.OK).add_css_class('destructive-action');
                        dialog.set_default_response(Gtk.ResponseType.CANCEL);
                        dialog.connect('response', (_d, response) => {
                            dialog.destroy();
                            if (response === Gtk.ResponseType.OK)
                                this.settings.set_strv('desktop-enabled-widgets', this.settings.get_strv('desktop-enabled-widgets').filter(id => id !== definition.id));
                        });
                        dialog.present();
                    },
                    contentChanged: () => instance.updateSize?.(),
                    configure: () => customizeWidget(view.window, this.settings, definition),
                    registerResizeHandle: widget => { resizeHandles.push(widget); },
                    setVisible: visible => { requestedVisible = !!visible; card.visible = editing || requestedVisible; },
                    registerDragHandle: widget => { dragHandles.push(widget); },
                    apiVersion: 1, id: definition.id, get editing() { return editing; }, options: Object.freeze({...options}),
                    onDispose(callback) { if (typeof callback !== 'function') throw new TypeError('Expected cleanup function'); cleanups.push(callback); },
                    every(milliseconds, callback) {
                        const source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.max(100, milliseconds), () => {
                            try { callback(); } catch (e) { console.error(e); }
                            return GLib.SOURCE_CONTINUE;
                        });
                        cleanups.push(() => GLib.Source.remove(source));
                    },
                    loadState: () => readJSON(storage),
                    saveState(value) {
                        GLib.mkdir_with_parents(storage.get_parent().get_path(), 0o700);
                        storage.replace_contents(JSON.stringify(value), null, false, Gio.FileCreateFlags.PRIVATE, null);
                    },
                    openUri: uri => Gio.AppInfo.launch_default_for_uri_async(uri, null, null, (_app, result) => {
                        try { Gio.AppInfo.launch_default_for_uri_finish(result); } catch (e) { console.error(e); }
                    }),
                });
                const content = module.create(context);
                if (!(content instanceof Gtk.Widget) || content.get_parent()) throw new TypeError('create(context) must return an unparented Gtk.Widget');
                const header = new Gtk.Box({spacing: 8, valign: Gtk.Align.START, halign: Gtk.Align.FILL});
                header.add_css_class('desktop-widget-header');
                header.append(new Gtk.Label({label: definition.name, xalign: 0, hexpand: true}));
                const remove = new Gtk.Button({icon_name: 'user-trash-symbolic', tooltip_text: 'Remove widget'});
                remove.add_css_class('flat');
                remove.connect('clicked', () => this.settings.set_strv('desktop-enabled-widgets', this.settings.get_strv('desktop-enabled-widgets').filter(id => id !== definition.id)));
                const configure = new Gtk.Button({icon_name: 'emblem-system-symbolic', tooltip_text: 'Customize widget'});
                configure.add_css_class('flat');
                configure.connect('clicked', () => customizeWidget(view.window, this.settings, definition));
                header.append(configure); header.append(remove);
                header.visible = false;
                card.set_child(content);
                instance.header = header; instance.content = content;
                let width = Math.min(Math.max(120, Math.min(600, Number(options.width) || definition.width)), view.monitor.width - 2 * margin);
                let height = Math.min(Math.max(80, Math.min(600, Number(options.height) || definition.height)), view.monitor.height - 2 * margin);
                card.set_size_request(width, options.autoHeight === true ? -1 : height);
                if (options.autoHeight === true) height = 0;
                width = Math.max(width, card.measure(Gtk.Orientation.HORIZONTAL, -1)[1]);
                height = Math.max(height, card.measure(Gtk.Orientation.VERTICAL, width)[1]);
                const clamp = (value, maximum) => Math.max(margin, Math.min(value, Math.max(margin, maximum - margin)));
                const point = previousRect ?? (saved ? restoredPosition(saved, view.monitor, width, height) : {x: view.monitor.width * 0.68, y: view.monitor.height * 0.05});
                let x = clamp(point.x, view.monitor.width - width);
                let y = clamp(point.y, view.monitor.height - height);
                if (!saved) {
                    const occupied = this.instances.filter(other => other !== instance && other.view === view && other.rect);
                    const overlaps = (px, py) => occupied.some(other => px < other.rect.x + other.rect.width + 12 &&
                        px + width + 12 > other.rect.x && py < other.rect.y + other.rect.height + 12 && py + height + 12 > other.rect.y);
                    if (overlaps(x, y)) {
                        let placed = false;
                        for (let px = Math.max(margin, view.monitor.width - width - margin); px >= margin && !placed; px -= 24)
                            for (let py = Math.max(margin, 80); py + height <= view.monitor.height - margin; py += 24)
                                if (!overlaps(px, py)) { x = px; y = py; placed = true; break; }
                    }
                }
                instance.view = view; instance.rect = {x, y, width, height};
                instance.updateSize = () => {
                    if (options.autoHeight !== true || !card.get_parent()) return;
                    height = card.measure(Gtk.Orientation.VERTICAL, width)[1];
                    x = clamp(x, view.monitor.width - width);
                    y = clamp(y, view.monitor.height - height);
                    view.fixed.move(card, x, y);
                    instance.rect = {x, y, width, height};
                };
                view.fixed.put(card, x, y);
                instance.toolbar = widgetToolbar(card, header, view, () => instance.rect);
                instance.toolbar.setEditing(editing);
                cleanups.push(() => instance.toolbar.destroy());
                const first = view.fixed.get_first_child();
                if (first !== card) card.insert_before(view.fixed, first);
                header.insert_after(view.fixed, card);
                if (!saved || saved.monitor === view.monitor.id) {
                    let latest; try { latest = JSON.parse(this.settings.get_string('desktop-widget-positions')); } catch { latest = {}; }
                    latest[definition.id] = anchoredPosition(view.monitor, x, y, width, height, previousRect ? null : saved);
                    this.settings.set_string('desktop-widget-positions', JSON.stringify(latest));
                }
                if (resizeHandles.length) {
                    const resize = new Gtk.GestureDrag({button: 1});
                    let initialWidth, initialHeight, resizing = false;
                    resize.connect('drag-begin', (_g, px, py) => {
                        const picked = view.fixed.pick(px, py, Gtk.PickFlags.DEFAULT);
                        resizing = !!picked && resizeHandles.some(handle => picked === handle || picked.is_ancestor(handle));
                        if (!resizing) { resize.set_state(Gtk.EventSequenceState.DENIED); return; }
                        view.window?.set_focus(null); this.raise(instance);
                        initialWidth = card.get_allocated_width(); initialHeight = card.get_allocated_height();
                    });
                    resize.connect('drag-update', (_g, dx, dy) => {
                        if (!resizing) return;
                        width = Math.max(120, Math.min(600, view.monitor.width - x - margin, initialWidth + dx));
                        height = Math.max(80, Math.min(600, view.monitor.height - y - margin, initialHeight + dy));
                        card.set_size_request(width, height);
                        instance.rect = {x, y, width, height};
                    });
                    resize.connect('drag-end', () => {
                        if (!resizing) return;
                        resizing = false;
                        let positions, all;
                        try { positions = JSON.parse(this.settings.get_string('desktop-widget-positions')); } catch { positions = {}; }
                        positions[definition.id] = anchoredPosition(view.monitor, x, y, width, height);
                        this.settings.set_string('desktop-widget-positions', JSON.stringify(positions));
                        try { all = JSON.parse(this.settings.get_string('desktop-widget-options')); } catch { all = {}; }
                        all[definition.id] = {...options, width: Math.round(width), height: Math.round(height)};
                        this.settings.set_string('desktop-widget-options', JSON.stringify(all));
                    });
                    view.fixed.add_controller(resize);
                    cleanups.push(() => view.fixed.remove_controller(resize));
                }
                const select = new Gtk.GestureClick({button: 1, propagation_phase: Gtk.PropagationPhase.CAPTURE});
                select.connect('pressed', () => { if (editing || dragHandles.length) this.raise(instance); });
                card.add_controller(select);
                const drag = new Gtk.GestureDrag({button: 1, propagation_phase: editing ? Gtk.PropagationPhase.CAPTURE : Gtk.PropagationPhase.BUBBLE});
                instance.drag = drag;
                let startX, startY, pointerX, pointerY, moving = false;
                let destination = view, ghost = null, image = null;
                let guides = [];
                const clearGuides = () => { for (const guide of guides) guide.get_parent()?.remove(guide); guides = []; };
                const guideCss = new Gtk.CssProvider();
                guideCss.load_from_string('box { background: alpha(@accent_bg_color, 0.85); }');
                const removeGhost = () => { ghost?.get_parent()?.remove(ghost); ghost = null; };
                const restoreDrag = () => {
                    clearGuides(); removeGhost(); card.opacity = Math.max(0.1, Math.min(1, Number(options.opacity) / 100));
                };
                cleanups.push(restoreDrag);
                drag.connect('drag-begin', (_d, px, py) => {
                    const picked = view.fixed.pick(px, py, Gtk.PickFlags.DEFAULT);
                    moving = false;
                    const inside = handle => picked && (picked === handle || picked.is_ancestor(handle));
                    const allowed = editing
                        ? inside(card) && !resizeHandles.some(inside)
                        : dragHandles.some(inside) && !(picked instanceof Gtk.Button || picked?.get_ancestor(Gtk.Button) ||
                            picked instanceof Gtk.Entry || picked?.get_ancestor(Gtk.Entry));
                    if (!allowed) { drag.set_state(Gtk.EventSequenceState.DENIED); return; }
                    view.window?.set_focus(null);
                    instance.toolbar.hide();
                    moving = true; startX = x; startY = y; pointerX = px; pointerY = py;
                    destination = view;
                    image = new Gtk.WidgetPaintable({widget: card}).get_current_image();
                });
                drag.connect('drag-update', (_d, dx, dy) => {
                    if (!moving) return;
                    if (Math.abs(dx) + Math.abs(dy) > 3) drag.set_state(Gtk.EventSequenceState.CLAIMED);
                    const globalX = view.monitor.x + pointerX + dx - (view.scroll?.hadjustment.value ?? 0);
                    const globalY = view.monitor.y + pointerY + dy;
                    const next = views.find(candidate => globalX >= candidate.monitor.x &&
                        globalX < candidate.monitor.x + candidate.monitor.width && globalY >= candidate.monitor.y &&
                        globalY < candidate.monitor.y + candidate.monitor.height) ?? destination;
                    if (next !== destination) {
                        removeGhost(); destination = next;
                        if (destination !== view) {
                            ghost = new Gtk.Picture({paintable: image, width_request: card.get_allocated_width(),
                                height_request: card.get_allocated_height(), can_target: false});
                            destination.fixed.put(ghost, 0, 0);
                            const first = destination.fixed.get_first_child();
                            if (first !== ghost) ghost.insert_before(destination.fixed, first);
                        }
                    }
                    x = clamp(globalX - destination.monitor.x + (destination.scroll?.hadjustment.value ?? 0) - (pointerX - startX),
                        destination.monitor.width - card.get_allocated_width());
                    y = clamp(globalY - destination.monitor.y - (pointerY - startY), destination.monitor.height - card.get_allocated_height());
                    clearGuides();
                    if (this.settings.get_boolean('desktop-widget-snap-enabled')) {
                        const peers = this.instances.filter(other => other !== instance && other.view === destination && other.card.visible && other.rect)
                            .map(other => ({...other.rect, width: other.card.get_allocated_width() || other.rect.width, height: other.card.get_allocated_height() || other.rect.height}));
                        const snapped = snapWidget({x, y, width: card.get_allocated_width(), height: card.get_allocated_height()}, peers,
                            destination.monitor, this.settings.get_int('desktop-widget-snap-distance'), margin);
                        x = snapped.x; y = snapped.y;
                        for (const [axis, point] of Object.entries(snapped.guides)) {
                            const guide = new Gtk.Box({can_target: false, width_request: axis === 'x' ? 1 : destination.monitor.width,
                                height_request: axis === 'y' ? 1 : destination.monitor.height});
                            guide.get_style_context().add_provider(guideCss, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION + 1);
                            destination.fixed.put(guide, axis === 'x' ? point : 0, axis === 'y' ? point : 0);
                            guides.push(guide);
                        }
                    }
                    card.opacity = destination === view ? Math.max(0.1, Math.min(1, Number(options.opacity) / 100)) : 0;
                    if (ghost) destination.fixed.move(ghost, x, y);
                    else view.fixed.move(card, x, y);
                    instance.rect = {x, y, width: card.get_allocated_width(), height: card.get_allocated_height()};
                });
                drag.connect('cancel', () => {
                    if (!moving) return;
                    moving = false; restoreDrag(); x = startX; y = startY;
                    view.fixed.move(card, x, y);
                    instance.rect = {x, y, width: card.get_allocated_width(), height: card.get_allocated_height()};
                });
                drag.connect('drag-end', () => {
                    if (!moving) return;
                    moving = false;
                    let latest; try { latest = JSON.parse(this.settings.get_string('desktop-widget-positions')); } catch { latest = {}; }
                    latest[definition.id] = anchoredPosition(destination.monitor, x, y, card.get_allocated_width(), card.get_allocated_height());
                    this.settings.set_string('desktop-widget-positions', JSON.stringify(latest));
                    restoreDrag();
                    if (destination !== view) {
                        // Finish the source gesture before rebuilding the widget on
                        // its destination surface; text and options retain its ID.
                        let pending = true;
                        const source = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                            pending = false;
                            this.mount(views, editing).catch(console.error);
                            return GLib.SOURCE_REMOVE;
                        });
                        cleanups.push(() => { if (pending) GLib.Source.remove(source); });
                    }
                });
                view.fixed.add_controller(drag);
                cleanups.push(() => view.fixed.remove_controller(drag));
            } catch (e) {
                console.error(`Widget ${definition.id}: ${e.message}`);
                if (generation !== this.generation) return;
                card.set_child(new Gtk.Label({label: `${definition.name} could not load`, wrap: true}));
                view.fixed.put(card, 16, 16);
                const first = view.fixed.get_first_child();
                if (first !== card) card.insert_before(view.fixed, first);
            }
        }
    }
}
