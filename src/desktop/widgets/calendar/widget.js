import {_} from '../../../i18n.js';
import Gtk from 'gi://Gtk?version=4.0';
import GLib from 'gi://GLib';

export function create(context) {
    const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 8});
    const calendar = new Gtk.Calendar({show_week_numbers: !!context.options.showWeekNumbers});
    box.append(calendar);
    const state = context.loadState();
    let events = Array.isArray(state.events) ? state.events.filter(event => typeof event.date === 'string' && typeof event.title === 'string') : [];
    const agenda = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 6, visible: context.options.showAgenda !== false});
    const heading = new Gtk.Box({spacing: 8});
    heading.append(new Gtk.Label({label: _('Personal agenda'), xalign: 0, hexpand: true, css_classes: ['heading']}));
    const today = new Gtk.Button({label: _('Today'), css_classes: ['flat']});
    today.connect('clicked', () => calendar.select_day(GLib.DateTime.new_now_local())); heading.append(today); agenda.append(heading);
    const list = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 4});
    const scroll = new Gtk.ScrolledWindow({vexpand: true, min_content_height: 60, hscrollbar_policy: Gtk.PolicyType.NEVER}); scroll.set_child(list); agenda.append(scroll);
    const entry = new Gtk.Entry({placeholder_text: _('Add an event on the selected date…')});
    entry.secondary_icon_name='list-add-symbolic'; entry.secondary_icon_tooltip_text=_('Add event');
    agenda.append(entry); box.append(agenda);
    const dateKey = () => calendar.get_date().format('%Y-%m-%d');
    const save = () => context.saveState({...state, events});
    const render = () => {
        calendar.clear_marks();
        const month = calendar.get_date().format('%Y-%m-');
        for(const event of events) if(event.date.startsWith(month)) calendar.mark_day(Number(event.date.slice(-2)));
        while(list.get_first_child())list.remove(list.get_first_child());
        const start=dateKey();
        const upcoming=events.filter(event=>event.date>=start).sort((a,b)=>a.date.localeCompare(b.date));
        if(!upcoming.length)list.append(new Gtk.Label({label:_('No upcoming events'),xalign:0,css_classes:['dim-label']}));
        for(const event of upcoming){
            const row=new Gtk.Box({spacing:6});
            const text=new Gtk.Box({orientation:Gtk.Orientation.VERTICAL,hexpand:true});
            text.append(new Gtk.Label({label:event.title,xalign:0,wrap:true}));
            text.append(new Gtk.Label({label:event.date,xalign:0,css_classes:['dim-label','caption']}));
            const remove=new Gtk.Button({icon_name:'edit-delete-symbolic',tooltip_text:_('Remove event'),valign:Gtk.Align.CENTER,css_classes:['flat']});
            remove.connect('clicked',()=>{events=events.filter(item=>item!==event);save();render();});
            row.append(text);row.append(remove);list.append(row);
        }
    };
    const add=()=>{const title=entry.text.trim();if(!title)return;events.push({date:dateKey(),title});save();entry.text='';render();};
    entry.connect('activate',add);entry.connect('icon-release',add);
    for(const signal of ['day-selected','next-month','prev-month','next-year','prev-year'])calendar.connect(signal,render);
    render();return box;
}
