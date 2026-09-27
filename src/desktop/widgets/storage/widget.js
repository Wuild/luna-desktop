import {_, formatText} from '../../../i18n.js';
import Gtk from 'gi://Gtk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export function create(context) {
    const box=new Gtk.Box({orientation:Gtk.Orientation.VERTICAL,spacing:10});
    box.append(new Gtk.Label({label:_('Storage'),xalign:0,css_classes:['heading']}));
    const list=new Gtk.Box({orientation:Gtk.Orientation.VERTICAL,spacing:12});
    const scroll=new Gtk.ScrolledWindow({vexpand:true,hscrollbar_policy:Gtk.PolicyType.NEVER});scroll.set_child(list);box.append(scroll);
    const monitor=Gio.VolumeMonitor.get();
    let cancelled=false, pending=null;
    const refresh=()=>{
        pending?.cancel();pending=new Gio.Cancellable();const request=pending;
        while(list.get_first_child())list.remove(list.get_first_child());
        const locations=[];
        if(context.options.showHome!==false)locations.push({name:_('Home'),file:Gio.File.new_for_path(GLib.get_home_dir()),icon:'user-home-symbolic'});
        if(context.options.showSystem)locations.push({name:_('System'),file:Gio.File.new_for_path('/'),icon:'drive-harddisk-symbolic'});
        if(context.options.showMounted!==false)for(const mount of monitor.get_mounts()){
            const file=mount.get_root();
            if(file.is_native()&&!locations.some(item=>item.file.equal(file)))locations.push({name:mount.get_name(),file,gicon:mount.get_symbolic_icon()});
        }
        if(!locations.length)list.append(new Gtk.Label({label:_('No drives selected'),wrap:true,css_classes:['dim-label']}));
        for(const location of locations){
            const button=new Gtk.Button({css_classes:['flat'],tooltip_text:formatText(_("Open %s"), location.name)});
            const content=new Gtk.Box({orientation:Gtk.Orientation.VERTICAL,spacing:4});
            const title=new Gtk.Box({spacing:8});
            title.append(location.gicon?new Gtk.Image({gicon:location.gicon,pixel_size:18}):new Gtk.Image({icon_name:location.icon,pixel_size:18}));
            title.append(new Gtk.Label({label:location.name,xalign:0,hexpand:true,ellipsize:3}));content.append(title);
            const progress=new Gtk.ProgressBar();content.append(progress);
            const detail=new Gtk.Label({label:_('Checking space…'),xalign:0,wrap:true,css_classes:['dim-label','caption']});content.append(detail);
            button.set_child(content);button.connect('clicked',()=>{if(!context.editing)context.openUri(location.file.get_uri());});list.append(button);
            location.file.query_filesystem_info_async('filesystem::size,filesystem::free',GLib.PRIORITY_DEFAULT,request,(file,result)=>{
                if(cancelled||request.is_cancelled())return;
                try{
                    const info=file.query_filesystem_info_finish(result);
                    const total=info.get_attribute_uint64('filesystem::size'),free=info.get_attribute_uint64('filesystem::free');
                    if(!total){detail.label=_('Capacity unavailable');progress.visible=false;return;}
                    progress.fraction=Math.max(0,Math.min(1,(total-free)/total));
                    detail.label=formatText(_("%s free of %s"), GLib.format_size(free), GLib.format_size(total));
                }catch{detail.label=_('Drive unavailable');progress.visible=false;}
            });
        }
    };
    const ids=['mount-added','mount-removed','mount-changed'].map(signal=>monitor.connect(signal,refresh));
    context.onDispose(()=>{cancelled=true;pending?.cancel();for(const id of ids)monitor.disconnect(id);});
    context.every(30000,refresh);refresh();return box;
}
