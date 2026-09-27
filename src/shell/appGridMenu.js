import {_} from '../i18n.js';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import {AppIcon} from 'resource:///org/gnome/shell/ui/appDisplay.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {addDesktopLauncher, findDesktopLauncher, removeDesktopLauncher} from '../desktop/launchers.js';

export class AppGridMenu {
    constructor(settings) {
        this._items = new Set();
        this._injections = new InjectionManager();
        this._destroyed = false;
        const extension = this;
        this._injections.overrideMethod(AppIcon.prototype, 'popupMenu', original => function (...args) {
            const result = original.apply(this, args);
            if (!this._menu || !this.app?.get_app_info()?.get_filename()) return result;
            const app = this.app;
            const menu = this._menu;
            const existing = menu._lunaDesktopDesktopItem;
            if (existing) {
                existing.label.text = findDesktopLauncher(app.get_app_info()) ? _('Remove from Desktop') : _('Add to Desktop');
                return result;
            }
            const item = menu.addAction(findDesktopLauncher(app.get_app_info()) ? _('Remove from Desktop') : _('Add to Desktop'), async () => {
                item.setSensitive(false);
                try {
                    const removing = !!findDesktopLauncher(app.get_app_info());
                    if (removing) await removeDesktopLauncher(app.get_app_info());
                    else await addDesktopLauncher(app.get_app_info());
                    if (!extension._destroyed) {
                        if (!removing) settings.set_boolean('desktop-icons-enabled', true);
                        Main.notify(removing ? _('Removed from Desktop') : _('Added to Desktop'), app.get_name());
                    }
                } catch (error) {
                    if (!extension._destroyed) Main.notify(_('Could not update desktop shortcut'), error.message);
                } finally {
                    if (extension._items.has(item)) item.setSensitive(true);
                }
            });
            menu._lunaDesktopDesktopItem = item;
            extension._items.add(item);
            item.connect('destroy', () => {
                extension._items.delete(item);
                delete menu._lunaDesktopDesktopItem;
            });
            return result;
        });
    }

    destroy() {
        this._destroyed = true;
        this._injections.clear();
        for (const item of [...this._items]) item.destroy();
        this._items.clear();
    }
}
