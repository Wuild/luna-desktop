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
        window.title = 'Desktop settings';
        const iconPage = new Adw.PreferencesPage({title: 'Desktop Icons', icon_name: 'preferences-desktop-display-symbolic'});
        const layoutPage = new Adw.PreferencesPage({title: 'Layout', icon_name: 'view-grid-symbolic'});
        const appearancePage = new Adw.PreferencesPage({title: 'Appearance', icon_name: 'applications-graphics-symbolic'});
        icons(context, iconPage, layoutPage, appearancePage);
        for (const page of [iconPage, layoutPage, appearancePage]) navigation.add(page);
        const tilingPage = new Adw.PreferencesPage({title: 'Tiling', icon_name: 'view-grid-symbolic'});
        const tiling = context.group(tilingPage, 'Window tiling', 'Snap windows to edges and corners, then choose apps for the remaining tiles. Drag the shared divider to resize a group.');
        context.toggle(tiling, 'desktop-snap-enabled', 'Enable window tiling', 'Replaces GNOME edge tiling while enabled.');
        context.toggle(tiling, 'desktop-snap-bar-enabled', 'Top layout bar', 'Drag a window to the top of a monitor to reveal layouts.');
        context.toggle(tiling, 'desktop-snap-assist-enabled', 'Suggest windows for empty tiles');
        context.spin(tiling, 'desktop-snap-gap', 'Window spacing', 'Logical pixels between windows and at the screen edges. Set to 0 for no gaps.', 'desktop-snap-enabled');
        const nativeAvailable = Gio.File.new_for_path(`${this.path}/native/LunaTiling-1.0.typelib`).query_exists(null);
        const corners = context.toggle(tiling, 'desktop-snap-square-corners', 'Square corners while tiled (experimental)',
            nativeAvailable ? 'Uses maximized appearance inside tiles. Some apps remember this and open new windows maximized. Off by default.' : 'Requires the optional native tiling helper.');
        corners.sensitive = nativeAvailable;
        const shortcuts = context.group(tilingPage, 'Keyboard shortcuts', 'Super+Z: layout chooser (Tab and Enter to choose). Super+Ctrl+Left/Right: half screen. Follow with Super+Ctrl+Up/Down for a corner. Escape dismisses the chooser.');
        shortcuts.add(new Adw.ActionRow({title: 'Shared dividers', subtitle: 'Hover between windows in the focused group to reveal a divider, then drag to resize the grid.'}));
        navigation.add(tilingPage);
        const switcherPage = new Adw.PreferencesPage({title: 'App switcher', icon_name: 'focus-windows-symbolic'});
        const switcher = context.group(switcherPage, 'App switcher', 'Switch between individual windows and snap groups in one view.');
        context.toggle(switcher, 'desktop-snap-switcher-enabled', 'Luna Alt+Tab switcher', 'Show windows and snap groups together. Selecting a group brings all its windows forward.');
        context.spin(switcher, 'desktop-switcher-width-percent', 'Maximum panel width', 'Percentage of the monitor width. Cards wrap into rows at this limit.', 'desktop-snap-switcher-enabled');
        const switcherAppearance = context.group(switcherPage, 'Appearance', 'Shared with the snap layout bar. Defaults match Luna Taskbar panels, menus and window previews.');
        context.toggle(switcherAppearance, 'desktop-switcher-color-override', 'Override theme color');
        context.color(switcherAppearance, 'desktop-switcher-color', 'Background color', 'Switcher panel background', 'desktop-switcher-color-override');
        context.toggle(switcherAppearance, 'desktop-switcher-transparency', 'Transparency and blur', 'Turn off for an opaque panel.');
        context.spin(switcherAppearance, 'desktop-switcher-blur-radius', 'Blur strength', '0 disables blur.', 'desktop-switcher-transparency');
        context.spin(switcherAppearance, 'desktop-switcher-opacity', 'Opacity', '0% is transparent; 100% is opaque.', 'desktop-switcher-transparency');
        context.spin(switcherAppearance, 'desktop-switcher-corner-radius', 'Corner radius');
        context.spin(switcherAppearance, 'desktop-switcher-padding', 'Panel padding');
        context.spin(switcherAppearance, 'desktop-switcher-card-spacing', 'Card spacing');
        navigation.add(switcherPage);
        const widgetPage = new Adw.PreferencesPage({title: 'Widgets', icon_name: 'view-grid-symbolic'});
        widgets(context, widgetPage); navigation.add(widgetPage);
    }
}
