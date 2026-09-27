import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {DesktopSettings} from './settings/settings.js';
import {DesktopController} from './shell/desktopController.js';
import {AppGridMenu} from './shell/appGridMenu.js';

export default class LunaDesktop extends Extension {
    private controller: DesktopController | null = null;
    private menu: AppGridMenu | null = null;
    private settings: DesktopSettings | null = null;
    private menuSignal = 0;
    override enable(): void {
        if (this.settings) return;
        const settings = new DesktopSettings(this.getSettings());
        this.settings = settings;
        try {
            this.controller = new DesktopController(this, settings);
            const syncMenu = (): void => {
                this.menu?.destroy(); this.menu = null;
                if (settings.get_boolean('desktop-app-menu-enabled')) this.menu = new AppGridMenu(settings);
            };
            this.menuSignal = settings.connect('changed::desktop-app-menu-enabled', syncMenu);
            syncMenu();
        } catch (error) { this.disable(); throw error; }
    }
    override disable(): void {
        if (this.menuSignal) this.settings?.disconnect(this.menuSignal);
        this.menuSignal = 0;
        this.menu?.destroy(); this.menu = null;
        this.controller?.destroy(); this.controller = null;
        this.settings = null;
    }
}
