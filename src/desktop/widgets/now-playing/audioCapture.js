import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {RATE, SIZE, chooseStream, latestWindow, levels} from './spectrum.js';

// Capture runs in the GTK desktop process, never in GNOME Shell. All child
// processes, asynchronous reads and polling sources belong to this instance.
export class AudioCapture {
    constructor(player, bars, sensitivity, updateRate, onLevels, onStatus) {
        Object.assign(this, {player, bars, sensitivity, updateRate, onLevels, onStatus});
        this.cancel = new Gio.Cancellable();
        this.commands = new Map();
        this.buffer = new Uint8Array();
        this.generation = 0;
        this.nextFrame = 0;
        this.refresh();
        this.poll = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this.refresh();
            return GLib.SOURCE_CONTINUE;
        });
    }
    async listing(kind) {
        const process = Gio.Subprocess.new(['pactl', '--format=json', 'list', kind],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
        const timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
            this.commands.delete(process);
            process.force_exit();
            return GLib.SOURCE_REMOVE;
        });
        this.commands.set(process, timeout);
        try {
            return await new Promise((resolve, reject) => process.communicate_utf8_async(null, this.cancel, (p, result) => {
                try {
                    const [, output] = p.communicate_utf8_finish(result);
                    if (!p.get_successful()) throw Error('Audio server unavailable');
                    resolve(JSON.parse(output));
                } catch (error) { reject(error); }
            }));
        } finally {
            const id = this.commands.get(process);
            if (id) GLib.Source.remove(id);
            this.commands.delete(process);
        }
    }
    async refresh() {
        if (this.disposed || this.busy) return;
        this.busy = true;
        try {
            const stream = chooseStream(await this.listing('sink-inputs'), this.player);
            if (this.disposed) return;
            const sinks = stream ? await this.listing('sinks') : [];
            if (this.disposed) return;
            const sink = sinks.find(item => String(item.index) === String(stream.sink));
            const source = sink?.monitor_source ? [String(stream.index), String(sink.monitor_source)] : null;
            const key = JSON.stringify(source);
            if (key !== this.sourceKey) { this.stopCapture(); this.sourceKey = key; }
            if (source && !this.process) this.startCapture(...source);
            else if (!source) this.onStatus('Waiting for selected app audio');
        } catch {
            if (!this.disposed) {
                this.stopCapture();
                this.onStatus('Audio server unavailable (requires PulseAudio or PipeWire PulseAudio support)');
            }
        } finally { this.busy = false; }
    }
    startCapture(index, monitor) {
        const ticket = ++this.generation;
        const process = this.process = Gio.Subprocess.new(['parec', `--device=${monitor}`, `--monitor-stream=${index}`,
            '--format=float32le', `--rate=${RATE}`, '--channels=1', '--latency-msec=20', '--process-time-msec=10',
            '--client-name=LunaDesktop Visualizer', '--stream-name=Selected player spectrum'],
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
        const stream = process.get_stdout_pipe();
        this.onStatus('Live spectrum of the selected app');
        const read = () => stream.read_bytes_async(65536, GLib.PRIORITY_DEFAULT, this.cancel, (input, result) => {
            try {
                const chunk = input.read_bytes_finish(result).get_data();
                if (this.disposed || ticket !== this.generation) return;
                if (!chunk.length) { this.stopCapture(); this.onStatus('Player audio capture stopped; retrying'); return; }
                const buffer = new Uint8Array(this.buffer.length + chunk.length);
                buffer.set(this.buffer); buffer.set(chunk, this.buffer.length);
                const now = GLib.get_monotonic_time() / 1e6;
                if (now < this.nextFrame) {
                    // Retain sample alignment and at most one window plus a partial sample.
                    this.buffer = buffer.slice(Math.max(0, buffer.length - buffer.length % 4 - SIZE * 4));
                } else {
                    const [data, retained] = latestWindow(buffer, Math.round(RATE / this.updateRate));
                    this.buffer = retained;
                    if (data) {
                        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
                        const samples = Array.from({length: SIZE}, (_, i) => view.getFloat32(i * 4, true));
                        this.nextFrame = now + 1 / this.updateRate;
                        this.onLevels(levels(samples, this.bars, this.sensitivity), now);
                    }
                }
                read();
            } catch {
                if (!this.disposed && ticket === this.generation) this.stopCapture();
            }
        });
        read();
        process.wait_async(null, (p, result) => {
            try { p.wait_finish(result); } catch { /* Already stopped. */ }
            if (!this.disposed && ticket === this.generation) this.stopCapture();
        });
    }
    stopCapture() {
        this.generation++;
        this.process?.force_exit();
        this.process = null;
        this.buffer = new Uint8Array();
    }
    destroy() {
        this.disposed = true;
        if (this.poll) GLib.Source.remove(this.poll);
        this.poll = 0;
        this.cancel.cancel();
        for (const [process, timeout] of this.commands) {
            GLib.Source.remove(timeout);
            process.force_exit();
        }
        this.commands.clear();
        this.stopCapture();
    }
}
