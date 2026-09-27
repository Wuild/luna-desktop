import {bindSwitcherSurface} from './switcherSurface.js';
import {switcherLayout, adjacentRow} from './switcherLayout.js';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import {windowPreviewCard, previewButtonStyle, watchStyle} from './windowPreviewCard.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as SwitcherPopup from 'resource:///org/gnome/shell/ui/switcherPopup.js';

const bindings = ['switch-applications', 'switch-applications-backward', 'switch-windows', 'switch-windows-backward'];

const LunaSwitcherGrid = GObject.registerClass({
    Signals: {
        'item-activated': {param_types: [GObject.TYPE_INT]},
        'item-entered': {param_types: [GObject.TYPE_INT]},
        'item-removed': {param_types: [GObject.TYPE_INT]},
    },
}, class LunaSwitcherGrid extends St.ScrollView {
    _init(layout) {
        super._init({width: layout.panelWidth, hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC,
            style: `padding: ${layout.padding / 2}px;`});
        this.layout = layout;
        this.buttons = [];
        this.rows = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL});
        this.set_child(this.rows);
    }
    addItem(card, label) {
        const index = this.buttons.length;
        if (this.layout.rows.some(row => row.indices[0] === index)) {
            this.row = new St.BoxLayout({x_align: Clutter.ActorAlign.CENTER});
            this.rows.add_child(this.row);
        }
        const button = new St.Button({reactive: true, track_hover: true, can_focus: true, child: card, label_actor: label,
            style: previewButtonStyle(false, this.layout.spacing / 2)});
        button.connect('clicked', () => this.emit('item-activated', index));
        button.connect('motion-event', () => { this.emit('item-entered', index); return Clutter.EVENT_PROPAGATE; });
        this.row.add_child(button);
        this.buttons.push(button);
        return button;
    }
    highlight(index) {
        for (let i = 0; i < this.buttons.length; i++) this.buttons[i].set_style(previewButtonStyle(i === index, this.layout.spacing / 2));
        const button = this.buttons[index];
        if (!button?.has_allocation()) return;
        const row = button.get_parent();
        const top = row.y, bottom = top + row.height;
        const adjustment = this.vadjustment;
        const visible = adjustment.page_size;
        if (top < adjustment.value) adjustment.value = top;
        else if (bottom > adjustment.value + visible) adjustment.value = bottom - visible;
    }
});

