import {_, formatText} from '../../../i18n.js';
import Gtk from 'gi://Gtk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export function create(context) {
    const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 8});
    const heading = new Gtk.Box({spacing: 8});
    heading.append(new Gtk.Label({label: _('Quick Links'), xalign: 0, hexpand: true, css_classes: ['heading']}));
    const add = new Gtk.Button({icon_name: 'list-add-symbolic', tooltip_text: _('Add a link'), css_classes: ['flat']});
    heading.append(add); box.append(heading);
    const list = new Gtk.FlowBox({selection_mode: Gtk.SelectionMode.NONE, max_children_per_line: 4, row_spacing: 6, column_spacing: 6});
    const scroll = new Gtk.ScrolledWindow({vexpand: true, hscrollbar_policy: Gtk.PolicyType.NEVER});
    scroll.set_child(list); box.append(scroll);
    const state = context.loadState();
    let links = Array.isArray(state.links) ? state.links.filter(link => typeof link.target === 'string') : [];
    const save = () => context.saveState({...state, links});
    let dialog = null;
    const render = () => {
        while (list.get_first_child()) list.remove(list.get_first_child());
        if (!links.length) { list.append(new Gtk.Label({label: _('Add your favorite apps and places.'), wrap: true, css_classes: ['dim-label']})); return; }
        for (const link of links) {
            const app = link.type === 'app' ? Gio.DesktopAppInfo.new(link.target) : null;
            const button = new Gtk.Button({tooltip_text: formatText(_("%s\nRight-click to remove"), link.label), css_classes: ['flat']});
            const tile = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 4});
            tile.append(app?.get_icon() ? new Gtk.Image({gicon: app.get_icon(), pixel_size: 28}) : new Gtk.Image({icon_name: link.type === 'url' ? 'web-browser-symbolic' : 'folder-symbolic', pixel_size: 28}));
            if (context.options.showLabels !== false) tile.append(new Gtk.Label({label: link.label, max_width_chars: 12, ellipsize: 3}));
            button.set_child(tile);
            button.connect('clicked', () => {
                if (context.editing) return;
                try { if (app) app.launch([], button.get_display().get_app_launch_context()); else if (link.type !== 'app') context.openUri(link.target); }
                catch (error) { button.tooltip_text = error.message; }
            });
            const click = new Gtk.GestureClick({button: 3});
            click.connect('pressed', () => {
                const popover = new Gtk.Popover(); popover.set_parent(button);
                const remove = new Gtk.Button({label: _('Remove link')}); popover.set_child(remove);
                remove.connect('clicked', () => { popover.popdown(); links = links.filter(item => item !== link); save(); render(); });
                popover.connect('closed', () => { if (popover.get_parent()) popover.unparent(); }); popover.popup();
            });
            button.add_controller(click); list.append(button);
        }
    };
    add.connect('clicked', () => {
        if (dialog) { dialog.present(); return; }
        dialog = new Gtk.Dialog({title: _('Add quick link'), transient_for: box.get_root(), modal: true, default_width: 420});
        dialog.add_button(_('Cancel'), Gtk.ResponseType.CANCEL);
        const accept = dialog.add_button(_('Add'), Gtk.ResponseType.OK); accept.add_css_class('suggested-action');
        const fields = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 12, margin_top: 16, margin_bottom: 16, margin_start: 16, margin_end: 16});
        const type = Gtk.DropDown.new_from_strings([_('Application'), _('File or folder'), _('Website')]);
        const apps = Gio.AppInfo.get_all().filter(app => app.should_show() && app.get_id()).sort((a,b) => a.get_display_name().localeCompare(b.get_display_name()));
        const chooser = Gtk.DropDown.new_from_strings(apps.map(app => app.get_display_name())); chooser.enable_search = true;
        const label = new Gtk.Entry({placeholder_text: _('Name (optional)')});
        const target = new Gtk.Entry({placeholder_text: _('File or folder path')});
        const browse = new Gtk.Button({label: _('Browse…')});
        browse.connect('clicked', () => { const picker = new Gtk.FileDialog(); picker.open(dialog, null, (_p,result) => {try {target.text=picker.open_finish(result).get_uri();} catch { /* Dismissed */ }}); });
        const error = new Gtk.Label({wrap: true, xalign: 0, css_classes: ['error']});
        for (const field of [type, chooser, target, browse, label, error]) fields.append(field);
        const update = () => { chooser.visible = type.selected === 0; target.visible = type.selected !== 0; browse.visible = type.selected === 1; target.placeholder_text = type.selected === 2 ? 'https://example.com' : _('File or folder path'); error.label = ''; };
        type.connect('notify::selected', update); update();
        dialog.get_content_area().append(fields);
        dialog.connect('response', (_dialog, response) => {
            if (response === Gtk.ResponseType.OK) {
                let destination, name;
                const kind = ['app','file','url'][type.selected];
                if (kind === 'app') { const app=apps[chooser.selected]; if (!app) return; destination=app.get_id(); name=app.get_display_name(); }
                else if (kind === 'url') {
                    const value=target.text.trim();
                    if (!/^https?:\/\/\S+$/i.test(value)) { error.label=formatText(_('Enter a website starting with %s or %s.'), 'https://', 'http://'); return; }
                    destination=value; name=value.replace(/^https?:\/\//i,'');
                } else {
                    const value=target.text.trim(); if (!value) {error.label=_('Choose a file or enter a folder path.'); return;}
                    const file=Gio.File.new_for_commandline_arg(value.startsWith('~/') ? GLib.get_home_dir()+value.slice(1) : value);
                    destination=file.get_uri(); name=file.get_basename();
                }
                links.push({type:kind,target:destination,label:label.text.trim() || name}); save(); render();
            }
            dialog.destroy(); dialog=null;
        }); dialog.present();
    });
    context.onDispose(()=>{dialog?.destroy();dialog=null;});
    render(); return box;
}
