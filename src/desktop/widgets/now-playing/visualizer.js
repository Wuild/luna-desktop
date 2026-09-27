import Cairo from 'cairo';
import Gtk from 'gi://Gtk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk?version=4.0';

export function visualizer(context) {
    const {options} = context;
    const count = Math.max(8, Math.min(48, Math.round(Number(options.visualizerBars) || 24)));
    const updateRate = Math.max(10, Math.min(60, Number(options.visualizerUpdateRate) || 60));
    const area = new Gtk.DrawingArea({height_request: Math.max(20, Math.min(120, Number(options.visualizerHeight) || 40)), hexpand: true});
    const color = new Gdk.RGBA(); color.parse(options.visualizerColor || '#ffffff');
    let values = Array(count).fill(0), target = [...values], process = null, cancel = null, generation = 0, disposed = false, playerKey = '';
    const artworkColor = new Gdk.RGBA();
    let hasArtworkColor = false, lastFrame = 0, lastAudio = 0, gradient = null, gradientHeight = -1;
    area.set_draw_func((_area, cr, width, height) => {
        const gap = 3, barWidth = Math.max(1, (width - (count - 1) * gap) / count);
        if ((options.visualizerColorMode ?? 'gradient') === 'gradient') {
            if (gradientHeight !== height) {
                gradientHeight = height;
                gradient = new Cairo.LinearGradient(0, height, 0, 0);
                gradient.addColorStopRGBA(0, 0.18, 0.85, 0.35, 0.9);
                gradient.addColorStopRGBA(0.6, 1, 0.85, 0.12, 0.9);
                gradient.addColorStopRGBA(1, 1, 0.2, 0.18, 0.9);
            }
            cr.setSource(gradient);
        } else {
            const tint = options.visualizerColorMode === 'artwork' && hasArtworkColor ? artworkColor : color;
            cr.setSourceRGBA(tint.red, tint.green, tint.blue, 0.9);
        }
        values.forEach((value, i) => { const h = Math.max(2, value * (height - 2)); cr.rectangle(i * (barWidth + gap), height - h, barWidth, h); });
        cr.fill();
    });
    const stop = () => {
        generation++; cancel?.cancel(); cancel = null;
        // SIGTERM lets the helper close its parec child as well.
        process?.send_signal(15); process = null; target = Array(count).fill(0);
    };
    const start = player => {
        if (process || disposed) return;
        if (!GLib.find_program_in_path('pactl') || !GLib.find_program_in_path('parec') || !GLib.find_program_in_path('python3')) {
            area.tooltip_text = 'Audio visualizer requires pactl, parec and Python 3'; return;
        }
        const ticket = ++generation;
        const helper = Gio.File.new_for_uri(import.meta.url).get_parent().get_child('spectrum.py').get_path();
        try {
            process = Gio.Subprocess.new(['python3', helper, String(count), JSON.stringify({name: player.name, pid: player.pid, Identity: player.Identity, DesktopEntry: player.DesktopEntry}), String(Math.max(25, Math.min(300, Number(options.visualizerSensitivity) || 100)) / 100), String(updateRate)], Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
            const child = process; cancel = new Gio.Cancellable();
            const stream = new Gio.DataInputStream({base_stream: child.get_stdout_pipe()});
            const read = () => stream.read_line_async(0, cancel, (source, result) => {
                try {
                    const [line] = source.read_line_finish_utf8(result);
                    if (disposed || ticket !== generation) return;
                    if (line === null) { target = Array(count).fill(0); area.tooltip_text = 'Player audio capture stopped'; return; }
                    const data = JSON.parse(line);
                    if (Array.isArray(data.levels) && data.levels.length === count && data.levels.every(Number.isFinite)) {
                        const now = GLib.get_monotonic_time() / 1e6;
                        if (Number.isFinite(data.time) && now - data.time < 0.25) {
                            target = data.levels;
                            lastAudio = now;
                        }
                    }
                    else if (data.status) { area.tooltip_text = data.status; target = Array(count).fill(0); }
                    read();
                } catch { /* Cancellation and source shutdown are normal. */ }
            });
            child.wait_async(null, (p, result) => {
                try { p.wait_finish(result); } catch { /* Process was already stopped. */ }
                if (ticket === generation) { process = null; target = Array(count).fill(0); }
            });
            area.tooltip_text = 'Waiting for selected app audio'; read();
        } catch { process = null; area.tooltip_text = 'Audio visualizer could not start'; }
    };
    const tick = area.add_tick_callback((_widget, clock) => {
        const now = clock.get_frame_time() / 1e6;
        if (lastFrame && now - lastFrame < 1 / updateRate - 0.001) return GLib.SOURCE_CONTINUE;
        const dt = lastFrame ? Math.min(0.1, now - lastFrame) : 1 / 60;
        lastFrame = now;
        if (now - lastAudio > 0.25) target.fill(0);
        let changed = false;
        values = values.map((value, i) => {
            const next = value + (target[i] - value) * (1 - Math.exp(-dt / (target[i] > value ? 0.01 : 0.085)));
            if (Math.abs(next - value) > 0.0005) changed = true;
            return next;
        });
        if (changed) area.queue_draw();
        return GLib.SOURCE_CONTINUE;
    });
    context.onDispose(() => { disposed = true; stop(); area.remove_tick_callback(tick); area.set_draw_func(null); });
    return {area, setArtworkColor: value => {
        hasArtworkColor = !!value && artworkColor.parse(value);
        area.queue_draw();
    }, setPlayer: player => {
        const key = player?.PlaybackStatus === 'Playing' ? JSON.stringify([player.name, player.pid, player.DesktopEntry, player.Identity]) : '';
        if (key !== playerKey) { stop(); playerKey = key; }
        if (key) start(player);
    }};
}
