import Gio from 'gi://Gio';

export function wallpaperMenuEntries(getActivePath, onError) {
    if (!getActivePath()) return [];
    return [['Change wallpaper', () => {
        if (!getActivePath()) return;
        try {
            Gio.Subprocess.new(['gnome-extensions', 'prefs', 'luna-wallpaper@wuild'], Gio.SubprocessFlags.NONE);
        } catch (error) {
            onError(error.message);
        }
    }]];
}
