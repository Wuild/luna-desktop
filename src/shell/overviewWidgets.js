import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const WidgetPreviewLayer = GObject.registerClass(class WidgetPreviewLayer extends Clutter.Actor {
    _init(monitorIndex) {
        super._init({reactive: false, x_expand: true, y_expand: true, clip_to_allocation: true});
        this.monitorIndex = monitorIndex;
        this.clones = new Map();
    }
    vfunc_get_preferred_width() { return [0, 0]; }
    vfunc_get_preferred_height() { return [0, 0]; }
    vfunc_allocate(box) {
        this.set_allocation(box);
        const work = Main.layoutManager.getWorkAreaForMonitor(this.monitorIndex);
        if (!work?.width) return;
        const sx = box.get_width() / work.width, sy = box.get_height() / work.height;
        for (const [window, clone] of this.clones) {
            const frame = window.get_frame_rect();
            const x = (frame.x - work.x) * sx, y = (frame.y - work.y) * sy;
            clone.allocate(new Clutter.ActorBox({x1: x, y1: y, x2: x + frame.width * sx, y2: y + frame.height * sy}));
        }
    }
});

export class OverviewWidgets {
    constructor(windows) {
        this.windows = windows;
        this.layers = new Map();
        this.signals = [];
        const connect = (object, signal, callback) => this.signals.push([object, object.connect(signal, callback)]);
        for (const signal of ['showing', 'shown']) connect(Main.overview, signal, () => this.queue());
        connect(Main.overview, 'hidden', () => this.stop());
        connect(global.workspace_manager, 'notify::n-workspaces', () => this.queue());
        connect(Main.layoutManager, 'monitors-changed', () => this.queue());
        if (Main.overview.visible) this.queue();
    }
    queue() {
        if (!Main.overview.visible || this.idle) return;
        this.idle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this.idle = 0; this.sync(); return GLib.SOURCE_REMOVE;
        });
    }
    sync() {
        const visit = actor => {
            const background = actor._background;
            if (background?._bin && Number.isInteger(actor.monitorIndex) && !this.layers.has(actor)) {
                const layer = new WidgetPreviewLayer(actor.monitorIndex);
                background._bin.add_child(layer);
                const record = {layer, clones: layer.clones};
                this.layers.set(actor, record);
                record.destroyId = actor.connect('destroy', () => this.layers.delete(actor));
            }
            for (const child of actor.get_children()) visit(child);
        };
        visit(Main.layoutManager.overviewGroup);
        const windows = this.windows().filter(window => window.get_title()?.startsWith('Luna Desktop:'));
        for (const [workspace, {layer, clones}] of this.layers) {
            const matching = windows.filter(window => window.get_monitor() === workspace.monitorIndex);
            for (const [window, clone] of clones) if (!matching.includes(window)) { clone.destroy(); clones.delete(window); }
            for (const window of matching) {
                const source = window.get_compositor_private();
                if (!source) continue;
                if (!clones.has(window)) { const clone = new Clutter.Clone({source, reactive: false}); layer.add_child(clone); clones.set(window, clone); }
            }
            layer.queue_relayout();
        }
    }
    stop() {
        if (this.idle) GLib.Source.remove(this.idle);
        this.idle = 0;
        for (const [actor, {layer, destroyId}] of this.layers) { actor.disconnect(destroyId); layer.destroy(); }
        this.layers.clear();
    }
    destroy() { this.stop(); for (const [object, id] of this.signals) object.disconnect(id); }
}