// Luna owns the entries, previews and activation. Shell's popup base supplies
// modifier-release handling, accessible buttons, scrolling and modal cleanup.
const LunaSwitcherPopup = GObject.registerClass(class LunaSwitcherPopup extends SwitcherPopup.SwitcherPopup {
    _init(owner, entries) {
        super._init(entries);
        this.owner = owner;
        this.monitor = Main.layoutManager.currentMonitor ?? Main.layoutManager.primaryMonitor;
        this.backdrop = new St.Widget();
        this.blur = bindSwitcherSurface(owner.snapping.settings, this.backdrop);
        this.add_child(this.backdrop);
        watchStyle(this, () => this.updateAppearance());
        owner.snapping.settings.raw.connectObject('changed', (_settings, key) => {
            if (!key.startsWith('desktop-switcher-')) return;
            this.updateAppearance();
            if (['desktop-switcher-padding', 'desktop-switcher-card-spacing', 'desktop-switcher-width-percent'].includes(key)) this.queueRefresh();
        }, this);
        this.refreshSource = 0;
        this.watchedWindows = new Set();
        this.rebuild(entries);
        this.connect('destroy', () => {
            if (this.refreshSource) GLib.source_remove(this.refreshSource);
            this.refreshSource = 0;
            for (const window of this.watchedWindows) window.disconnectObject(this);
            this.watchedWindows.clear();
        });
    }
    updateAppearance() {
        if (this.buttons?.length) this._switcherList.highlight(this._selectedIndex);
    }
    rebuild(entries) {
        const selected = this._items[this._selectedIndex];
        const previousIndex = this._selectedIndex;
        const previousOrder = this._items;
        entries.sort((a, b) => {
            const rank = entry => {
                const index = previousOrder.findIndex(old => entry.window ? old.window === entry.window : old.group === entry.group);
                return index < 0 ? previousOrder.length : index;
            };
            return rank(a) - rank(b);
        });
        const replacing = !!this._switcherList;
        this._switcherList?.destroy();
        for (const window of this.watchedWindows) window.disconnectObject(this);
        this.watchedWindows.clear();
        this._items = entries;
        const maxWidth = Math.floor(this.monitor.width * this.owner.snapping.settings.get_int('desktop-switcher-width-percent') / 100);
        const aspects = entries.map(entry => {
            const rect = entry.group ? this.owner.snapping.area(entry.group.monitor) : entry.window.get_buffer_rect();
            return rect.width / Math.max(1, rect.height);
        });
        this.layout = switcherLayout(aspects, maxWidth, 180, 180, {padding: this.owner.snapping.settings.get_int('desktop-switcher-padding'), spacing: this.owner.snapping.settings.get_int('desktop-switcher-card-spacing')});
        this.panelWidth = this.layout.panelWidth;
        this._switcherList = new LunaSwitcherGrid(this.layout);
        this.buttons = [];
        for (const [entryIndex, entry] of entries.entries()) {
            const cardWidth = this.layout.widths[entryIndex];
            const previewHeight = this.layout.previewHeight;
            const preview = new St.Widget({width: cardWidth, height: previewHeight, clip_to_allocation: true});
            const canvasHeight = entry.group ? Math.min(previewHeight, cardWidth / aspects[entryIndex]) : previewHeight;
            const canvasWidth = entry.group ? canvasHeight * aspects[entryIndex] : cardWidth;
            const offsetX = (cardWidth - canvasWidth) / 2, offsetY = (previewHeight - canvasHeight) / 2;
            const members = entry.group ? [...entry.group.windows] : [[0, entry.window]];
            for (const [index, window] of members) {
                const tile = entry.group ? entry.group.tiles[index] : [0, 0, 1, 1];
                const width = Math.max(1, Math.round(tile[2] * canvasWidth) - 4);
                const height = Math.max(1, Math.round(tile[3] * canvasHeight) - 4);
                const cell = new St.Widget({x: offsetX + Math.round(tile[0] * canvasWidth) + 2, y: offsetY + Math.round(tile[1] * canvasHeight) + 2,
                    width, height, clip_to_allocation: true, style: 'background-color: rgba(255,255,255,0.08); border-radius: 2px;'});
                const source = window.get_compositor_private();
                const rect = window.get_buffer_rect();
                if (source && rect.width > 0 && rect.height > 0) {
                    const scale = Math.min(width / rect.width, height / rect.height);
                    cell.add_child(new Clutter.Clone({source, width: rect.width * scale, height: rect.height * scale,
                        x: (width - rect.width * scale) / 2, y: (height - rect.height * scale) / 2}));
                } else {
                    const iconSize = Math.min(48, width, height);
                    const icon = Shell.WindowTracker.get_default().get_window_app(window)?.create_icon_texture(iconSize);
                    if (icon) { icon.set_position((width - iconSize) / 2, (height - iconSize) / 2); cell.add_child(icon); }
                }
                preview.add_child(cell);
            }

            const {card, label, title, header} = windowPreviewCard(members[0][1], preview, cardWidth, entry.group ? members.length : 0);
            const button = this._switcherList.addItem(card, label);
            if (!entry.group && entry.window.can_close()) {
                const close = new St.Button({child: new St.Icon({icon_name: 'window-close-symbolic', icon_size: 16}),
                    width: 20, height: 20, opacity: 0, reactive: false, can_focus: false,
                    accessible_name: `Close ${title}`, style: 'padding: 0; border-radius: 3px;'});
                header.add_child(close);
                button._closeButton = close;
                button.connect('notify::hover', () => {
                    close.reactive = button.hover;
                    close.ease({opacity: button.hover ? 255 : 0, duration: St.Settings.get().enable_animations ? 100 : 0});
                });
                close.connect('clicked', () => {
                    if (entry.window.get_compositor_private()) entry.window.delete(global.get_current_time());
                    if (!this._modifierMask) this._resetNoModsTimeout();
                });
            }
            this.buttons.push(button);
            button.accessible_name = entry.group ? `${title}: ${members.map(([, w]) => w.get_title()).join(', ')}` : title;
        }
        for (const window of new Set(entries.flatMap(e => e.group ? [...e.group.windows.values()] : [e.window]))) {
            this.watchedWindows.add(window);
            window.connectObject('unmanaged', () => this.queueRefresh(), 'workspace-changed', () => this.queueRefresh(), this);
        }
        if (replacing) {
            this.add_child(this._switcherList);
            this._switcherList.connect('item-activated', this._itemActivated.bind(this));
            this._switcherList.connect('item-entered', this._itemEntered.bind(this));
            this._switcherList.connect('item-removed', this._itemRemoved.bind(this));
            const index = entries.findIndex(entry => selected?.window ? entry.window === selected.window : selected?.group && entry.group === selected.group);
            this._select(index >= 0 ? index : Math.min(previousIndex, entries.length - 1));
            this.queue_relayout();
        }
    }
    queueRefresh() {
        if (this.refreshSource) return;
        this.refreshSource = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this.refreshSource = 0;
            const entries = this.owner.entries();
            if (!entries.length) this.fadeAndDestroy();
            else this.rebuild(entries);
            return GLib.SOURCE_REMOVE;
        });
    }
    vfunc_allocate(box) {
        this.set_allocation(box);
        const monitor = this.monitor;
        const [, naturalHeight] = this._switcherList.rows.get_preferred_height(this.panelWidth - this.layout.padding);
        const height = Math.min(naturalHeight + this.layout.padding, Math.floor(monitor.height * 0.75));
        const x = monitor.x + Math.round((monitor.width - this.panelWidth) / 2);
        const y = monitor.y + Math.round((monitor.height - height) / 2);
        const panelBox = new Clutter.ActorBox({x1: x, x2: x + this.panelWidth, y1: y, y2: y + height});
        this.backdrop.allocate(panelBox);
        this._switcherList.allocate(panelBox);
    }
    _initialSelection(backward) {
        const focus = global.display.focus_window;
        const current = entry => entry.window === focus || entry.group && [...entry.group.windows.values()].includes(focus);
        const order = this._items.map((_item, index) => index);
        if (backward) order.reverse();
        this._select(order.find(index => !current(this._items[index])) ?? 0);
    }
    _keyPressHandler(keysym, action) {
        if ([Meta.KeyBindingAction.SWITCH_WINDOWS, Meta.KeyBindingAction.SWITCH_APPLICATIONS].includes(action) || keysym === Clutter.KEY_Right)
            this._select(this._next());
        else if ([Meta.KeyBindingAction.SWITCH_WINDOWS_BACKWARD, Meta.KeyBindingAction.SWITCH_APPLICATIONS_BACKWARD].includes(action) || keysym === Clutter.KEY_Left)
            this._select(this._previous());
        else if (keysym === Clutter.KEY_Down)
            this._select(adjacentRow(this.layout, this._selectedIndex, 1));
        else if (keysym === Clutter.KEY_Up)
            this._select(adjacentRow(this.layout, this._selectedIndex, -1));
        else return Clutter.EVENT_PROPAGATE;
        return Clutter.EVENT_STOP;
    }
    _showImmediately() {
        const pending = this._initialDelayTimeoutId !== 0;
        super._showImmediately();
        if (pending && St.Settings.get().enable_animations) {
            this.opacity = 0;
            this.ease({opacity: 255, duration: 120, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        }
    }
    _finish(timestamp) {
        const entry = this._items[this._selectedIndex];
        this._popModal();
        this.owner.activate(entry);
        super._finish(timestamp);
    }
});

