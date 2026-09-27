import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';

export function followAppearance() {
    const settings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
    const sync = () => {
        const scheme = settings.get_string('color-scheme');
        Adw.StyleManager.get_default().color_scheme = scheme === 'prefer-dark' ? Adw.ColorScheme.FORCE_DARK :
            scheme === 'prefer-light' ? Adw.ColorScheme.FORCE_LIGHT : Adw.ColorScheme.DEFAULT;
    };
    sync();
    const id = settings.connect('changed::color-scheme', sync);
    return () => settings.disconnect(id);
}
