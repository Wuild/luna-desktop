import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import LunaTiling from 'gi://LunaTiling?version=1.0';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
const Constraint = GObject.registerClass({Implements: [Meta.ExternalConstraint]}, class Constraint extends GObject.Object {
    vfunc_constrain(_window, info) {
        if (this.rect) LunaTiling.constrain(info, ...this.rect);
        return true;
    }
});
function assert(value, message) { if (!value) throw new Error(message); }
export async function run() {
    await Scripting.sleep(1800);
    Main.overview.hide();
    const extension = Main.extensionManager.lookup('luna-desktop@wuild');
    extension.stateObj.snapping.reset();
    const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.NONE});
    launcher.set_environ(global.create_app_launch_context(0, -1).get_environment());
    launcher.setenv('GDK_BACKEND', 'wayland', true);
    const process = launcher.spawnv(['gjs', '-m', `${GLib.getenv('LUNA_TEST_ROOT')}/tests/snap-windows.js`]);
    let w, constraint;
    try {
        for (let i = 0; i < 40; i++) {
            w = global.get_window_actors().map(a => a.meta_window).find(w => w.get_title()?.startsWith('Snap test'));
            if (w) break;
            await Scripting.sleep(100);
        }
        assert(w, 'Test window mapped');
        await Scripting.sleep(700);
        constraint = new Constraint();
        constraint.rect = [100, 100, 500, 400];
        w.add_external_constraint(constraint);
        w.maximize();
        await Scripting.sleep(500);
        let rect = w.get_frame_rect();
        print(`NATIVE_TILE max=${w.is_maximized()} x=${rect.x} y=${rect.y} width=${rect.width} height=${rect.height}`);
        assert(w.is_maximized() && rect.x === 100 && rect.y === 100 && rect.width === 500 && rect.height === 400, 'Maximized state within tile');
        constraint.rect = [120, 100, 700, 500];
        w.move_resize_frame(false, 120, 100, 700, 500);
        await Scripting.sleep(400);
        rect = w.get_frame_rect();
        assert(rect.width === 700 && rect.height === 500 && w.is_maximized(), 'Constrained maximized window follows resized grid');
        w.remove_external_constraint(constraint); constraint = null;
        w.unmaximize();
        await Scripting.sleep(400);
        assert(!w.is_maximized(), 'Unsnap restores normal client state');
        print('LUNA_NATIVE_TILING_PASS');
    } finally {
        if (constraint && w) w.remove_external_constraint(constraint);
        process.force_exit(); launcher.close();
    }
}
