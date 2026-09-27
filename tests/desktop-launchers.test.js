import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {addDesktopLauncher, findDesktopLauncher, removeDesktopLauncher, desktopLauncher} from '../dist/desktop/launchers.js';
const loop = new GLib.MainLoop(null, false);
const directory = Gio.File.new_for_path(GLib.dir_make_tmp('luna-desktop-launchers-XXXXXX'));
let failure;
function assert(ok, message) { if (!ok) throw Error(message); }
(async () => {
    const app = Gio.AppInfo.get_all().find(info => info.get_filename?.() && info.get_id());
    assert(app, 'Installed application fixture is available');
    assert(findDesktopLauncher(app, directory) === null, 'New app has no shortcut');
    const collision = directory.get_child(GLib.path_get_basename(app.get_id()));
    collision.replace_contents('User file: leave unchanged', null, false, Gio.FileCreateFlags.NONE, null);
    const file = await addDesktopLauncher(app, directory);
    assert(!file.equal(collision), 'Existing files are not overwritten');
    assert(desktopLauncher(file)?.get_id() === app.get_id(), `Shortcut resolves installed app: ${app.get_id()}, ${file.get_path()}, ${new TextDecoder().decode(file.load_contents(null)[1]).slice(-400)}`);
    assert(findDesktopLauncher(app, directory).equal(file), 'Menu can detect the shortcut');
    assert((await addDesktopLauncher(app, directory)).equal(file), 'Adding twice does not duplicate shortcuts');
    assert(await removeDesktopLauncher(app, directory), 'Remove deletes shortcut');
    assert(!file.query_exists(null) && collision.query_exists(null), 'Only the app shortcut is removed');
    assert(findDesktopLauncher(app, directory) === null, 'Menu returns to Add after removal');
    assert(await removeDesktopLauncher(app, directory) === false, 'Already removed is harmless');
    const standard = directory.get_child('standard.desktop');
    standard.replace_contents('[Desktop Entry]\nType=Application\nName=Standard Launcher\nIcon=utilities-terminal\nExec=/bin/true\n',
        null, false, Gio.FileCreateFlags.NONE, null);
    const launcher = desktopLauncher(standard);
    assert(launcher?.get_display_name() === 'Standard Launcher', 'Standard launcher displays its application name');
    assert(launcher.get_icon()?.to_string() === 'utilities-terminal', 'Standard launcher displays its application icon');
    assert(launcher.launch([], null), 'Standard launcher executes its command');
    assert(desktopLauncher(collision) === null, 'Malformed desktop files remain ordinary files');
    const ordinary = directory.get_child('ordinary.txt');
    standard.copy(ordinary, Gio.FileCopyFlags.NONE, null, null);
    assert(desktopLauncher(ordinary) === null, 'Other file types are not treated as launchers');
    print('DESKTOP_LAUNCHERS_PASS');
})().catch(error => { failure = error; console.error(error); }).finally(() => {
    const entries = directory.enumerate_children('standard::name', 0, null);
    let entry; while ((entry = entries.next_file(null))) directory.get_child(entry.get_name()).delete(null);
    entries.close(null); directory.delete(null); loop.quit();
});
loop.run(); if (failure) throw failure;
