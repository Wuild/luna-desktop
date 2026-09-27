import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk?version=4.0';

export function widgetOptions(settings, definition) {
    let all;
    try { all = JSON.parse(settings.get_string('desktop-widget-options')); } catch { all = {}; }
    const saved = all[definition.id] ?? {};
    const result = {width: definition.width, height: definition.height, opacity: 100, background: false, backgroundOpacity: 60, backgroundColor: '#202024', cornerRadius: 12, interactive: definition.interactive === true};
    for (const field of definition.settings ?? []) result[field.key] = field.default;
    const values = {...result, ...definition.defaults, ...saved};
    if (definition.typeId === 'sticky-note' || definition.id === 'sticky-note') {
        // Upgrade the former transparent HUD defaults without losing note text
        // or a deliberately chosen paper color.
        if (saved.paperStyleVersion !== 1) {
            values.background = true; values.backgroundOpacity = 100;
            if (!saved.backgroundColor || saved.backgroundColor === '#202024') values.backgroundColor = '#f7df8b';
            if (!saved.textColor || saved.textColor === '#ffffff') values.textColor = '#3d3421';
            values.shadow = false;
            if (values.title === 'Note') values.title = '';
            if (values.textSize === 18) values.textSize = 16;
            if (values.cornerRadius === 12) values.cornerRadius = 4;
        }
        values.paperStyleVersion = 1;
    }
    return values;
}
export function customizeWidget(parent, settings, definition) {
    const values = widgetOptions(settings, definition);
    const save = value => {
        let all; try { all = JSON.parse(settings.get_string('desktop-widget-options')); } catch { all = {}; }
        if (value === undefined) delete all[definition.id]; else all[definition.id] = value;
        const encoded = JSON.stringify(all);
        if (encoded !== settings.get_string('desktop-widget-options')) settings.set_string('desktop-widget-options', encoded);
    };
    const dialog = new Gtk.Dialog({title: `Customize ${definition.name}`, transient_for: parent, modal: true, default_width: 580, default_height: 560});
    dialog.add_button('Done', Gtk.ResponseType.OK);
    const fields = [
        {key: 'width', label: 'Width', type: 'number', min: 120, max: 600},
        {key: 'height', label: (definition.settings ?? []).some(field => field.key === 'autoHeight') ? 'Fixed height' : 'Height', type: 'number', min: 80, max: 600},
        {key: 'opacity', label: 'Widget opacity (%)', type: 'number', min: 10, max: 100},
        {key: 'background', label: 'Show background', type: 'boolean'},
        {key: 'backgroundColor', label: 'Background color', type: 'color'},
        {key: 'backgroundOpacity', label: 'Background opacity (%)', type: 'number', min: 0, max: 100},
        {key: 'cornerRadius', label: 'Corner radius', type: 'number', min: 0, max: 48},
        ...(definition.interactive === true ? [{key: 'interactive', label: 'Allow hover and button controls', type: 'boolean'}] : []),
        ...(definition.settings ?? []),
    ];
    const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 12, margin_top: 12, margin_bottom: 12, margin_start: 12, margin_end: 12});
    const stack = new Gtk.Stack({vexpand: true, transition_type: Gtk.StackTransitionType.CROSSFADE});
    const switcher = new Gtk.StackSwitcher({stack, halign: Gtk.Align.CENTER});
    box.append(switcher); box.append(stack);
    const groups = new Map();
    for (const [name, description] of [
        ['Content', 'Choose what this widget shows.'],
        ['Appearance', 'Colors, text, and background.'],
        ['Layout', 'Size and arrangement on your desktop.'],
        ['Advanced', 'Optional behavior and fine-tuning.'],
    ]) {
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({title: name, description});
        page.add(group); stack.add_titled(page, name, name); groups.set(name, group);
    }
    const category = field => {
        if (field.category && groups.has(field.category)) return field.category;
        if (['interval', 'diskPath', 'networkInterface', 'networkScale', 'player', 'excludedApps', 'interactive', 'visualizerUpdateRate', 'visualizerSensitivity'].includes(field.key)) return 'Advanced';
        if (['width', 'height', 'autoHeight', 'layout', 'orientation', 'arc', 'arcDegrees', 'rotation', 'ringSize', 'ringGap', 'artSize', 'visualizerHeight'].includes(field.key)) return 'Layout';
        if (/color|shadow|opacity|background|corner|textSize|thickness|arc|rotation|visualizerBars/i.test(field.key)) return 'Appearance';
        return 'Content';
    };
    const controls = new Map(), rows = new Map();
    const dependencies = () => {
        const show = (key, visible) => { if (rows.has(key)) rows.get(key).visible = !!visible; };
        for (const key of ['backgroundColor', 'backgroundOpacity', 'cornerRadius']) show(key, values.background);
        show('shadowStrength', values.shadow);
        for (const metric of ['Cpu', 'Gpu', 'Memory', 'Swap', 'Disk', 'Download', 'Upload', 'Battery']) {
            if (`show${metric}` in values) show(`${metric[0].toLowerCase()}${metric.slice(1)}Color`, values[`show${metric}`]);
        }
        show('diskPath', values.showDisk);
        for (const key of ['networkInterface', 'networkScale']) show(key, values.showDownload || values.showUpload);
        show('ringGap', values.layout === 'single');
        show('height', !values.autoHeight);
        show('arcDegrees', values.arc === 'custom');
        show('artSize', values.showArtwork);
        show('controlsOnHover', values.showControls);
        for (const field of fields) if (field.key.startsWith('visualizer')) show(field.key, values.showVisualizer);
        show('visualizerHeight', values.showVisualizer && values.visualizerPlacement !== 'background');
        show('visualizerColor', values.showVisualizer && values.visualizerColorMode !== 'artwork');
    };
    for (const field of fields) {
        const row = new Adw.ActionRow({title: (field.label || field.key).replace(/\bcpu\b/g, 'CPU').replace(/\bgpu\b/g, 'GPU'), title_lines: 2});
        rows.set(field.key, row);
        let control, read;
        if (field.type === 'boolean') {
            control = new Gtk.Switch({active: !!values[field.key], valign: Gtk.Align.CENTER}); read = () => control.active;
        } else if (field.type === 'number') {
            control = Gtk.SpinButton.new_with_range(field.min ?? 0, field.max ?? 100, field.step ?? 1);
            control.value = Number(values[field.key]) || 0; read = () => control.value;
        } else if (field.type === 'choice' && Array.isArray(field.choices) && field.choices.length) {
            control = Gtk.DropDown.new_from_strings(field.choices.map(choice => choice.label));
            control.selected = Math.max(0, field.choices.findIndex(choice => choice.value === values[field.key]));
            read = () => field.choices[control.selected].value;
        } else if (field.type === 'color') {
            const rgba = new Gdk.RGBA(); rgba.parse(values[field.key] || '#202024');
            control = new Gtk.ColorDialogButton({rgba, dialog: new Gtk.ColorDialog({with_alpha: false})});
            read = () => '#' + [control.rgba.red, control.rgba.green, control.rgba.blue].map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
        } else if (field.type === 'string') {
            control = new Gtk.Entry({text: String(values[field.key] ?? ''), max_length: 512, width_chars: 18}); read = () => control.text;
        } else continue;
        const update = () => { values[field.key] = read(); };
        const signal = {boolean: 'notify::active', number: 'value-changed', choice: 'notify::selected', color: 'notify::rgba', string: 'changed'}[field.type];
        controls.set(field.key, control);
        control.connect(signal, () => { update();
            dependencies();
            save(values); });
        control.valign = Gtk.Align.CENTER;
        row.add_suffix(control); row.activatable_widget = control;
        groups.get(category(field)).add(row);
    }
    dependencies();
    dialog.get_content_area().append(box);
    dialog.connect('response', () => dialog.destroy());
    dialog.present();
    return dialog;
}
