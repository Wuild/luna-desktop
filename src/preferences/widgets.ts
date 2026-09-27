import {_} from '../i18n.js';
import Adw from 'gi://Adw';
import type {PreferenceContext} from './controls.js';

export function populate(context: PreferenceContext, desktopWidgets: Adw.PreferencesPage): void {
    const {group, toggle, spin} = context;
    const widgets = group(desktopWidgets, _('Widgets'), _('Right-click the desktop and choose Edit Desktop to add and arrange widgets.'));
    toggle(widgets, 'desktop-widgets-enabled', _('Show desktop widgets'));
    const placement = group(desktopWidgets, _('Placement'));
    toggle(placement, 'desktop-widget-snap-enabled', _('Snap widgets into alignment'), _('Align widget edges and centers with nearby widgets and the screen'));
    spin(placement, 'desktop-widget-edge-spacing', _('Screen-edge spacing'), _('Minimum gap in logical pixels; 0 allows widgets against the edge'));
    spin(placement, 'desktop-widget-snap-distance', _('Snapping distance'), _('Logical pixels'), 'desktop-widget-snap-enabled');
}
