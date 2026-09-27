import Gtk from 'gi://Gtk?version=4.0';
const app = new Gtk.Application({application_id: 'io.github.luna.SnapTest'});
app.connect('activate', () => {
    for (let i = 0; i < 3; i++) {
        const w = new Gtk.ApplicationWindow({application: app, title: `Snap test ${i}`, default_width: 360, default_height: 240});
        w.set_child(new Gtk.Label({label: `Tiling test window ${i}`}));
        w.present();
    }
});
app.run([]);
