import {_} from './i18n.js';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
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
        window.title = _('Desktop settings');
        const iconPage = new Adw.PreferencesPage({title: _('Desktop Icons'), icon_name: 'preferences-desktop-display-symbolic'});
        const layoutPage = new Adw.PreferencesPage({title: _('Layout'), icon_name: 'view-grid-symbolic'});
        const appearancePage = new Adw.PreferencesPage({title: _('Appearance'), icon_name: 'applications-graphics-symbolic'});
        icons(context, iconPage, layoutPage, appearancePage);
        for (const page of [iconPage, layoutPage, appearancePage]) navigation.add(page);
        const tilingPage = new Adw.PreferencesPage({title: _('Tiling'), icon_name: 'view-grid-symbolic'});
        const tiling = context.group(tilingPage, _('Window tiling'), _('Snap windows to edges and corners, then choose apps for the remaining tiles. Drag the shared divider to resize a group.'));
        context.toggle(tiling, 'desktop-snap-enabled', _('Enable window tiling'), _('Replaces GNOME edge tiling while enabled.'));
        context.toggle(tiling, 'desktop-snap-bar-enabled', _('Top layout bar'), _('Drag a window to the top of a monitor to reveal layouts.'));
        context.toggle(tiling, 'desktop-snap-assist-enabled', _('Suggest windows for empty tiles'));
        context.spin(tiling, 'desktop-snap-gap', _('Window spacing'), _('Logical pixels between windows and at the screen edges. Set to 0 for no gaps.'), 'desktop-snap-enabled');
        const nativeAvailable = Gio.File.new_for_path(`${this.path}/native/LunaTiling-1.0.typelib`).query_exists(null);
        const corners = context.toggle(tiling, 'desktop-snap-square-corners', _('Square corners while tiled (experimental)'),
            nativeAvailable ? _('Uses maximized appearance inside tiles. Some apps remember this and open new windows maximized. Off by default.') : _('Requires the optional native tiling helper.'));
        corners.sensitive = nativeAvailable;
        const shortcuts = context.group(tilingPage, _('Keyboard shortcuts'), _('Super+Z: layout chooser (Tab and Enter to choose). Super+Ctrl+Left/Right: half screen. Follow with Super+Ctrl+Up/Down for a corner. Escape dismisses the chooser.'));
        shortcuts.add(new Adw.ActionRow({title: _('Shared dividers'), subtitle: _('Hover between windows in the focused group to reveal a divider, then drag to resize the grid.')}));
        navigation.add(tilingPage);
        const switcherPage = new Adw.PreferencesPage({title: _('App switcher'), icon_name: 'focus-windows-symbolic'});
        const switcher = context.group(switcherPage, _('App switcher'), _('Switch between individual windows and snap groups in one view.'));
        context.toggle(switcher, 'desktop-snap-switcher-enabled', _('Luna Alt+Tab switcher'), _('Show windows and snap groups together. Selecting a group brings all its windows forward.'));
        context.spin(switcher, 'desktop-switcher-width-percent', _('Maximum panel width'), _('Percentage of the monitor width. Cards wrap into rows at this limit.'), 'desktop-snap-switcher-enabled');
        const switcherAppearance = context.group(switcherPage, _('Appearance'), _('Shared with the snap layout bar. Defaults match Luna Taskbar panels, menus and window previews.'));
        context.toggle(switcherAppearance, 'desktop-switcher-color-override', _('Override theme color'));
        context.color(switcherAppearance, 'desktop-switcher-color', _('Background color'), _('Switcher panel background'), 'desktop-switcher-color-override');
        context.toggle(switcherAppearance, 'desktop-switcher-transparency', _('Transparency and blur'), _('Turn off for an opaque panel.'));
        context.spin(switcherAppearance, 'desktop-switcher-blur-radius', _('Blur strength'), _('0 disables blur.'), 'desktop-switcher-transparency');
        context.spin(switcherAppearance, 'desktop-switcher-opacity', _('Opacity'), _('0% is transparent; 100% is opaque.'), 'desktop-switcher-transparency');
        context.spin(switcherAppearance, 'desktop-switcher-corner-radius', _('Corner radius'));
        context.spin(switcherAppearance, 'desktop-switcher-padding', _('Panel padding'));
        context.spin(switcherAppearance, 'desktop-switcher-card-spacing', _('Card spacing'));
        navigation.add(switcherPage);
        const widgetPage = new Adw.PreferencesPage({title: _('Widgets'), icon_name: 'view-grid-symbolic'});
        widgets(context, widgetPage); navigation.add(widgetPage);
    }
}
