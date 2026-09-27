import {_} from '../i18n.js';
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export function menu(parent, x, y, entries) {
    const model = new Gio.Menu(), group = new Gio.SimpleActionGroup();
    let index = 0;
    const fill = (target, rows) => {
        let section = new Gio.Menu();
        const flush = () => { if (section.get_n_items()) target.append_section(null, section); section = new Gio.Menu(); };
        for (const row of rows) {
            if (!row) { flush(); continue; }
            const [label, callback, enabled = true] = row;
            if (Array.isArray(callback)) {
                const submenu = new Gio.Menu(); fill(submenu, callback); section.append_submenu(_(label), submenu); continue;
            }
            const name = `item${index++}`;
            const action = new Gio.SimpleAction({name, enabled});
            action.connect('activate', () => { popup.popdown(); callback(); });
            group.add_action(action); section.append(_(label), `desktop.${name}`);
        }
        flush();
    };
    fill(model, entries);
    const popup = Gtk.PopoverMenu.new_from_model(model);
    popup.has_arrow = false;
    popup.insert_action_group('desktop', group);
    popup.set_parent(parent);
    popup.set_pointing_to(new Gdk.Rectangle({x: Math.round(x), y: Math.round(y), width: 1, height: 1}));
    const root = parent.get_root();
    if (root) root._desktopMenuOpen = true;
    popup.connect('closed', () => {
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            if (root) root._desktopMenuOpen = false;
            if (popup.get_parent()) popup.unparent();
            return GLib.SOURCE_REMOVE;
        });
    });
    popup.popup();
    return popup;
}
export function copyItems(items, cut = false) {
    const uris = items.filter(item => !item.special).map(item => item.file.get_uri());
    if (!uris.length) return;
    const provider = (mime, data) => Gdk.ContentProvider.new_for_bytes(mime, new GLib.Bytes(new TextEncoder().encode(data)));
    Gdk.Display.get_default().get_clipboard().set_content(Gdk.ContentProvider.new_union([
        provider('x-special/gnome-copied-files', `${cut ? 'cut' : 'copy'}\n${uris.join('\n')}`),
        provider('text/uri-list', `${uris.join('\r\n')}\r\n`),
    ]));
}
export function canPaste() {
    const formats = Gdk.Display.get_default().get_clipboard().get_formats();
    return formats.contain_mime_type('x-special/gnome-copied-files') || formats.contain_mime_type('text/uri-list');
}
const asyncCall = (object, name, ...args) => new Promise((resolve, reject) => {
    object[`${name}_async`](...args, (source, result) => {
        try { resolve(source[`${name}_finish`](result)); } catch (e) { reject(e); }
    });
});
async function copyTree(source, target) {
    const info = await asyncCall(source, 'query_info', 'standard::type', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, GLib.PRIORITY_DEFAULT, null);
    if (info.get_file_type() !== Gio.FileType.DIRECTORY)
        return asyncCall(source, 'copy', target, Gio.FileCopyFlags.NOFOLLOW_SYMLINKS, GLib.PRIORITY_DEFAULT, null, null);
    await asyncCall(target, 'make_directory', GLib.PRIORITY_DEFAULT, null);
    const entries = await asyncCall(source, 'enumerate_children', 'standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, GLib.PRIORITY_DEFAULT, null);
    try {
        while (true) {
            const batch = await asyncCall(entries, 'next_files', 100, GLib.PRIORITY_DEFAULT, null);
            if (!batch.length) break;
            for (const entry of batch) await copyTree(source.get_child(entry.get_name()), target.get_child(entry.get_name()));
        }
    } finally { await asyncCall(entries, 'close', GLib.PRIORITY_DEFAULT, null); }
}
export async function pasteInto(directory) {
    const clipboard = Gdk.Display.get_default().get_clipboard();
    const [stream, mime] = await asyncCall(clipboard, 'read', ['x-special/gnome-copied-files', 'text/uri-list'], GLib.PRIORITY_DEFAULT, null);
    let data = '', length = 0;
    try {
        while (true) {
            const bytes = await asyncCall(stream, 'read_bytes', 8192, GLib.PRIORITY_DEFAULT, null);
            if (!bytes.get_size()) break;
            length += bytes.get_size();
            if (length > 1024 * 1024) throw new Error(_('Clipboard file list is too large'));
            data += new TextDecoder().decode(bytes.toArray());
        }
    } finally { stream.close(null); }
    const lines = data.trim().split(/\r?\n/);
    const cut = mime === 'x-special/gnome-copied-files' && lines.shift() === 'cut';
    const failures = [];
    for (const uri of lines.filter(line => line && !line.startsWith('#'))) {
        try {
            const source = Gio.File.new_for_uri(uri);
            if (!source.get_basename()) continue;
            if (directory.equal(source) || directory.has_prefix(source)) throw new Error(_('Cannot copy a folder into itself'));
            const target = directory.get_child(source.get_basename());
            // No overwrite flag: existing files are kept and conflicts reported.
            if (cut) await asyncCall(source, 'move', target, Gio.FileCopyFlags.NOFOLLOW_SYMLINKS, GLib.PRIORITY_DEFAULT, null, null);
            else await copyTree(source, target);
        } catch (e) { failures.push(e.message); }
    }
    if (cut && !failures.length) clipboard.set_content(null);
    if (failures.length) throw new Error(failures.join('\n'));
}
export function properties(items) {
    Gio.DBus.session.call('org.freedesktop.FileManager1', '/org/freedesktop/FileManager1',
        'org.freedesktop.FileManager1', 'ShowItemProperties',
        new GLib.Variant('(ass)', [items.map(item => item.file.get_uri()), '']), null,
        Gio.DBusCallFlags.NONE, -1, null, (_connection, result) => {
            try { Gio.DBus.session.call_finish(result); } catch (e) { console.error(e); }
        });
}
