import Gtk from 'gi://Gtk?version=4.0';
import GLib from 'gi://GLib';

// A sibling of the card: controls never cover or resize widget content.
export function widgetToolbar(card, header, view, getRect) {
    let enabled = false, overCard = false, overHeader = false, hideTimer = 0;
    const css = new Gtk.CssProvider();
    css.load_from_string('.widget-edit-toolbar { padding: 4px 8px; border-radius: 10px; background: @window_bg_color; color: @window_fg_color; border: 1px solid alpha(@window_fg_color, 0.2); box-shadow: 0 3px 10px rgba(0,0,0,0.25); } .widget-edit-toolbar button { min-width: 24px; min-height: 24px; padding: 3px; }');
    header.add_css_class('widget-edit-toolbar');
    header.get_style_context().add_provider(css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION + 1);
    header.visible = false;
    view.fixed.put(header, 0, 0);
    const cancel = () => { if (hideTimer) GLib.Source.remove(hideTimer); hideTimer = 0; };
    const position = () => {
        const rect = getRect();
        if (!rect) return;
        const width = header.measure(Gtk.Orientation.HORIZONTAL, -1)[1];
        const height = header.measure(Gtk.Orientation.VERTICAL, width)[1];
        const x = Math.max(4, Math.min(rect.x + (rect.width - width) / 2, view.monitor.width - width - 4));
        const above = rect.y - height - 6;
        const y = above >= 4 ? above : Math.min(view.monitor.height - height - 4, rect.y + rect.height + 6);
        view.fixed.move(header, x, y);
    };
    const show = () => {
        cancel();
        if (!enabled) return;
        header.visible = true;
        const last = view.fixed.get_last_child();
        if (last !== header) header.insert_after(view.fixed, last);
        position();
    };
    const leave = () => {
        cancel();
        hideTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 220, () => {
            hideTimer = 0;
            if (!overCard && !overHeader && !header.get_focus_child()) header.visible = false;
            return GLib.SOURCE_REMOVE;
        });
    };
    const controllers = [];
    for (const [widget, isCard] of [[card, true], [header, false]]) {
        const motion = new Gtk.EventControllerMotion();
        motion.connect('enter', () => { if (isCard) overCard = true; else overHeader = true; show(); });
        motion.connect('leave', () => { if (isCard) overCard = false; else overHeader = false; leave(); });
        widget.add_controller(motion); controllers.push([widget, motion]);
    }
    const focus = new Gtk.EventControllerFocus();
    focus.connect('enter', show); focus.connect('leave', leave);
    header.add_controller(focus); controllers.push([header, focus]);
    return {
        setEditing(value) { enabled = value; cancel(); header.visible = false; if (value && overCard) show(); },
        hide() { cancel(); header.visible = false; },
        position,
        destroy() { cancel(); for (const [widget, controller] of controllers) widget.remove_controller(controller); header.get_parent()?.remove(header); },
    };
}
