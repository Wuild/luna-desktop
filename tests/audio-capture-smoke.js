import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {AudioCapture} from '../dist/desktop/widgets/now-playing/audioCapture.js';
const temporary = GLib.dir_make_tmp('luna-capture-test-XXXXXX');
const fixture = Gio.File.new_for_uri(import.meta.url).get_parent().get_child('audio-capture-fixture.py').get_path();
for (const name of ['pactl', 'parec']) Gio.File.new_for_path(`${temporary}/${name}`).make_symbolic_link(fixture, null);
const originalPath = GLib.getenv('PATH');
GLib.setenv('PATH', `${temporary}:${originalPath}`, true);
const loop = new GLib.MainLoop(null, false);
let frames = 0, failure = null;
const capture = new AudioCapture({DesktopEntry: 'org.test.Player.desktop'}, 24, 1, 60,
    data => { if (data.length === 24 && data.every(Number.isFinite) && Math.max(...data) > 0.8) frames++; }, () => {});
GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1200, () => {
    if (frames < 2) failure = new Error(`Expected live frames, received ${frames}`);
    const process = capture.process;
    capture.destroy();
    if (capture.poll || capture.process || capture.commands.size) failure = new Error('Capture cleanup left owned resources');
    const previous = frames;
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
        if (frames !== previous) failure = new Error('Frames delivered after disposal');
        if (process) process.wait(null);
        loop.quit();
        return GLib.SOURCE_REMOVE;
    });
    return GLib.SOURCE_REMOVE;
});
loop.run();
GLib.setenv('PATH', originalPath, true);
for (const name of ['pactl', 'parec']) Gio.File.new_for_path(`${temporary}/${name}`).delete(null);
Gio.File.new_for_path(temporary).delete(null);
if (failure) throw failure;
print('LUNA_AUDIO_CAPTURE_PASS');
