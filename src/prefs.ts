import Adw from 'gi://Adw';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {DesktopSettings} from './settings/settings.js';
import {SettingsNavigation} from './preferences/navigation.js';
import {createControls} from './preferences/controls.js';
import {populate as icons} from './preferences/icons.js';
import {populate as widgets} from './preferences/widgets.js';
export default class LunaDesktopPreferences extends ExtensionPreferences {
    override async fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
        const settings = new DesktopSettings(this.getSettings());
        const context = createControls(window, settings);
        const navigation = new SettingsNavigation(window);
        Object.assign(window, {_settingsNavigation: navigation});
        window.title = 'Desktop settings';
        const iconPage = new Adw.PreferencesPage({title: 'Desktop Icons', icon_name: 'preferences-desktop-display-symbolic'});
        const layoutPage = new Adw.PreferencesPage({title: 'Layout', icon_name: 'view-grid-symbolic'});
        const appearancePage = new Adw.PreferencesPage({title: 'Appearance', icon_name: 'applications-graphics-symbolic'});
        icons(context, iconPage, layoutPage, appearancePage);
        for (const page of [iconPage, layoutPage, appearancePage]) navigation.add(page);
        const widgetPage = new Adw.PreferencesPage({title: 'Widgets', icon_name: 'view-grid-symbolic'});
        widgets(context, widgetPage); navigation.add(widgetPage);
    }
}
