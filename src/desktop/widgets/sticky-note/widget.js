import Gtk from 'gi://Gtk?version=4.0';
import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk?version=4.0';
import {richText} from './richText.js';
import {applyTextStyle} from '../textStyle.js';

export function create(context) {
    const {options} = context;
    const surface = new Gtk.Overlay();
    const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 6, margin_top: 12, margin_bottom: 12, margin_start: 12, margin_end: 12});
    surface.set_child(box);
    const header = new Gtk.Box({spacing: 6, cursor: Gdk.Cursor.new_from_name('grab', null)});
    const grip = new Gtk.Image({icon_name: 'list-drag-handle-symbolic', pixel_size: 14});
    header.append(grip);
    header.tooltip_text = 'Drag to move note';
    context.registerDragHandle?.(header);
    const title = new Gtk.Label({label: String(options.title ?? 'Note'), xalign: {left: 0, center: 0.5, right: 1}[options.alignment] ?? 0});
    title.add_css_class('heading'); title.visible = options.showTitle !== false; title.hexpand = true;
    header.append(title);
    const configure = new Gtk.Button({icon_name: 'emblem-system-symbolic', tooltip_text: 'Note color, size, and appearance'});
    configure.add_css_class('flat'); configure.connect('clicked', () => context.configure?.());
    const done = new Gtk.Button({icon_name: 'object-select-symbolic', tooltip_text: 'Finish typing (Escape)'});
    done.add_css_class('flat');
    const remove = new Gtk.Button({icon_name: 'user-trash-symbolic', tooltip_text: 'Remove note'});
    remove.add_css_class('flat'); remove.connect('clicked', () => context.remove?.());
    header.append(done); header.append(configure); header.append(remove);
    const hover = new Gtk.EventControllerMotion();
    const revealControls = () => {
        const keyboardFocus = [configure, remove, done].some(widget => widget.has_visible_focus());
        const visible = hover.contains_pointer || keyboardFocus;
        for (const widget of [grip, configure, remove]) widget.opacity = visible ? 1 : 0;
        configure.can_target = remove.can_target = visible;
    };
    // Observe the updated property, rather than reading old state in enter/leave.
    hover.connect('notify::contains-pointer', revealControls);
    for (const button of [configure, remove, done])
        button.connect('state-flags-changed', revealControls);
    surface.add_controller(hover); revealControls();
    applyTextStyle(title, options);
    const text = new Gtk.TextView({wrap_mode: Gtk.WrapMode.WORD_CHAR, vexpand: true,
        editable: false, cursor_visible: false,
        justification: {left: Gtk.Justification.LEFT, center: Gtk.Justification.CENTER, right: Gtk.Justification.RIGHT}[options.alignment] ?? Gtk.Justification.LEFT});
    const state = context.loadState();
    text.buffer.text = String(state.text ?? options.text ?? '');
    const rich = richText(text.buffer, state);
    const formatting = new Gtk.Box({spacing: 2, hexpand: true});
    const styleButtons = [];
    let changed = () => {};
    for (const [style, name] of [['bold', 'format-text-bold-symbolic'], ['italic', 'format-text-italic-symbolic'], ['underline', 'format-text-underline-symbolic']]) {
        const button = new Gtk.Button({icon_name: name, tooltip_text: `Select text to make it ${style}`, focusable: false});
        button.add_css_class('flat');
        button.connect('clicked', () => { if (rich.toggle(style)) changed(); text.grab_focus(); });
        formatting.append(button); styleButtons.push(button);
    }
    text.tooltip_text = 'Click to write a note; Escape to finish';
    let editingText = false;
    const finish = () => { editingText = false; updateFocus(false); text.get_root()?.set_focus(null); };
    done.connect('clicked', finish);
    const focus = new Gtk.EventControllerFocus();
    const updateFocus = active => { text.cursor_visible = active; text.editable = active && options.interactive !== false; done.opacity = active ? 1 : 0; done.can_target = active; done.focusable = active; formatting.opacity = active ? 1 : 0; formatting.can_target = active; };
    focus.connect('enter', () => updateFocus(editingText)); focus.connect('leave', () => { editingText = false; updateFocus(false); });
    text.add_controller(focus); updateFocus(false);
    const keys = new Gtk.EventControllerKey();
    keys.connect('key-pressed', (_c, key) => { if (key === Gdk.KEY_Escape) { finish(); return true; }
        if (_c.get_current_event_state() & Gdk.ModifierType.CONTROL_MASK) {
            const style = {[Gdk.KEY_b]: 'bold', [Gdk.KEY_B]: 'bold', [Gdk.KEY_i]: 'italic', [Gdk.KEY_I]: 'italic', [Gdk.KEY_u]: 'underline', [Gdk.KEY_U]: 'underline'}[key];
            if (style && rich.toggle(style)) { changed(); return true; }
        }
        return false; });
    text.add_controller(keys);
    let root = null, outside = null;
    const detach = () => { if (root && outside) root.remove_controller(outside); root = outside = null; };
    const rootSignal = box.connect('notify::root', () => {
        detach(); root = box.get_root(); if (!root) return;
        outside = new Gtk.GestureClick({button: 0, propagation_phase: Gtk.PropagationPhase.CAPTURE});
        outside.connect('pressed', (_g, _n, x, y) => {
            const picked = root.pick(x, y, Gtk.PickFlags.DEFAULT);
            if (editingText && picked !== box && !picked?.is_ancestor(box)) finish();
        });
        root.add_controller(outside);
    });
    context.onDispose(() => { box.disconnect(rootSignal); detach(); });
    const color = /^#[0-9a-f]{6}$/i.test(options.textColor) ? options.textColor : '#ffffff';
    const alpha = Math.max(0.1, Math.min(1, Number(options.shadowStrength ?? 80) / 100));
    const css = new Gtk.CssProvider();
    css.load_from_string(`textview, textview text { background: transparent; color: ${color}; caret-color: ${color}; font-size: ${Math.max(10, Math.min(48, Number(options.textSize) || 18))}px;
        text-shadow: ${options.shadow !== false ? `0 1px 3px rgba(0,0,0,${alpha}), 0 0 1px rgba(0,0,0,${alpha})` : 'none'}; }`);
    text.get_style_context().add_provider(css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION + 1);
    let pending = 0, dirty = false;
    const save = () => { if (dirty) { context.saveState(rich.serialize()); dirty = false; } };
    changed = () => {
        rich.updateLinks();
        dirty = true;
        if (pending) GLib.Source.remove(pending);
        pending = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 350, () => { pending = 0; save(); return GLib.SOURCE_REMOVE; });
    };
    text.buffer.connect('changed', changed);
    context.onDispose(() => { if (pending) GLib.Source.remove(pending); save(); });
    const links = new Gtk.GestureClick({button: 1, propagation_phase: Gtk.PropagationPhase.CAPTURE});
    links.connect('pressed', (gesture, _count, x, y) => {
        const [bx, by] = text.window_to_buffer_coords(Gtk.TextWindowType.WIDGET, x, y);
        const [ok, iter] = text.get_iter_at_location(bx, by);
        const url = ok ? rich.linkAt(iter.get_offset()) : null;
        if (url && (!editingText || (gesture.get_current_event_state() & Gdk.ModifierType.CONTROL_MASK))) {
            context.openUri?.(url); gesture.set_state(Gtk.EventSequenceState.CLAIMED);
            return;
        }
        if (options.interactive !== false) { editingText = true; updateFocus(true); text.grab_focus(); }
    });
    text.add_controller(links);
    const motion = new Gtk.EventControllerMotion();
    motion.connect('motion', (_m, x, y) => {
        const [bx, by] = text.window_to_buffer_coords(Gtk.TextWindowType.WIDGET, x, y);
        const [ok, iter] = text.get_iter_at_location(bx, by);
        text.set_cursor_from_name(ok && rich.linkAt(iter.get_offset()) ? 'pointer' : 'text');
    });
    text.add_controller(motion);
    const scroll = new Gtk.ScrolledWindow({hscrollbar_policy: Gtk.PolicyType.NEVER, vscrollbar_policy: Gtk.PolicyType.AUTOMATIC, vexpand: true});
    scroll.set_child(text); box.append(header); box.append(scroll);
    const resize = new Gtk.DrawingArea({halign: Gtk.Align.END, valign: Gtk.Align.END, width_request: 18, height_request: 18,
        cursor: Gdk.Cursor.new_from_name('se-resize', null), tooltip_text: 'Drag to resize note'});
    resize.set_draw_func((_area, cr, width, height) => {
        cr.setSourceRGBA(0, 0, 0, 0.2);
        cr.moveTo(width, 0); cr.lineTo(width, height); cr.lineTo(0, height); cr.closePath(); cr.fill();
    });
    context.onDispose(() => resize.set_draw_func(null));
    context.registerResizeHandle?.(resize);
    box.append(formatting);
    surface.add_overlay(resize); surface.set_measure_overlay(resize, false);
    return surface;
}
