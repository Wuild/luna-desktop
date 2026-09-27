import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import {create as links} from '../dist/desktop/widgets/quick-links/widget.js';
import {create as calendar} from '../dist/desktop/widgets/calendar/widget.js';
import {create as storage} from '../dist/desktop/widgets/storage/widget.js';
Adw.init();
const loop=new GLib.MainLoop(null,false);
const wait=ms=>new Promise(resolve=>GLib.timeout_add(0,ms,()=>{resolve();return GLib.SOURCE_REMOVE;}));
function assert(value,message){if(!value)throw new Error(message);}
function walk(widget){const result=[widget];for(let child=widget.get_first_child();child;child=child.get_next_sibling())result.push(...walk(child));return result;}
const cleanups=[],states={};let opened=null;
function context(id,options={}){return {id,options,editing:false,loadState:()=>states[id]??{},saveState:value=>states[id]=value,onDispose:fn=>cleanups.push(fn),openUri:uri=>opened=uri,every:()=>{}};}
async function run(){
 const window=new Gtk.Window({title:'New desktop widgets',default_width:1060,default_height:480});
 const row=new Gtk.Box({spacing:24,margin_top:20,margin_bottom:20,margin_start:20,margin_end:20});window.set_child(row);
 const quick=links(context('links')),agenda=calendar(context('calendar')),drives=storage(context('storage'));
 for(const widget of [quick,agenda,drives]){widget.width_request=320;row.append(widget);}window.present();await wait(300);
 walk(quick).find(w=>w instanceof Gtk.Button&&w.tooltip_text==='Add a link').emit('clicked');await wait(100);
 const tops=Gtk.Window.get_toplevels();let dialog;
 for(let i=0;i<tops.get_n_items();i++)if(tops.get_item(i).title==='Add quick link')dialog=tops.get_item(i);
 assert(dialog,'Quick link editor opens');
 walk(dialog).find(w=>w instanceof Gtk.DropDown).selected=2;
 walk(dialog).find(w=>w instanceof Gtk.Entry&&w.placeholder_text==='https://example.com').text='https://example.com';
 dialog.response(Gtk.ResponseType.OK);await wait(100);
 assert(states.links.links[0].target==='https://example.com','Link saved immediately');
 walk(quick).find(w=>w instanceof Gtk.Button&&w.tooltip_text?.startsWith('example.com')).emit('clicked');
 assert(opened==='https://example.com','Link opens the saved target');
 const entry=walk(agenda).find(w=>w instanceof Gtk.Entry);entry.text='Design review';entry.emit('activate');
 assert(states.calendar.events[0].title==='Design review','Agenda saved immediately');
 const restored=calendar(context('calendar'));
 assert(walk(restored).some(w=>w instanceof Gtk.Label&&w.label==='Design review'),'Agenda survives widget recreation');
 await wait(500);
 assert(walk(drives).some(w=>w instanceof Gtk.Label&&w.label.includes(' free of ')),'Storage reports filesystem capacity');
 const snap=new Gtk.Snapshot();new Gtk.WidgetPaintable({widget:window}).snapshot(snap,window.get_width(),window.get_height());
 window.get_renderer().render_texture(snap.to_node(),null).save_to_png('/tmp/luna-productivity-widgets.png');
 for(const cleanup of cleanups.reverse())cleanup();window.destroy();print('PRODUCTIVITY_WIDGETS_PASS');
}
run().then(()=>loop.quit()).catch(error=>{printerr(error.stack);imports.system.exit(1);});loop.run();
