import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import type {PreferenceContext} from './controls.js';

export function populate(context: PreferenceContext, desktop: Adw.PreferencesPage, layout: Adw.PreferencesPage, appearance: Adw.PreferencesPage): void {
    const {settings, group, toggle, spin, combo, color} = context;
    const desktopBehavior = group(desktop, 'Desktop icons',
        'Choose what appears on your desktop.');
    toggle(desktopBehavior, 'desktop-icons-enabled', 'Enable desktop icons');
    toggle(desktopBehavior, 'desktop-show-home', 'Show Home');
    toggle(desktopBehavior, 'desktop-show-trash', 'Show Trash');
    toggle(desktopBehavior, 'desktop-show-hidden', 'Show hidden files');
    toggle(desktopBehavior, 'desktop-single-click', 'Single click to open', 'Otherwise, double click to open an item');
    combo(group(layout, 'Displays'), 'desktop-monitor-mode', 'Icon placement', ['primary', 'saved'],
        ['Primary display only', 'All displays'], 'New icons start on the primary display. Drag icons between displays to move them; positions are remembered');
    const desktopLayout = group(layout, 'Arrange icons');
    const drives = group(desktop, 'Drives');
    combo(desktopLayout, 'desktop-sort-order', 'Sort icons by', ['name', 'type', 'modified', 'size'], ['Name', 'Type', 'Last modified', 'Size'], 'Changing the sort order rearranges icons');
    toggle(desktopLayout, 'desktop-snap-to-grid', 'Snap icons to grid');
    toggle(desktopLayout, 'desktop-highlight-grid', 'Highlight drop targets');
    toggle(drives, 'desktop-show-external-drives', 'Show external drives', 'Mounted removable drives and external storage');
    toggle(drives, 'desktop-show-network-drives', 'Show network drives', 'Mounted network locations');
    toggle(drives, 'desktop-drives-opposite', 'Place new drives on the opposite side');
    const desktopAppearance = group(appearance, 'Icons and labels');
    spin(desktopAppearance, 'desktop-icon-size', 'Icon size');
    spin(desktopAppearance, 'desktop-label-size', 'Label size');
    spin(desktopAppearance, 'desktop-label-rows', 'Label height', 'Rows; longer names are shortened with an ellipsis');
    const groupSpacing = group(layout, 'Spacing', 'Fine-tune the space used by each icon.');
    spin(groupSpacing, 'desktop-button-width', 'Button width', 'All desktop buttons use the same width; icons must fit inside');
    spin(groupSpacing, 'desktop-button-padding', 'Button padding', 'Space inside each desktop button');
    spin(groupSpacing, 'desktop-grid-spacing', 'Button spacing', 'Space between desktop buttons on the grid');
    combo(desktopLayout, 'desktop-arrange-corner', 'Arrange from',
        ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
        ['Top left', 'Top right', 'Bottom left', 'Bottom right'], 'Starting corner for new icons and Arrange; existing positions stay where you put them');
    spin(desktopAppearance, 'desktop-corner-radius', 'Selection corner radius');
    toggle(desktopAppearance, 'desktop-label-shadow', 'Label shadow', 'Improve readability over wallpaper');
    toggle(desktopAppearance, 'desktop-label-color-override', 'Override label color');
    color(desktopAppearance, 'desktop-label-color', 'Label color', '', 'desktop-label-color-override');
    color(desktopAppearance, 'desktop-accent-color', 'Selection accent color');
    toggle(desktopBehavior, 'desktop-app-menu-enabled', 'Application menu shortcuts', 'Add or remove desktop shortcuts from GNOME application menus');
    const arrangeRow = new Adw.ActionRow({title: 'Arrange desktop icons', subtitle: 'Reset custom icon positions to a grid'});
    const arrangeButton = new Gtk.Button({label: 'Arrange', valign: Gtk.Align.CENTER});
    arrangeButton.connect('clicked', () => settings.set_string('desktop-icon-positions', '{}'));
    arrangeRow.add_suffix(arrangeButton); arrangeRow.activatable_widget = arrangeButton;
    desktopLayout.add(arrangeRow);
}
