import Adw from 'gi://Adw';
import type {PreferenceContext} from './controls.js';

export function populate(context: PreferenceContext, desktopWidgets: Adw.PreferencesPage): void {
    const {group, toggle, spin} = context;
    const widgets = group(desktopWidgets, 'Widgets', 'Right-click the desktop and choose Edit Desktop to add and arrange widgets.');
    toggle(widgets, 'desktop-widgets-enabled', 'Show desktop widgets');
    const placement = group(desktopWidgets, 'Placement');
    toggle(placement, 'desktop-widget-snap-enabled', 'Snap widgets into alignment', 'Align widget edges and centers with nearby widgets and the screen');
    spin(placement, 'desktop-widget-edge-spacing', 'Screen-edge spacing', 'Minimum gap in logical pixels; 0 allows widgets against the edge');
    spin(placement, 'desktop-widget-snap-distance', 'Snapping distance', 'Logical pixels', 'desktop-widget-snap-enabled');
}