export class SnapSwitcher {
    constructor(snapping) {
        this.snapping = snapping;
        this.popup = null;
        this.workspaceSettings = new Gio.Settings({schema_id: 'org.gnome.shell.window-switcher'});
        for (const name of bindings)
            Main.wm.setCustomKeybindingHandler(name, Shell.ActionMode.NORMAL, (...args) => this.open(args.at(-1)));
    }
    entries() {
        const workspace = this.workspaceSettings.get_boolean('current-workspace-only') ? global.workspace_manager.get_active_workspace() : null;
        const windows = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, workspace)
            .map(w => w.is_attached_dialog() ? w.get_transient_for() : w)
            .filter((w, i, list) => w && !w.skip_taskbar && list.indexOf(w) === i);
        const eligibleGroups = [...this.snapping.groups].filter(group => group.windows.size > 1 &&
            [...group.windows.values()].every(w => windows.includes(w) && w.get_compositor_private()));
        const shown = new Set();
        const entries = [];
        for (const window of windows) {
            entries.push({window});
            const group = eligibleGroups.find(g => [...g.windows.values()].includes(window));
            if (group && !shown.has(group)) { entries.push({group}); shown.add(group); }
        }
        return entries;
    }
    open(binding) {
        this.popup?.destroy();
        this.snapping.cancel();
        Main.wm._workspaceSwitcherPopup?.destroy();
        const popup = new LunaSwitcherPopup(this, this.entries());
        this.popup = popup;
        popup.connect('destroy', () => { if (this.popup === popup) this.popup = null; });
        if (!popup.show(binding.is_reversed(), binding.get_name(), binding.get_mask())) popup.destroy();
    }
    activate(entry) {
        if (!entry) return;
        if (entry.window) {
            if (entry.window.get_compositor_private()) Main.activateWindow(entry.window);
            return;
        }
        const group = entry.group;
        if (!this.snapping.groups.has(group)) return;
        const windows = [...group.windows.values()].filter(w => w.get_compositor_private());
        if (!windows.length) return;
        const recent = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null).find(w => windows.includes(w)) ?? windows[0];
        for (const window of windows) { window.unminimize(); window.raise(); }
        this.snapping.applyGroup(group);
        Main.activateWindow(recent);
        this.snapping.updateDividers();
    }
    destroy() {
        this.popup?.destroy();
        for (const name of bindings)
            Main.wm.setCustomKeybindingHandler(name, Shell.ActionMode.NORMAL, Main.wm._startSwitcher.bind(Main.wm));
    }
}
