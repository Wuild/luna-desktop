import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export function parseCpu(text) {
    const line = text.split('\n').find(row => /^cpu\s/.test(row));
    if (!line) return null;
    // guest and guest_nice are already included in user and nice.
    const ticks = line.trim().split(/\s+/).slice(1, 9).map(Number);
    if (ticks.length < 4 || ticks.some(value => !Number.isFinite(value))) return null;
    return {total: ticks.reduce((a, b) => a + b, 0), idle: ticks[3] + (ticks[4] ?? 0)};
}
export function cpuUsage(previous, current) {
    if (!previous || !current || current.total <= previous.total) return null;
    return Math.max(0, Math.min(100, 100 * (1 - (current.idle - previous.idle) / (current.total - previous.total))));
}
function memoryValues(text) {
    return Object.fromEntries(text.split('\n').map(line => {
        const match = /^([A-Za-z_]+):\s+(\d+)/.exec(line);
        return match ? [match[1], Number(match[2])] : ['', 0];
    }));
}
export function memoryUsage(text) {
    const values = memoryValues(text);
    if (!values.MemTotal || !Number.isFinite(values.MemAvailable)) return null;
    return Math.max(0, Math.min(100, 100 * (1 - values.MemAvailable / values.MemTotal)));
}
function read(path, cancellable) {
    return new Promise((resolve, reject) => Gio.File.new_for_path(path).load_contents_async(cancellable, (file, result) => {
        try { resolve(new TextDecoder().decode(file.load_contents_finish(result)[1])); } catch (e) { reject(e); }
    }));
}
export function gpuSources() {
    const directory = Gio.File.new_for_path('/sys/class/drm');
    const paths = [];
    try {
        const entries = directory.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        try {
            let info;
            while ((info = entries.next_file(null))) {
                if (!/^card\d+$/.test(info.get_name())) continue;
                const path = directory.get_child(`${info.get_name()}/device/gpu_busy_percent`);
                if (path.query_exists(null)) paths.push(path.get_path());
            }
        } finally { entries.close(null); }
    } catch { /* No driver-provided utilization counter. */ }
    return paths;
}
export function swapUsage(text) {
    const values = memoryValues(text);
    return values.SwapTotal > 0 && Number.isFinite(values.SwapFree) ? Math.max(0, Math.min(100, 100 * (1 - values.SwapFree / values.SwapTotal))) : null;
}
export function parseNetwork(text) {
    const result = {};
    for (const line of text.split('\n')) {
        const match = /^\s*([^:]+):\s*(.*)$/.exec(line);
        if (!match || match[1] === 'lo') continue;
        const fields = match[2].trim().split(/\s+/).map(Number);
        if (fields.length >= 9 && Number.isFinite(fields[0]) && Number.isFinite(fields[8]))
            result[match[1]] = {rx: fields[0], tx: fields[8]};
    }
    return result;
}
export function networkRates(previous, current, seconds) {
    if (!previous || !current || seconds <= 0 || current.rx < previous.rx || current.tx < previous.tx)
        return {download: null, upload: null};
    return {download: (current.rx - previous.rx) / seconds, upload: (current.tx - previous.tx) / seconds};
}
function batteryPaths() {
    const directory = Gio.File.new_for_path('/sys/class/power_supply'), paths = [];
    try {
        const entries = directory.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        try { let info; while ((info = entries.next_file(null))) paths.push(directory.get_child(info.get_name()).get_path()); }
        finally { entries.close(null); }
    } catch { /* Desktop without power-supply devices. */ }
    return paths;
}
function diskUsage(path, cancellable) {
    return new Promise((resolve, reject) => Gio.File.new_for_path(path).query_filesystem_info_async(
        'filesystem::size,filesystem::free', GLib.PRIORITY_DEFAULT, cancellable, (file, result) => {
            try {
                const info = file.query_filesystem_info_finish(result), size = info.get_attribute_uint64('filesystem::size');
                resolve(size > 0 ? Math.max(0, Math.min(100, 100 * (1 - info.get_attribute_uint64('filesystem::free') / size))) : null);
            } catch (e) { reject(e); }
        }));
}
export class ResourceSampler {
    constructor(options = {}) {
        this.options = options; this.previous = null; this.network = null; this.time = 0; this.interface = null;
        this.gpus = gpuSources(); this.batteries = batteryPaths(); this.cancellable = new Gio.Cancellable();
    }
    dispose() { this.cancellable.cancel(); }
    async sample() {
        const values = await Promise.allSettled([
            read('/proc/stat', this.cancellable), read('/proc/meminfo', this.cancellable),
            read('/proc/net/dev', this.cancellable), read('/proc/net/route', this.cancellable),
            diskUsage(this.options.diskPath?.startsWith('/') ? this.options.diskPath : GLib.get_home_dir(), this.cancellable),
            Promise.allSettled(this.batteries.map(async path => {
                if ((await read(`${path}/type`, this.cancellable)).trim() !== 'Battery') return null;
                return Number((await read(`${path}/capacity`, this.cancellable)).trim());
            })),
            ...this.gpus.map(path => read(path, this.cancellable)),
        ]);
        const value = index => values[index].status === 'fulfilled' ? values[index].value : null;
        const current = value(0) ? parseCpu(value(0)) : null;
        const cpu = cpuUsage(this.previous, current); this.previous = current;
        const memory = value(1) ? memoryUsage(value(1)) : null;
        const swap = value(1) ? swapUsage(value(1)) : null;
        const network = value(2) ? parseNetwork(value(2)) : {};
        const route = value(3)?.split('\n').map(line => line.trim().split(/\s+/)).find(fields => fields[1] === '00000000');
        const selected = this.options.networkInterface && this.options.networkInterface !== 'auto' ? this.options.networkInterface :
            route?.[0] ?? Object.keys(network)[0];
        const now = GLib.get_monotonic_time();
        const rates = networkRates(this.interface === selected ? this.network : null, network[selected], (now - this.time) / 1e6);
        this.network = network[selected]; this.interface = selected; this.time = now;
        const batteries = (value(5) ?? []).filter(result => result.status === 'fulfilled' && Number.isFinite(result.value) && result.value >= 0 && result.value <= 100).map(result => result.value);
        const gpus = values.slice(6).filter(result => result.status === 'fulfilled' && result.value.trim() !== '')
            .map(result => Number(result.value.trim())).filter(result => Number.isFinite(result) && result >= 0 && result <= 100);
        return {cpu, memory, swap, disk: value(4), battery: batteries.length ? batteries.reduce((a, b) => a + b, 0) / batteries.length : null,
            ...rates, gpu: gpus.length ? Math.max(...gpus) : null};
    }
}
