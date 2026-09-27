import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
const PATH = '/org/mpris/MediaPlayer2';
const PLAYER = 'org.mpris.MediaPlayer2.Player';
function unpack(value) {
    if (value instanceof GLib.Variant) return unpack(value.deep_unpack());
    if (Array.isArray(value)) return value.map(unpack);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, unpack(item)]));
    return value;
}
export function mediaClient(context) {
    const cancellable = new Gio.Cancellable();
    context.onDispose(() => cancellable.cancel());
    const call = (name, path, iface, method, args = null) => new Promise((resolve, reject) => {
        Gio.DBus.session.call(name, path, iface, method, args, null, Gio.DBusCallFlags.NONE, 2500, cancellable, (bus, result) => {
            try { resolve(unpack(bus.call_finish(result))); } catch (e) { reject(e); }
        });
    });
    return {
        async players() {
            const [names] = await call('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'ListNames');
            const results = await Promise.allSettled(names.filter(name => name.startsWith('org.mpris.MediaPlayer2.')).map(async name => {
                const [[player], [root], [pid]] = await Promise.all([
                    call(name, PATH, 'org.freedesktop.DBus.Properties', 'GetAll', new GLib.Variant('(s)', [PLAYER])),
                    call(name, PATH, 'org.freedesktop.DBus.Properties', 'GetAll', new GLib.Variant('(s)', ['org.mpris.MediaPlayer2'])),
                    call('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'GetConnectionUnixProcessID', new GLib.Variant('(s)', [name])).catch(() => [0]),
                ]);
                return {name, ...root, ...player, pid};
            }));
            return results.filter(result => result.status === 'fulfilled').map(result => result.value);
        },
        command(name, method) { return call(name, PATH, PLAYER, method); },
    };
}
export function choosePlayer(players, preferred = '', previous = '', excluded = '') {
    const match = preferred.trim().toLowerCase();
    const exclusions = String(excluded).split(/[,;\n]/).map(value => value.trim().toLowerCase()).filter(Boolean);
    const candidates = players.filter(player => {
        const identity = [player.name, player.Identity, player.DesktopEntry].filter(Boolean).join(' ').toLowerCase();
        return (!match || identity.includes(match)) && !exclusions.some(value => identity.includes(value));
    });
    return candidates.sort((a, b) => Number(b.PlaybackStatus === 'Playing') - Number(a.PlaybackStatus === 'Playing') ||
        Number(b.name === previous) - Number(a.name === previous) || a.name.localeCompare(b.name))[0] ?? null;
}
