import type {DesktopSettings} from '../src/settings/settings.js';
export function check(settings: DesktopSettings): void {
    settings.set_boolean('desktop-icons-enabled', true);
    settings.set_string('desktop-sort-order', 'name');
    // @ts-expect-error Taskbar settings do not belong to Desktop.
    settings.set_int('taskbar-height', 48);
    // @ts-expect-error Wrong value type.
    settings.set_boolean('desktop-icon-size', true);
    // @ts-expect-error Unknown sort order.
    settings.set_string('desktop-sort-order', 'invalid');
}
