import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
function assert(value, message) { if (!value) throw new Error(message); }
function surfaces() { return global.get_window_actors().map(a => a.meta_window).filter(w => w?.get_title()?.startsWith('Luna Desktop:')); }
async function waitForSurface() {
    for (let i = 0; i < 40 && !surfaces().length; i++) await Scripting.sleep(150);
    assert(surfaces().length === Main.layoutManager.monitors.length, 'Desktop surface for every monitor');
    for (const w of surfaces()) {
        assert(w.get_window_type() === Meta.WindowType.DESKTOP, 'Desktop window role');
        assert(w.skip_taskbar && w.is_on_all_workspaces(), 'Hidden from taskbar and on every workspace');
    }
}
export async function run() {
    await Scripting.sleep(1500);
    const extension = Main.extensionManager.lookup('luna-desktop@wuild');
    assert(extension?.state === 1, `Desktop enabled: ${extension?.error}`);
    assert(!Main.extensionManager.lookup('lunabar@wuild') && !Main.extensionManager.lookup('luna-taskbar@wuild'), 'Fully standalone');
    Main.overview.hide();
    await waitForSurface();
    const settings = extension.stateObj.settings;
    assert(settings.get_boolean('desktop-icons-enabled'), 'Icons enabled by default');
    settings.set_boolean('desktop-widgets-enabled', true);
    settings.set_strv('desktop-enabled-widgets', ['clock', 'sticky-note']);
    await Scripting.sleep(800);
    settings.set_boolean('desktop-icons-enabled', false);
    await Scripting.sleep(400);
    await waitForSurface();
    for (const test of ['productivity-widgets-smoke.js', 'widget-settings-smoke.js', 'desktop-prefs-smoke.js', 'desktop-api-smoke.js', 'widgets-smoke.js', 'sticky-rich-text.test.js']) {
        const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.NONE});
        launcher.set_environ(global.create_app_launch_context(0, -1).get_environment());
        for (const [key, value] of Object.entries({GDK_BACKEND: 'wayland', GSETTINGS_BACKEND: 'memory', GTK_A11Y: 'none', GI_TYPELIB_PATH: '/usr/lib64/gnome-shell/girepository-1.0', LD_LIBRARY_PATH: '/usr/lib64/gnome-shell'})) launcher.setenv(key, value, true);
        const process = launcher.spawnv(['gjs', '-m', `${GLib.getenv('LUNA_TEST_ROOT')}/tests/${test}`]);
        await new Promise((resolve, reject) => process.wait_check_async(null, (p, result) => {
            try { p.wait_check_finish(result); resolve(); } catch (error) { reject(error); }
        }));
        launcher.close();
    }
    extension.stateObj.disable();
    await Scripting.sleep(400);
    assert(surfaces().length === 0, 'Disable removes desktop process windows');
    extension.stateObj.enable();
    await waitForSurface();
    extension.stateObj.disable();
    print('LUNA_DESKTOP_SHELL_PASS');
}
