import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {customizeWidget} from '../dist/desktop/widgetSettings.js';
import {discoverWidgets} from '../dist/widgets/catalog.js';
Adw.init();
const loop = new GLib.MainLoop(null,false);
const wait = ms => new Promise(resolve=>GLib.timeout_add(0,ms,()=>{resolve();return GLib.SOURCE_REMOVE;}));
const root=Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_child('dist').get_path();
const source=Gio.SettingsSchemaSource.new_from_directory(`${root}/schemas`,Gio.SettingsSchemaSource.get_default(),false);
const settings=new Gio.Settings({settings_schema:source.lookup('org.gnome.shell.extensions.luna-desktop',false)});
function walk(widget) {const all=[widget];for(let c=widget.get_first_child();c;c=c.get_next_sibling())all.push(...walk(c));return all;}
function assert(value,text){if(!value)throw new Error(text);}
async function run(){
 const parent=new Gtk.Window();parent.present();
 for(const definition of discoverWidgets(root)){
  const before=settings.get_string('desktop-widget-options');
  const dialog=customizeWidget(parent,settings,definition);await wait(120);
  const children=walk(dialog);
  const stack=children.find(w=>w instanceof Gtk.Stack && w.get_child_by_name('Content'));
  assert(stack,'Categorized widget settings');
  const background=children.find(w=>w instanceof Adw.ActionRow&&w.title==='Background color');
  const toggle=children.find(w=>w instanceof Adw.ActionRow&&w.title==='Show background');
  const control=walk(toggle).find(w=>w instanceof Gtk.Switch);
  control.active=false;assert(!background.visible,'Background details hidden while off');
  control.active=true;assert(background.visible,'Background details shown while on');
  for(const name of ['Content','Appearance','Layout','Advanced']){
   stack.visible_child_name=name;await wait(300);
   assert(dialog.get_width()<=650,'Dialog stays compact');
   if(definition.id==='resources'){
    const snap=new Gtk.Snapshot();new Gtk.WidgetPaintable({widget:dialog}).snapshot(snap,dialog.get_width(),dialog.get_height());
    dialog.get_renderer().render_texture(snap.to_node(),null).save_to_png(`/tmp/luna-widget-${name}.png`);
   }
  }
  const saved=settings.get_string('desktop-widget-options');
  dialog.response(Gtk.ResponseType.CLOSE);
  assert(settings.get_string('desktop-widget-options')===saved,'Closing keeps immediately saved options');
  settings.set_string('desktop-widget-options',before);
 }
 parent.destroy();print('WIDGET_SETTINGS_PASS');
}
run().then(()=>loop.quit()).catch(error=>{printerr(error.stack);imports.system.exit(1);});loop.run();
