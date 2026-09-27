import {_} from '../i18n.js';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import type {PreferenceContext} from './controls.js';

export function populate(context: PreferenceContext, desktop: Adw.PreferencesPage, layout: Adw.PreferencesPage, appearance: Adw.PreferencesPage): void {
    const {settings, group, toggle, spin, combo, color} = context;
    const desktopBehavior = group(desktop, _('Desktop icons'),
        _('Choose what appears on your desktop.'));
    toggle(desktopBehavior, 'desktop-icons-enabled', _('Enable desktop icons'));
    toggle(desktopBehavior, 'desktop-show-home', _('Show Home'));
    toggle(desktopBehavior, 'desktop-show-trash', _('Show Trash'));
    toggle(desktopBehavior, 'desktop-show-hidden', _('Show hidden files'));
    toggle(desktopBehavior, 'desktop-single-click', _('Single click to open'), _('Otherwise, double click to open an item'));
    combo(group(layout, _('Displays')), 'desktop-monitor-mode', _('Icon placement'), ['primary', 'saved'],
        [_('Primary display only'), _('All displays')], _('New icons start on the primary display. Drag icons between displays to move them; positions are remembered'));
    const desktopLayout = group(layout, _('Arrange icons'));
    const drives = group(desktop, _('Drives'));
    combo(desktopLayout, 'desktop-sort-order', _('Sort icons by'), ['name', 'type', 'modified', 'size'], [_('Name'), _('Type'), _('Last modified'), _('Size')], _('Changing the sort order rearranges icons'));
    toggle(desktopLayout, 'desktop-snap-to-grid', _('Snap icons to grid'));
    toggle(desktopLayout, 'desktop-highlight-grid', _('Highlight drop targets'));
    toggle(drives, 'desktop-show-external-drives', _('Show external drives'), _('Mounted removable drives and external storage'));
    toggle(drives, 'desktop-show-network-drives', _('Show network drives'), _('Mounted network locations'));
    toggle(drives, 'desktop-drives-opposite', _('Place new drives on the opposite side'));
    const desktopAppearance = group(appearance, _('Icons and labels'));
    spin(desktopAppearance, 'desktop-icon-size', _('Icon size'));
    spin(desktopAppearance, 'desktop-label-size', _('Label size'));
    spin(desktopAppearance, 'desktop-label-rows', _('Label height'), _('Rows; longer names are shortened with an ellipsis'));
    const groupSpacing = group(layout, _('Spacing'), _('Fine-tune the space used by each icon.'));
    spin(groupSpacing, 'desktop-button-width', _('Button width'), _('All desktop buttons use the same width; icons must fit inside'));
    spin(groupSpacing, 'desktop-button-padding', _('Button padding'), _('Space inside each desktop button'));
    spin(groupSpacing, 'desktop-grid-spacing', _('Button spacing'), _('Space between desktop buttons on the grid'));
    combo(desktopLayout, 'desktop-arrange-corner', _('Arrange from'),
        ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
        [_('Top left'), _('Top right'), _('Bottom left'), _('Bottom right')], _('Starting corner for new icons and Arrange; existing positions stay where you put them'));
    spin(desktopAppearance, 'desktop-corner-radius', _('Selection corner radius'));
    toggle(desktopAppearance, 'desktop-label-shadow', _('Label shadow'), _('Improve readability over wallpaper'));
    toggle(desktopAppearance, 'desktop-label-color-override', _('Override label color'));
    color(desktopAppearance, 'desktop-label-color', _('Label color'), '', 'desktop-label-color-override');
    color(desktopAppearance, 'desktop-accent-color', _('Selection accent color'));
    toggle(desktopBehavior, 'desktop-app-menu-enabled', _('Application menu shortcuts'), _('Add or remove desktop shortcuts from GNOME application menus'));
    const arrangeRow = new Adw.ActionRow({title: _('Arrange desktop icons'), subtitle: _('Reset custom icon positions to a grid')});
    const arrangeButton = new Gtk.Button({label: _('Arrange'), valign: Gtk.Align.CENTER});
    arrangeButton.connect('clicked', () => settings.set_string('desktop-icon-positions', '{}'));
    arrangeRow.add_suffix(arrangeButton); arrangeRow.activatable_widget = arrangeButton;
    desktopLayout.add(arrangeRow);
}
