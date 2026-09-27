import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

Gio.resources_register(Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource'));
Adw.init();
const path = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_child('dist').get_path();
const {default: Preferences} = await import(`file://${path}/prefs.js`);
const metadata = JSON.parse(new TextDecoder().decode(Gio.File.new_for_path(`${path}/metadata.json`).load_contents(null)[1]));
Object.assign(metadata, {path, dir: Gio.File.new_for_path(path)});
const prefs = new Preferences(metadata);
const window = new Adw.PreferencesWindow();
await prefs.fillPreferencesWindow(window);
const navigation = window._settingsNavigation;
if (navigation.pages.length !== 6) throw new Error('Expected icons, layout, appearance, tiling, app switcher and widgets categories');
navigation.filter('snap');
if (!navigation.resultRows.length) throw new Error('Settings search missing snapping');
window.present();
const loop = new GLib.MainLoop(null, false);
GLib.timeout_add(GLib.PRIORITY_DEFAULT, 700, () => {
    window.close();
    print('LUNA_DESKTOP_PREFS_PASS');
    loop.quit();
    return GLib.SOURCE_REMOVE;
});
loop.run();
