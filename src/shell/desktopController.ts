import {OverviewWidgets} from './overviewWidgets.js';
import type {DesktopSettings} from '../settings/settings.js';
interface WorkArea {x: number; y: number; width: number; height: number;}
interface TaskbarProvider {runtime?: {getDesktopWorkArea?: (index: number, work: WorkArea) => WorkArea};}
interface MonitorGeometry {index: number; primary: boolean; id: string; x: number; y: number; width: number; height: number; wallpaperPath: string | null;}
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
const ACTIVE_EXTENSION_STATE = 1;

const OTHER_PROVIDERS = ['gtk4-ding@smedius.gitlab.com', 'ding@rastersoft.com', 'desktop-icons@csoriano'];

export class DesktopController {
    private readonly _windows = new Map<Meta.Window, number[]>();
    private readonly _pendingPositions = new Map<Meta.Window, number>();
    private readonly _positioning = new Set<Meta.Window>();
    private readonly _positioned = new WeakSet<Meta.Window>();
    private readonly _signals: Array<[{disconnect(id: number): void}, number]> = [];
    private readonly _file: Gio.File;
    private _layout: MonitorGeometry[] = [];
    private _lastGeometry = '';
    private _destroyed = false;
    private _notified = false;
    private _overviewWidgets: OverviewWidgets;
    private _process: Gio.Subprocess | null = null;
    private _client: Meta.WaylandClient | null = null;
    constructor(private readonly _extension: {path: string}, private readonly _settings: DesktopSettings) {
        this._file = Gio.File.new_for_path(GLib.build_filenamev([
            GLib.get_user_runtime_dir(), `luna-desktop-${GLib.uuid_string_random()}.json`]));
        this._overviewWidgets = new OverviewWidgets(() => [...this._windows.keys()]);
        for (const signal of ['showing', 'hidden'])
            this._watch(Main.overview, Main.overview.connect(signal, () => this._geometry(true)));
        this._watch(_settings, _settings.connect('changed::desktop-icons-enabled', () => this._sync()));
        this._watch(_settings, _settings.connect('changed::desktop-widgets-enabled', () => this._sync()));
        this._watch(Main.extensionManager, Main.extensionManager.connect('extension-state-changed', () => {
            this._sync();
            this._geometry(true);
        }));
        this._watch(Main.layoutManager, Main.layoutManager.connect( 'monitors-changed', () => this._geometry(true)));
        this._watch(global.display, global.display.connect( 'workareas-changed', () => this._geometry()));
        this._watch(global.display, global.display.connect( 'in-fullscreen-changed', () => this._geometry()));
        this._watch(global.display, global.display.connect( 'window-created', (_display, window) => this._manage(window)));
        this._watch(global.window_manager, global.window_manager.connect( 'map', (_wm, actor) => {
            if (actor.meta_window && this._windows.has(actor.meta_window)) this._queuePosition(actor.meta_window);
        }));
        this._sync();
    }
    private _watch(object: {disconnect(id: number): void}, id: number): void { this._signals.push([object, id]); }
    _sync() {
        const conflict = OTHER_PROVIDERS.some(uuid => Main.extensionManager.lookup(uuid)?.state === ACTIVE_EXTENSION_STATE);
        if (conflict) {
            this._stop();
            if (conflict && this._settings.get_boolean('desktop-icons-enabled') && !this._notified)
                Main.notify('Desktop icons', 'Turn off the other desktop-icons extension to use Luna - Desktop’s desktop icons.');
            this._notified = conflict;
            return;
        }
        this._notified = false;
        if (this._process) return;
        this._geometry();
        const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_MERGE});
        launcher.setenv('GDK_BACKEND', 'wayland', true);
        const args = ['gjs', '-m', `${this._extension.path}/desktop/app.js`, this._extension.path, this._file.get_path()!];
        try {
            this._client = Meta.WaylandClient.new_subprocess(global.context, launcher, args);
            const process = this._client.get_subprocess();
            this._process = process;
            process.communicate_utf8_async(null, null, (p, result) => {
                try {
                    const [, output] = p!.communicate_utf8_finish(result);
                    if (output?.trim()) console.log(`[Luna - Desktop] ${output.trim()}`);
                } catch (e) { console.error(e); }
                if (this._process !== process) return;
                this._process = this._client = null;
                if (!this._destroyed)
                    Main.notify('Desktop stopped', 'Toggle a desktop feature in settings to restart the desktop.');
            });
        } catch (e) {
            console.error(e);
            Main.notify('Desktop icons could not start', e instanceof Error ? e.message : String(e));
        } finally {
            launcher.close();
        }
    }
    _geometry(monitorsChanged = false) {
        if (this._destroyed) return;
        // Fullscreen work-area changes are temporary. Leave existing desktop
        // surfaces alone until fullscreen ends; actual monitor changes still
        // need to be handled so disconnected displays cannot strand widgets.
        if (!monitorsChanged && this._layout?.length &&
            Main.layoutManager.monitors.some(m => global.display.get_monitor_in_fullscreen(m.index))) return;
        const logical = global.backend.get_monitor_manager().get_logical_monitors() ?? [];
        const wallpaper = Main.extensionManager.lookup('luna-wallpaper@wuild');
        const wallpaperPath = wallpaper?.state === ACTIVE_EXTENSION_STATE ? wallpaper.path : null;
        this._layout = Main.layoutManager.monitors.map(monitor => {
            const taskbar = Main.extensionManager.lookup('luna-taskbar@wuild');
            const provider = taskbar?.state === ACTIVE_EXTENSION_STATE
                ? taskbar.stateObj as TaskbarProvider | undefined : undefined;
            const currentWork = Main.layoutManager.getWorkAreaForMonitor(monitor.index);
            const work = provider?.runtime?.getDesktopWorkArea?.(monitor.index, currentWork) ?? currentWork;
            return {overview: Main.overview.visible, wallpaperPath, index: monitor.index, primary: monitor.index === Main.layoutManager.primaryIndex,
                id: logical.find(m => m.get_number() === monitor.index)?.get_monitors()[0]?.get_connector() || String(monitor.index),
                x: work.x, y: work.y, width: work.width, height: work.height};
        });
        const json = JSON.stringify(this._layout);
        if (this._lastGeometry === json) return;
        this._lastGeometry = json;
        this._file.replace_contents(json, null, false, Gio.FileCreateFlags.PRIVATE, null);
        for (const window of this._windows.keys()) this._position(window);
    }
    _manage(window: Meta.Window) {
        if (!this._client?.owns_window(window)) return;
        const ids: number[] = [];
        this._windows.set(window, ids);
        this._overviewWidgets.queue();
        ids.push(window.connect('shown', () => this._queuePosition(window)));
        ids.push(window.connect('notify::title', () => this._position(window)));
        ids.push(window.connect('unmanaged', () => this._forget(window)));
        ids.push(window.connect('size-changed', () => this._position(window)));
        ids.push(window.connect('position-changed', () => this._position(window)));
        this._position(window);
        this._queuePosition(window);
    }
    private _queuePosition(window: Meta.Window): void {
        if (this._pendingPositions.has(window)) return;
        let attempts = 0;
        this._pendingPositions.set(window, GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
            if (!this._destroyed && this._windows.has(window) &&
                !(window.get_compositor_private() as Meta.WindowActor | null)?.mapped && ++attempts < 200)
                return GLib.SOURCE_CONTINUE;
            this._pendingPositions.delete(window);
            if (!this._destroyed && this._windows.has(window)) this._position(window);
            return GLib.SOURCE_REMOVE;
        }));
    }

    _position(window: Meta.Window) {
        if (this._positioning.has(window)) return;
        const match = /^Luna Desktop:(\d+)$/.exec(window.get_title() ?? '');
        if (!match) return; // File dialogs retain their ordinary window behavior.
        this._positioning.add(window);
        try {
            if (window.get_window_type() !== Meta.WindowType.DESKTOP) {
                window.set_type(Meta.WindowType.DESKTOP);
            }
            // Classify before mapping: Overview and the taskbar can enumerate
            // the surface before it has its first allocation. Only geometry
            // needs a mapped actor; desktop identity must not depend on it.
            if (!window.skip_taskbar) window.hide_from_window_list();
            if (!window.is_on_all_workspaces()) window.stick();
            const geometry = this._layout?.find(m => m.index === Number(match[1]));
            if (!geometry || !(window.get_compositor_private() as Meta.WindowActor | null)?.mapped || window.get_frame_rect().width <= 0) return;
            if (this._positioned.has(window) && global.display.get_monitor_in_fullscreen(geometry.index)) return;
            const frame = window.get_frame_rect();
            if (window.get_monitor() !== geometry.index) window.move_to_monitor(geometry.index);
            if (frame.x !== geometry.x || frame.y !== geometry.y || frame.width !== geometry.width || frame.height !== geometry.height)
                window.move_resize_frame(false, geometry.x, geometry.y, geometry.width, geometry.height);
            window.lower();
            this._positioned.add(window);
        } finally { this._positioning.delete(window); }
    }
    _forget(window: Meta.Window) {
        const pending = this._pendingPositions.get(window);
        if (pending) GLib.Source.remove(pending);
        this._pendingPositions.delete(window);
        for (const id of this._windows.get(window) ?? []) window.disconnect(id);
        this._windows.delete(window);
    }
    _stop() {
        const process = this._process;
        this._process = this._client = null;
        // Let GTK shutdown dispose widgets and terminate their audio children.
        process?.send_signal(15);
        for (const window of this._windows.keys()) this._forget(window);
    }
    destroy() {
        this._overviewWidgets.destroy();
        if (this._destroyed) return;
        this._destroyed = true;
        for (const [object, id] of this._signals) object.disconnect(id);
        this._stop();
        if (this._file.query_exists(null)) this._file.delete(null);
    }
}
