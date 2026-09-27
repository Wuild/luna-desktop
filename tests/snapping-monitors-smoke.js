import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
function assert(value, message) { if (!value) throw new Error(message); }
export async function run() {
    await Scripting.sleep(2000);
    Main.overview.hide();
    const extension = Main.extensionManager.lookup('luna-desktop@wuild');
    const controller = extension.stateObj.snapping;
    controller.native.set_boolean('workspaces-only-on-primary', true);
    assert(Main.layoutManager.monitors.length === 2, 'Two monitors available');
    const secondary = Main.layoutManager.monitors.find(m => m.index !== Main.layoutManager.primaryIndex);
    const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.NONE});
    launcher.set_environ(global.create_app_launch_context(0, -1).get_environment());
    launcher.setenv('GDK_BACKEND', 'wayland', true);
    const process = launcher.spawnv(['gjs', '-m', `${GLib.getenv('LUNA_TEST_ROOT')}/tests/snap-windows.js`]);
    try {
        await Scripting.sleep(1500);
        const w = global.get_window_actors().map(a => a.meta_window).find(w => w.get_title() === 'Snap test 0');
        assert(w, 'Test window available');
        w.move_to_monitor(secondary.index);
        w.move_resize_frame(false, secondary.x + 200, secondary.y + 200, 360, 240);
        w.activate(global.get_current_time());
        const pointer = Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        const move = async (x, y) => { pointer.notify_absolute_motion(GLib.get_monotonic_time(), x, y); await Scripting.sleep(300); };
        await move(secondary.x + 300, secondary.y + 210);
        Main.overview.hide();
        await Scripting.sleep(500);
        const r = w.get_frame_rect();
        assert(w.is_on_all_workspaces(), 'Secondary window implicitly belongs to all workspaces');
        assert(controller.eligible(w), 'Implicit workspace membership permits tiling');
        await move(r.x + 140, r.y + 15);
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
        await Scripting.sleep(150);
        await move(r.x + 180, r.y + 45);
        assert(controller.drag, 'Real titlebar drag starts on secondary monitor');
        assert(controller.drag.monitor === secondary.index, 'Drag uses secondary monitor');
        assert(controller.barHandle?.visible, 'Secondary monitor tab visible');
        await move(secondary.x + secondary.width / 2, secondary.y + 8);
        assert(controller.bar?.visible, 'Secondary monitor top layouts expand');
        const primary = Main.layoutManager.primaryMonitor;
        await move(primary.x + primary.width / 2, primary.y + 150);
        assert(controller.drag?.monitor === primary.index && controller.barHandle?.visible, 'Tab follows drag onto primary monitor');
        await move(secondary.x + 1, secondary.y + secondary.height / 2);
        assert(controller.preview?.visible && controller.drag.target, 'Secondary edge preview visible');
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
        await Scripting.sleep(500);
        assert([...controller.groups].some(g => g.monitor === secondary.index && [...g.windows.values()].includes(w)), 'Release snaps on secondary monitor');
        for (const monitor of [primary, secondary]) {
            controller.detach(w);
            w.move_to_monitor(monitor.index);
            w.maximize();
            await Scripting.sleep(500);
            const maximized = w.get_frame_rect();
            await move(maximized.x + 140, maximized.y + 15);
            pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
            await Scripting.sleep(150);
            await move(maximized.x + 220, maximized.y + 100);
            assert(controller.drag?.window === w, `Maximized drag starts on monitor ${monitor.index}`);
            // Adaptive taskbar struts can emit this as the window restores.
            global.display.emit('workareas-changed');
            await Scripting.sleep(300);
            assert(controller.drag?.window === w && controller.barHandle?.visible,
                `Work area update preserves maximized drag on monitor ${monitor.index}`);
            await move(monitor.x + monitor.width / 2, monitor.y + 8);
            assert(controller.bar?.visible, `Maximized drag expands layouts on monitor ${monitor.index}`);
            controller.drag.target = null;
            pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
            await Scripting.sleep(300);
        }
        console.log('LUNA_MONITORS_PASS');
    } finally { controller.cancel(); process.force_exit(); }
}
