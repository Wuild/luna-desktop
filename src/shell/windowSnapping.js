import {_, formatText} from '../i18n.js';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import {windowPreviewCard, previewButtonStyle, watchStyle, clearStyleSettings} from './windowPreviewCard.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {bindSwitcherSurface} from './switcherSurface.js';
import {SnapSwitcher} from './snapSwitcher.js';
import {loadNativeBridge, TileConstraint, clearNativeBridge} from './nativeConstraint.js';
import {layouts, frame, edgeTarget, boundaries, resizeBoundary} from './snapLayouts.js';

function accent(alpha) {
    const [color] = St.ThemeContext.get_for_stage(global.stage).get_accent_color();
    const rgb = [color.get_red(), color.get_green(), color.get_blue()]
        .map(channel => Math.round(channel * 255 * 0.8 + 128 * 0.2));
    return `rgba(${rgb.join(',')},${alpha})`;
}
const tileStyle = active => `background-color: ${accent(active ? 0.38 : 0.14)}; border: 1px solid ${accent(0.6)}; border-radius: 2px; transition-duration: 120ms;`;
const ghostStyle = () => `background-color: ${accent(0.22)}; border: 2px solid ${accent(0.7)}; border-radius: 3px;`;

export class WindowSnapping {
    constructor(settings) {
        this.settings = settings;
        this.nativeBridge = loadNativeBridge();
        this.tileConstraints = new Map();
        this.updatingWindows = new Set();
        this.signals = [];
        this.groups = new Set();
        this.sources = new Set();
        this.animations = new Map();
        this.animationLaters = new Set();
        this.retiringActors = new Set();
        this.drag = null;
        this.nativeResize = null;
        this.bar = null;
        this.barHandle = null;
        this.preview = null;
        this.picker = null;
        this.dividerDrag = null;
        this.native = new Gio.Settings({schema_id: 'org.gnome.mutter'});
        this.pendingPlacements = new Map();
        this.keyPositions = new WeakMap();
        this.switcher = null;
        const syncSwitcher = () => {
            this.switcher?.destroy(); this.switcher = null;
            if (settings.get_boolean('desktop-snap-switcher-enabled')) this.switcher = new SnapSwitcher(this);
        };
        this.connect(settings.raw, 'changed::desktop-snap-switcher-enabled', syncSwitcher);
        syncSwitcher();
        this.nativeTiling = this.native.get_boolean('edge-tiling');
        this.native.set_boolean('edge-tiling', false);
        this.connect(global.display, 'grab-op-begin', (_d, w, op) => this.begin(w, op));
        this.connect(global.display, 'grab-op-end', () => this.end());
        this.connect(global.stage, 'captured-event', (_s, event) => this.event(event));
        this.connect(Main.layoutManager, 'monitors-changed', () => this.queueReflow());
        this.connect(settings.raw, 'changed::desktop-snap-bar-enabled', () => { this.clear('bar'); this.clear('barHandle'); });
        this.connect(settings.raw, 'changed::desktop-snap-square-corners', () => this.reflow());
        this.connect(settings.raw, 'changed::desktop-snap-gap', () => {
            this.reflow();
        });
        this.connect(global.display, 'workareas-changed', () => this.queueReflow());
        this.connect(global.workspace_manager, 'active-workspace-changed', () => this.cancel());
        this.connect(Main.overview, 'hidden', () => this.updateDividers());
        this.connect(Main.overview, 'showing', () => this.cancel());
        this.connect(Main.sessionMode, 'updated', () => this.cancel());
        this.connect(global.display, 'notify::focus-window', () => this.updateDividers());
        Main.wm.addKeybinding('desktop-snap-layout-shortcut', settings.raw, Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL, () => this.openFlyout());
        for (const direction of ['left', 'right', 'up', 'down'])
            Main.wm.addKeybinding(`desktop-snap-${direction}`, settings.raw, Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL, () => this.keyboardSnap(direction));
    }
    connect(object, signal, callback) {
        const id = object.connect(signal, callback);
        this.signals.push([object, id]);
    }
    later(callback, delay = 0) {
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this.sources.delete(id); callback(); return GLib.SOURCE_REMOVE;
        });
        this.sources.add(id);
        return id;
    }
    eligible(w) {
        // Mutter implicitly puts secondary-monitor windows on every workspace
        // when workspaces-only-on-primary is enabled. They are still tileable.
        const secondaryWorkspace = w && Meta.prefs_get_workspaces_only_on_primary() &&
            w.get_monitor() !== Main.layoutManager.primaryIndex;
        return w && w.get_window_type() === Meta.WindowType.NORMAL && !w.skip_taskbar &&
            !w.is_fullscreen() && w.allows_move() && (w.allows_resize() || w.is_maximized()) &&
            (!w.is_on_all_workspaces() || secondaryWorkspace);
    }
    fits(w, rect) {
        if (!this.eligible(w)) return false;
        const [known, width, height] = w.get_min_size();
        return !known || (rect.width >= width && rect.height >= height);
    }
    tileFrame(area, tile) { return frame(area, tile, this.settings.get_int('desktop-snap-gap')); }
    area(monitor) { return Main.layoutManager.getWorkAreaForMonitor(monitor); }
    chrome(actor, _input = false) {
        Main.layoutManager.addChrome(actor, {trackFullscreen: true});
        return actor;
    }
    reveal(actor, slide = true) {
        if (!St.Settings.get().enable_animations) return;
        actor.opacity = 0;
        actor.translation_y = slide ? -8 : 0;
        actor.ease({opacity: 255, translation_y: 0, duration: 160, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    }
    animateWindow(w, oldFrame) {
        if (!St.Settings.get().enable_animations || this.dividerDrag || this.nativeResize) return;
        const id = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this.animationLaters.delete(id);
            const actor = w.get_compositor_private();
            if (!actor || this.drag?.window === w) return GLib.SOURCE_REMOVE;
            const rect = w.get_frame_rect();
            if (!rect.width || !rect.height || !oldFrame.width || !oldFrame.height) return GLib.SOURCE_REMOVE;
            this.stopAnimation(w);
            this.animations.set(w, actor);
            actor.set({translation_x: oldFrame.x - rect.x, translation_y: oldFrame.y - rect.y,
                scale_x: oldFrame.width / rect.width, scale_y: oldFrame.height / rect.height});
            actor.ease({translation_x: 0, translation_y: 0, scale_x: 1, scale_y: 1,
                duration: 200, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onStopped: () => this.animations.delete(w)});
            return GLib.SOURCE_REMOVE;
        });
        this.animationLaters.add(id);
    }
    stopAnimation(w) {
        const actor = this.animations.get(w);
        if (!actor) return;
        this.animations.delete(w);
        for (const property of ['translation-x', 'translation-y', 'scale-x', 'scale-y']) actor.remove_transition(property);
        actor.set({translation_x: 0, translation_y: 0, scale_x: 1, scale_y: 1});
    }
    clear(name) {
        if (name === 'picker' && this.pickerModal) { Main.popModal(this.pickerModal); this.pickerModal = null; }
        const actor = this[name];
        this[name] = null;
        if (actor) {
            if (this.destroying || !St.Settings.get().enable_animations) actor.destroy();
            else {
                // Release input immediately; keep only the visual during its exit.
                const disableInput = node => {
                    node.reactive = false;
                    if (node instanceof St.Widget) node.can_focus = false;
                    for (const child of node.get_children()) disableInput(child);
                };
                disableInput(actor);
                this.retiringActors.add(actor);
                actor._slideContent?.ease({translation_y: -actor.height, duration: 130, mode: Clutter.AnimationMode.EASE_IN_QUAD});
                actor.ease({opacity: 0, duration: 130, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    onStopped: () => { this.retiringActors.delete(actor); actor.destroy(); }});
            }
        }
        if (name === 'picker') this.pickerCards = [];
    }
    cancel() {
        this.finishDivider();
        const resizing = this.nativeResize;
        if (resizing && this.groups.has(resizing.group)) {
            const constraint = this.tileConstraints.get(resizing.window);
            if (constraint) constraint.enabled = true;
            this.applyGroup(resizing.group);
            this.buildDividers(resizing.group);
        }
        this.nativeResize = null;
        this.drag = null; this.dividerDrag = null;
        if (this.poll) { GLib.source_remove(this.poll); this.sources.delete(this.poll); this.poll = 0; }
        if (this.modal) { Main.popModal(this.modal); this.modal = null; }
        for (const name of ['bar', 'barHandle', 'preview', 'picker']) this.clear(name);
        this.updateDividers();
    }
    queueReflow() {
        if (this.reflowSource) { GLib.source_remove(this.reflowSource); this.sources.delete(this.reflowSource); }
        this.reflowSource = this.later(() => { this.reflowSource = 0; this.reflow(); }, 80);
    }
    reflow() {
        // Restoring a maximized window can change taskbar struts mid-grab.
        // Rebuild the drag surfaces for the new work area without ending the grab.
        if (this.drag) {
            for (const name of ['bar', 'barHandle', 'preview']) this.clear(name);
            this.drag.target = null;
            this.drag.monitor = -1;
        } else this.cancel();
        const monitors = Main.layoutManager.monitors;
        if (!monitors.length) return;
        for (const group of [...this.groups]) {
            if (!monitors[group.monitor]) {
                const memberMonitor = [...group.windows.values()].map(w => w.get_monitor()).find(index => monitors[index]);
                group.monitor = memberMonitor ?? 0;
            }
            group.retries = 0;
            this.applyGroup(group);
            this.buildDividers(group);
        }
        if (this.drag) this.motion();
    }
    reset() { this.cancel(); for (const group of [...this.groups]) this.removeGroup(group); }
    begin(w, op) {
        this.cancel();
        if (!this.eligible(w)) return;
        if (op !== Meta.GrabOp.MOVING && op !== Meta.GrabOp.KEYBOARD_MOVING) {
            const group = [...this.groups].find(g => [...g.windows.values()].includes(w));
            if (group) {
                this.stopAnimation(w);
                const constraint = this.tileConstraints.get(w);
                if (constraint) constraint.enabled = false;
                this.nativeResize = {window: w, group, original: group.tiles.map(t => [...t])};
            }
            return;
        }
        this.detach(w);
        this.drag = {window: w, target: null, monitor: -1};
        this.poll = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => {
            if (!this.drag) return GLib.SOURCE_REMOVE;
            this.motion(); return GLib.SOURCE_CONTINUE;
        });
        this.sources.add(this.poll);
        this.motion();
    }
    motion() {
        const [x, y] = global.get_pointer();
        const monitor = Main.layoutManager.monitors.findIndex(m => x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height);
        if (monitor < 0) return;
        if (this.drag.monitor !== monitor) { this.clear('bar'); this.clear('barHandle'); this.drag.monitor = monitor; }
        const area = this.area(monitor);
        if (this.settings.get_boolean('desktop-snap-bar-enabled')) this.showDragHandle(monitor);
        const inside = (actor, margin = 0) => actor && x >= actor.x - margin && x <= actor.x + actor.width + margin && y >= actor.y && y <= actor.y + actor.height + margin;
        if (inside(this.barHandle)) this.showBar(monitor, false);
        if (this.bar && !inside(this.bar, 14) && !inside(this.barHandle)) this.clear('bar');
        let target = null;
        if (this.bar) {
            const hit = this.barTargets.find(t => {
                const [tx, ty] = t.actor.get_transformed_position();
                return y >= this.bar.y && x >= tx && x < tx + t.actor.width && y >= ty && y < ty + t.actor.height;
            });
            if (hit) target = {layout: hit.layout, index: hit.index};
            for (const t of this.barTargets) { t.actor._snapActive = t === hit; t.actor.set_style(tileStyle(t === hit)); }
        }
        target ??= edgeTarget(area, x, y);
        if (target && !this.fits(this.drag.window, this.tileFrame(area, layouts[target.layout].tiles[target.index]))) target = null;
        this.drag.target = target;
        this.showPreview(target ? (layouts[target.layout].name === 'Maximize' ? area : this.tileFrame(area, layouts[target.layout].tiles[target.index])) : null);
    }
    showPreview(rect) {
        if (!rect) { this.clear('preview'); return; }
        if (!this.preview) {
            this.preview = this.chrome(new St.Widget({reactive: false, style: ghostStyle()}));
            const preview = this.preview;
            St.ThemeContext.get_for_stage(global.stage).connectObject('changed', () => preview.set_style(ghostStyle()), preview);
            if (this.bar) Main.uiGroup.set_child_above_sibling(this.bar, this.preview);
            this.preview.set_position(rect.x + 4, rect.y + 4);
            this.preview.set_size(Math.max(1, rect.width - 8), Math.max(1, rect.height - 8));
            this.reveal(this.preview);
        }
        const target = {x: rect.x + 4, y: rect.y + 4, width: Math.max(1, rect.width - 8), height: Math.max(1, rect.height - 8)};
        const key = JSON.stringify(target);
        if (this.preview._target !== key) {
            this.preview._target = key;
            this.preview.ease({...target, duration: St.Settings.get().enable_animations ? 140 : 0, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        }
    }
    showDragHandle(monitor) {
        if (this.barHandle) return;
        const bounds = Main.layoutManager.monitors[monitor], area = this.area(monitor);
        const width = Math.min(620, area.width - 24);
        this.barHandle = this.chrome(new St.Widget({x: area.x + (area.width - width) / 2, y: bounds.y,
            width, height: 28, reactive: false}));
        this.barHandle._blur = bindSwitcherSurface(this.settings, this.barHandle, true);
        this.barHandle.add_child(new St.Widget({x: (width - 32) / 2, y: 12, width: 32, height: 3,
            style: `background-color: ${accent(0.7)}; border-radius: 1px;`}));
        this.reveal(this.barHandle);
    }
    showBar(monitor, clickable) {
        if (this.bar) return;
        const area = this.area(monitor);
        const width = Math.min(clickable ? 300 : 620, area.width - 24), height = clickable ? 300 : 112;
        const windowFrame = this.flyoutWindow?.get_frame_rect();
        const x = clickable ? Math.max(area.x + 8, Math.min(area.x + area.width - width - 8, windowFrame.x + windowFrame.width - width)) : area.x + (area.width - width) / 2;
        const y = clickable ? Math.max(area.y + 8, Math.min(area.y + area.height - height - 8, windowFrame.y + 36)) : Main.layoutManager.monitors[monitor].y;
        this.bar = this.chrome(new St.Widget({reactive: clickable, clip_to_allocation: !clickable, x, y, width, height}), clickable);
        const content = new St.Widget({width, height});
        bindSwitcherSurface(this.settings, content, !clickable);
        this.bar.add_child(content);
        if (clickable) this.reveal(this.bar);
        else if (St.Settings.get().enable_animations) {
            this.bar._slideContent = content;
            content.translation_y = -height;
            content.ease({translation_y: 0, duration: 220, mode: Clutter.AnimationMode.EASE_OUT_CUBIC});
        }
        this.barTargets = [];
        const cell = (width - 24) / (clickable ? 2 : layouts.length);
        layouts.forEach((layout, li) => {
            const cellX = 12 + (clickable ? li % 2 : li) * cell;
            const cellY = 14 + (clickable ? Math.floor(li / 2) * 92 : 0);
            layout.tiles.forEach((tile, index) => {
                const r = frame({x: cellX, y: cellY, width: cell - 12, height: 60}, tile);
                const actor = new St.Button({x: r.x + 2, y: r.y + 2, width: r.width - 4, height: r.height - 4,
                    reactive: clickable, can_focus: clickable, accessible_name: formatText(_("%s, position %s"), _(layout.name), index + 1), style: tileStyle(false)});
                St.ThemeContext.get_for_stage(global.stage).connectObject('changed', () => actor.set_style(tileStyle(actor._snapActive || actor.hover)), actor);
                actor.track_hover = true;
                actor.connect('notify::hover', () => actor.set_style(tileStyle(actor._snapActive || actor.hover)));
                content.add_child(actor);
                this.barTargets.push({...r, x: x + r.x, y: y + r.y, layout: li, index, actor});
                if (clickable) actor.connect('clicked', () => {
                    const window = this.flyoutWindow; this.cancel();
                    if (this.eligible(window)) this.snap(window, monitor, li, index);
                });
            });
            content.add_child(new St.Label({text: _(layout.name), x: cellX, y: cellY + 64, style: 'font-size: 10px;'}));
        });
    }
    keyboardSnap(direction) {
        const w = global.display.focus_window;
        this.cancel();
        if (!this.eligible(w)) return;
        let side = this.keyPositions.get(w) ?? (w.get_frame_rect().x > this.area(w.get_monitor()).x + this.area(w.get_monitor()).width / 3 ? 1 : 0);
        if (direction === 'left' || direction === 'right') side = direction === 'right' ? 1 : 0;
        this.keyPositions.set(w, side);
        this.snap(w, w.get_monitor(), direction === 'left' || direction === 'right' ? 0 : 4,
            side + (direction === 'down' ? 2 : 0));
    }
    openFlyout() {
        const w = global.display.focus_window;
        this.cancel();
        if (!this.eligible(w)) return;
        this.flyoutWindow = w;
        this.showBar(w.get_monitor(), true);
        this.modal = Main.pushModal(this.bar);
        if (!this.modal) { this.cancel(); return; }
        this.barTargets[0].actor.grab_key_focus();
    }
    end() {
        const drag = this.drag;
        this.cancel();
        if (drag?.target && this.eligible(drag.window)) {
            // Apply after Mutter completes its own move operation.
            this.later(() => {
                if (this.eligible(drag.window) && drag.window.get_compositor_private())
                    this.snap(drag.window, drag.monitor, drag.target.layout, drag.target.index);
            });
        }
    }
    place(w, rect) {
        const oldFrame = w.get_frame_rect();
        if (w.minimized) w.unminimize();
        const wasMaximized = w.is_maximized();
        let constraint = this.tileConstraints.get(w);
        if (this.nativeBridge && !constraint) {
            constraint = new TileConstraint();
            constraint.enabled = true;
            this.tileConstraints.set(w, constraint);
            w.add_external_constraint(constraint);
        }
        const square = !!constraint && this.settings.get_boolean('desktop-snap-square-corners');
        if (constraint) { constraint.rect = rect; constraint.square = square; }
        this.updatingWindows.add(w);
        try {
            if (square) { if (!wasMaximized) w.maximize(); }
            else w.unmaximize();
        } finally { this.updatingWindows.delete(w); }
        const pending = this.pendingPlacements.get(w);
        if (pending) { GLib.source_remove(pending); this.sources.delete(pending); this.pendingPlacements.delete(w); }
        const move = () => {
            this.pendingPlacements.delete(w);
            if (w.get_compositor_private()) {
                w.move_resize_frame(false, rect.x, rect.y, rect.width, rect.height);
                this.animateWindow(w, oldFrame);
            }
        };
        // Mutter restores the old frame during unmaximize. Place after that transaction.
        if (wasMaximized && !square) this.pendingPlacements.set(w, this.later(move));
        else move();
    }
    snap(w, monitor, layout, index) {
        if (!this.fits(w, this.tileFrame(this.area(monitor), layouts[layout].tiles[index]))) {
            Main.notify(_('Window does not fit'), _('Choose a larger tile for this application.'));
            return;
        }
        this.detach(w);
        if (layouts[layout].name === 'Maximize') {
            if (w.minimized) w.unminimize();
            w.move_to_monitor(monitor);
            w.maximize();
            w.activate(global.get_current_time());
            return;
        }
        const workspace = w.get_workspace();
        let group = [...this.groups].find(g => g.monitor === monitor && g.workspace === workspace && g.layout === layout && !g.windows.has(index));
        if (!group) {
            group = {monitor, workspace, layout, tiles: layouts[layout].tiles.map(t => [...t]), windows: new Map(), signals: [], dividers: []};
            this.groups.add(group);
        }
        this.assign(group, index, w);
        this.offer(group);
    }
    assign(group, index, w) {
        if ([...group.windows.values()].includes(w)) {
            for (const [slot, member] of group.windows) if (member === w) group.windows.delete(slot);
            for (const [object, id] of group.signals) if (object === w) object.disconnect(id);
            group.signals = group.signals.filter(([object]) => object !== w);
        } else this.detach(w);
        group.windows.set(index, w);
        this.place(w, this.tileFrame(this.area(group.monitor), group.tiles[index]));
        w.activate(global.get_current_time());
        for (const signal of ['unmanaged', 'workspace-changed', 'notify::maximized-horizontally', 'notify::maximized-vertically', 'notify::fullscreen']) {
            group.signals.push([w, w.connect(signal, () => {
                if (this.updatingWindows.has(w)) return;
                const square = this.tileConstraints.get(w)?.square;
                if (signal === 'unmanaged' || signal === 'workspace-changed' || w.is_fullscreen() ||
                    (square ? !w.is_maximized() : w.is_maximized())) this.detach(w, signal === 'unmanaged');
            })]);
        }
        for (const signal of ['position-changed', 'size-changed'])
            group.signals.push([w, w.connect(signal, () => {
                if (this.nativeResize?.window === w && this.nativeResize.group === group) this.resizeFromWindow(group, w);
                else this.validateLater(group);
            })]);
        group.signals.push([w, w.connect('notify::minimized', () => this.updateDividers())]);
        this.buildDividers(group);
    }
    minimums(group) {
        const area = this.area(group.monitor);
        return group.tiles.map((_t, i) => {
            const min = group.windows.get(i)?.get_min_size();
            const gap = this.settings.get_int('desktop-snap-gap');
            return [(Math.max(160, min?.[0] ? min[1] : 0) + gap * 2) / area.width,
                (Math.max(100, min?.[0] ? min[2] : 0) + gap * 2) / area.height];
        });
    }
    resizeFromWindow(group, w) {
        const state = this.nativeResize;
        if (!state || state.updating) return;
        state.updating = true;
        try {
            const area = this.area(group.monitor), actual = w.get_frame_rect();
            const index = [...group.windows].find(([_, member]) => member === w)?.[0];
            if (index === undefined) return;
            const original = this.tileFrame(area, state.original[index]);
            let tiles = state.original.map(t => [...t]);
            for (const boundary of boundaries(state.original)) {
                const axis = boundary.axis, before = boundary.before.includes(index), after = boundary.after.includes(index);
                if (!before && !after) continue;
                const oldEdge = axis === 0 ? original.x + (before ? original.width : 0) : original.y + (before ? original.height : 0);
                const edge = axis === 0 ? actual.x + (before ? actual.width : 0) : actual.y + (before ? actual.height : 0);
                if (Math.abs(edge - oldEdge) < 1) continue;
                const gap = this.settings.get_int('desktop-snap-gap');
                const splitEdge = edge + (before ? Math.ceil(gap / 2) : -Math.floor(gap / 2));
                const value = axis === 0 ? (splitEdge - area.x) / area.width : (splitEdge - area.y) / area.height;
                tiles = resizeBoundary(tiles, boundary, value, this.minimums(group));
            }
            group.tiles = tiles;
            this.applyGroup(group, w);
        } finally { state.updating = false; }
    }
    validateLater(group) {
        if (group.validation) { GLib.source_remove(group.validation); this.sources.delete(group.validation); }
        group.validation = this.later(() => {
            group.validation = 0;
            if (!this.groups.has(group) || (this.dividerDrag?.group === group || this.nativeResize?.group === group)) return;
            for (const [index, w] of group.windows) {
                const expected = this.tileFrame(this.area(group.monitor), group.tiles[index]);
                const actual = w.get_frame_rect();
                if (['x', 'y', 'width', 'height'].some(key => Math.abs(expected[key] - actual[key]) > 3)) {
                    // A client configure or monitor resize can settle asynchronously.
                    // Keep membership and reassert the current grid instead of dissolving it.
                    if ((group.retries ?? 0) < 3) {
                        group.retries = (group.retries ?? 0) + 1;
                        this.applyGroup(group);
                    }
                    return;
                }
            }
        }, 400);
    }
    offer(group) {
        this.clear('picker');
        if (!this.groups.has(group) || !this.settings.get_boolean('desktop-snap-assist-enabled')) return;
        const index = group.tiles.findIndex((_t, i) => !group.windows.has(i));
        if (index < 0) return;
        const rect = this.tileFrame(this.area(group.monitor), group.tiles[index]);
        const candidates = global.display.get_tab_list(Meta.TabList.NORMAL, global.workspace_manager.get_active_workspace())
            .filter(w => this.fits(w, rect) && ![...group.windows.values()].includes(w) && w.get_monitor() === group.monitor);
        if (!candidates.length) return;
        this.picker = this.chrome(new St.Widget({reactive: true,
            style: 'color: #f5f5f5; background-color: rgba(0,0,0,0.68); border: 1px solid rgba(255,255,255,0.08); border-radius: 4px;',
            x: rect.x, y: rect.y, width: rect.width, height: rect.height}), true);
        // Modal grabs root event delivery here, bypassing stage capture.
        this.picker.connect('captured-event', (_actor, event) => this.event(event));
        this.pickerCards = [];
        const width = Math.max(100, rect.width - 40);
        const columnCount = Math.min(candidates.length, Math.max(1, Math.min(3, Math.floor(width / 180))));
        const columnWidth = Math.floor((width - (columnCount - 1) * 12) / columnCount);
        const columns = Array.from({length: columnCount}, () => new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL, width: columnWidth, y_align: Clutter.ActorAlign.START, style: 'spacing: 12px;'}));
        const heights = columns.map(() => 0);
        const contentWidth = columnWidth * columnCount + (columnCount - 1) * 12;
        const content = new St.BoxLayout({style: 'spacing: 12px;', width: contentWidth});
        for (const column of columns) content.add_child(column);
        for (const w of candidates) {
            const r = w.get_frame_rect();
            const availableWidth = columnWidth - 14;
            const scale = Math.min(availableWidth / Math.max(1, r.width), 220 / Math.max(1, r.height));
            const previewWidth = Math.round(r.width * scale), previewHeight = Math.max(56, Math.round(r.height * scale));
            const card = new St.Button({can_focus: true, track_hover: true, width: columnWidth,
                accessible_name: w.get_title() || _('Window'), style: previewButtonStyle(false)});
            const highlight = () => card.set_style(previewButtonStyle(card.hover || card.has_key_focus()));
            watchStyle(card, highlight);
            card.connect('notify::hover', highlight);
            card.connect('key-focus-in', highlight);
            card.connect('key-focus-out', highlight);
            const thumbnail = new St.Widget({width: availableWidth, height: previewHeight});
            const source = w.get_compositor_private();
            if (source && r.width > 0)
                thumbnail.add_child(new Clutter.Clone({source, x: (availableWidth - previewWidth) / 2, width: previewWidth, height: previewHeight}));
            else {
                const icon = Shell.WindowTracker.get_default().get_window_app(w)?.create_icon_texture(48);
                if (icon) { icon.set_position((availableWidth - 48) / 2, (previewHeight - 48) / 2); thumbnail.add_child(icon); }
            }
            const {card: cardContent, label} = windowPreviewCard(w, thumbnail, availableWidth);
            card.set_child(cardContent);
            card.label_actor = label;
            const columnIndex = heights.indexOf(Math.min(...heights));
            columns[columnIndex].add_child(card);
            heights[columnIndex] += previewHeight + 40 + 14 + 12;
            this.pickerCards.push(card);
            card.connect('clicked', () => {
                if (!this.groups.has(group) || !this.fits(w, rect) || !w.get_compositor_private()) { this.offer(group); return; }
                this.clear('picker'); this.assign(group, index, w); this.offer(group);
            });
        }
        const scroll = new St.ScrollView({x: (rect.width - contentWidth) / 2, width: contentWidth,
            hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC});
        scroll.set_child(content); this.picker.add_child(scroll);
        const height = Math.min(Math.max(80, rect.height - 40), content.get_preferred_height(contentWidth)[1]);
        scroll.set_height(height);
        scroll.set_y((rect.height - height) / 2);
        this.pickerModal = Main.pushModal(this.picker, {actionMode: Shell.ActionMode.NORMAL});
        this.reveal(this.picker, false);
        this.reveal(scroll);
        this.pickerCards[0]?.grab_key_focus();
    }

    buildDividers(group) {
        for (const d of group.dividers) d.destroy();
        group.dividers = [];
        if (group.windows.size < 2) return;
        const area = this.area(group.monitor);
        for (const boundary of boundaries(group.tiles)) {
            if (!boundary.before.some(i => group.windows.has(i)) || !boundary.after.some(i => group.windows.has(i))) continue;
            const axis = boundary.axis, perpendicular = 1 - axis;
            const involved = [...boundary.before, ...boundary.after].map(i => group.tiles[i]);
            const start = Math.max(Math.min(...boundary.before.map(i => group.tiles[i][perpendicular])),
                Math.min(...boundary.after.map(i => group.tiles[i][perpendicular])));
            const end = Math.min(...[boundary.before, boundary.after].map(indices => Math.max(...indices.map(i => group.tiles[i][perpendicular] + group.tiles[i][perpendicular + 2]))));
            if (!involved.length || end <= start) continue;
            const d = this.chrome(new St.Widget({reactive: true, track_hover: true, style: 'background-color: transparent;'}), true);
            d.set_position(axis === 0 ? area.x + area.width * boundary.value - 4 : area.x + area.width * start,
                axis === 1 ? area.y + area.height * boundary.value - 4 : area.y + area.height * start);
            d.set_size(axis === 0 ? 8 : area.width * (end - start), axis === 1 ? 8 : area.height * (end - start));
            const highlight = () => d.set_style(`background-color: rgba(128,128,128,${d.hover || this.dividerDrag?.actor === d ? '0.45' : '0'}); border-radius: 1px; transition-duration: 120ms;`);
            d.connect('notify::hover', highlight);
            d.connect('button-press-event', (_a, e) => {
                if (e.get_button() !== 1) return Clutter.EVENT_PROPAGATE;
                this.clear('picker');
                this.dividerDrag = {group, boundary, actor: d, original: group.tiles.map(t => [...t])};
                highlight();
                this.dividerGrab = global.stage.grab(d);
                return Clutter.EVENT_STOP;
            });
            // A Clutter grab roots event delivery at the grabbed actor.
            // Motion/release may therefore bypass the stage capture handler.
            d.connect('captured-event', (_actor, event) => this.dividerDrag?.actor === d
                ? this.event(event) : Clutter.EVENT_PROPAGATE);
            d._snapBoundary = boundary;
            group.dividers.push(d);
        }
        this.updateDividers();
    }
    updateDividers() {
        for (const group of this.groups) {
            const windows = [...group.windows.values()];
            const visible = !Main.overview.visible && !Main.sessionMode.isLocked && !this.drag &&
                windows.includes(global.display.focus_window) && windows.every(w => !w.minimized && w.showing_on_its_workspace());
            for (const d of group.dividers) d.visible = visible;
        }
    }
    event(event) {
        const type = event.type();
        if (type === Clutter.EventType.KEY_PRESS && event.get_key_symbol() === Clutter.KEY_Escape && (this.bar || this.picker || this.dividerDrag)) {
            if (this.dividerDrag) {
                const {group, original} = this.dividerDrag; group.tiles = original; this.applyGroup(group);
            }
            this.finishDivider(); this.cancel(); return Clutter.EVENT_STOP;
        }
        if (this.dividerDrag) {
            const {group, boundary, original} = this.dividerDrag;
            if (type === Clutter.EventType.MOTION) {
                const [x, y] = event.get_coords(), area = this.area(group.monitor);
                const minimums = this.minimums(group);
                group.tiles = resizeBoundary(original, boundary, boundary.axis === 0 ? (x - area.x) / area.width : (y - area.y) / area.height, minimums);
                this.applyGroup(group); return Clutter.EVENT_STOP;
            }
            if (type === Clutter.EventType.BUTTON_RELEASE) { this.finishDivider(); return Clutter.EVENT_STOP; }
        }
        if ((type === Clutter.EventType.BUTTON_PRESS || type === Clutter.EventType.TOUCH_BEGIN) && this.picker) {
            const [x, y] = event.get_coords();
            const actor = global.stage.get_actor_at_pos(Clutter.PickMode.ALL, x, y);
            if (!(this.pickerCards ?? []).some(card => actor === card || (actor && card.contains(actor)))) {
                this.clear('picker');
                return Clutter.EVENT_STOP;
            }
        }
        if (type === Clutter.EventType.BUTTON_PRESS && this.modal) {
            const [x, y] = event.get_coords(), actor = this.picker ?? this.bar;
            if (actor && (x < actor.x || x > actor.x + actor.width || y < actor.y || y > actor.y + actor.height)) this.cancel();
        }
        return Clutter.EVENT_PROPAGATE;
    }
    applyGroup(group, skipWindow = null) {
        const area = this.area(group.monitor);
        for (const d of group.dividers) {
            const b = d._snapBoundary;
            const position = group.tiles[b.after[0]][b.axis];
            if (b.axis === 0) d.x = area.x + area.width * position - 4;
            else d.y = area.y + area.height * position - 4;
        }
        for (const [index, w] of group.windows) if (w !== skipWindow) this.place(w, this.tileFrame(this.area(group.monitor), group.tiles[index]));
    }
    finishDivider() {
        this.dividerGrab?.dismiss(); this.dividerGrab = null;
        const group = this.dividerDrag?.group; this.dividerDrag = null;
        if (group && this.groups.has(group)) { this.buildDividers(group); this.validateLater(group); }
    }
    releaseConstraint(w, unmanaged = false) {
        const constraint = this.tileConstraints.get(w);
        if (!constraint) return;
        this.tileConstraints.delete(w);
        constraint.enabled = false;
        w.remove_external_constraint(constraint);
        if (constraint.square && !unmanaged && w.get_compositor_private()) w.unmaximize();
    }
    detach(w, unmanaged = false) {
        this.stopAnimation(w);
        const pending = this.pendingPlacements.get(w);
        if (pending) { GLib.source_remove(pending); this.sources.delete(pending); this.pendingPlacements.delete(w); }
        for (const group of [...this.groups]) {
            if (![...group.windows.values()].includes(w)) continue;
            for (const [slot, member] of group.windows) if (member === w) group.windows.delete(slot);
            for (const [object, id] of group.signals) if (object === w) object.disconnect(id);
            group.signals = group.signals.filter(([object]) => object !== w);
            if (!group.windows.size) this.removeGroup(group);
            else this.buildDividers(group);
        }
        this.releaseConstraint(w, unmanaged);
    }
    removeGroup(group) {
        if (!this.groups.delete(group)) return;
        if (this.nativeResize?.group === group) this.nativeResize = null;
        if (this.dividerDrag?.group === group) this.finishDivider();
        for (const [object, id] of group.signals) object.disconnect(id);
        for (const w of group.windows.values()) this.releaseConstraint(w);
        for (const d of group.dividers) d.destroy();
        if (group.validation) { GLib.source_remove(group.validation); this.sources.delete(group.validation); }
        this.clear('picker');
    }
    destroy() {
        this.destroying = true;
        this.switcher?.destroy(); this.switcher = null;
        for (const actor of [...this.retiringActors]) { actor.remove_all_transitions(); if (this.retiringActors.delete(actor)) actor.destroy(); }
        this.finishDivider(); this.reset();
        for (const id of this.animationLaters) global.compositor.get_laters().remove(id);
        this.animationLaters.clear();
        for (const w of this.animations.keys()) this.stopAnimation(w);
        for (const id of this.sources) GLib.source_remove(id);
        this.sources.clear();
        for (const [object, id] of this.signals) object.disconnect(id);
        for (const key of ['layout-shortcut', 'left', 'right', 'up', 'down']) Main.wm.removeKeybinding(`desktop-snap-${key}`);
        if (this.nativeTiling && !this.native.get_boolean('edge-tiling')) this.native.set_boolean('edge-tiling', true);
        clearStyleSettings();
        clearNativeBridge();
        this.nativeBridge = null;
    }
}
