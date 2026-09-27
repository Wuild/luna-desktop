import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import GLib from 'gi://GLib';

const GROUP = 'Desktop Entry';
const APP_ID = 'X-LunaDesktop-AppId';

// Prefer the installed application for Luna shortcuts; ordinary desktop files
// provide their own localized name, icon and launch command.
export function desktopLauncher(file) {
    if (!file.get_basename()?.endsWith('.desktop')) return null;
    try {
        const keyfile = new GLib.KeyFile();
        keyfile.load_from_file(file.get_path(), GLib.KeyFileFlags.NONE);
        if (keyfile.get_keys(GROUP)[0].includes(APP_ID)) {
            const installed = GioUnix.DesktopAppInfo.new(keyfile.get_string(GROUP, APP_ID));
            if (installed) return installed;
        }
        return GioUnix.DesktopAppInfo.new_from_filename(file.get_path());
    } catch { return null; }
}

export function desktopDirectory() {
    return Gio.File.new_for_path(GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP) || `${GLib.get_home_dir()}/Desktop`);
}

export function findDesktopLauncher(appInfo, directory = desktopDirectory()) {
    const id = appInfo?.get_id();
    if (!id) return null;
    let entries;
    try {
        entries = directory.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        let info;
        while ((info = entries.next_file(null))) {
            const file = directory.get_child(info.get_name());
            if (desktopLauncher(file)?.get_id() === id) return file;
        }
    } catch { /* A desktop directory may not exist yet. */ }
    finally { entries?.close(null); }
    return null;
}

export async function removeDesktopLauncher(appInfo, directory = desktopDirectory()) {
    const file = findDesktopLauncher(appInfo, directory);
    if (!file) return false;
    await new Promise((resolve, reject) => file.delete_async(GLib.PRIORITY_DEFAULT, null,
        (source, result) => { try { source.delete_finish(result); resolve(); } catch (e) { reject(e); } }));
    return true;
}

export async function addDesktopLauncher(appInfo, directory = null) {
    const filename = appInfo?.get_filename();
    const id = appInfo?.get_id();
    if (!filename || !id) throw new Error('This application has no installed launcher');
    directory ??= desktopDirectory();
    const existing = findDesktopLauncher(appInfo, directory);
    if (existing) return existing;
    try { directory.make_directory_with_parents(null); }
    catch (error) { if (!error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS)) throw error; }
    const keyfile = new GLib.KeyFile();
    keyfile.load_from_file(filename, GLib.KeyFileFlags.KEEP_TRANSLATIONS);
    keyfile.set_string(GROUP, APP_ID, id);
    const [contents] = keyfile.to_data();
    const stem = GLib.path_get_basename(id).replace(/\.desktop$/, '');
    for (let index = 0; index < 100; index++) {
        const file = directory.get_child(`${stem}${index ? `-${index + 1}` : ''}.desktop`);
        let stream;
        try {
            stream = await new Promise((resolve, reject) => file.create_async(Gio.FileCreateFlags.NONE, GLib.PRIORITY_DEFAULT, null,
                (source, result) => { try { resolve(source.create_finish(result)); } catch (e) { reject(e); } }));
        } catch (error) {
            if (!error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS)) throw error;
            if (desktopLauncher(file)?.get_id() === id) return file;
            continue;
        }
        try {
            stream.write_all(new TextEncoder().encode(contents), null);
        } catch (error) {
            stream.close(null);
            file.delete(null);
            throw error;
        }
        stream.close(null);
        file.set_attribute_uint32('unix::mode', 0o755, Gio.FileQueryInfoFlags.NONE, null);
        try { file.set_attribute_string('metadata::trusted', 'true', Gio.FileQueryInfoFlags.NONE, null); }
        catch { /* LunaDesktop resolves the installed app even without GVfs metadata. */ }
        return file;
    }
    throw new Error('Too many desktop files with this application name');
}
