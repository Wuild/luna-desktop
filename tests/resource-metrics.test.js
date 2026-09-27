import {concentricGeometry} from '../dist/desktop/widgets/resources/rings.js';
import {parseCpu, cpuUsage, memoryUsage, swapUsage, parseNetwork, networkRates, ResourceSampler} from '../dist/desktop/widgets/resources/metrics.js';
function assert(value, message) { if (!value) throw new Error(message); }
const a = parseCpu('cpu 100 20 30 200 10 0 0 0 999 999\ncpu0 1 2 3 4');
const b = parseCpu('cpu 120 20 40 220 10 0 0 0 999 999');
assert(a.total === 360 && a.idle === 210, 'Guest counters are not double counted');
assert(cpuUsage(a, b) === 60, 'CPU uses deltas and excludes idle/iowait');
assert(cpuUsage(null, b) === null && cpuUsage(b, b) === null, 'Warmup and zero delta are unavailable');
assert(memoryUsage('MemTotal: 1000 kB\nMemAvailable: 250 kB') === 75, 'Memory excludes available cache');
assert(memoryUsage('MemFree: 250 kB') === null, 'Missing memory counters are unavailable');
assert(swapUsage('SwapTotal: 1000 kB\nSwapFree: 400 kB') === 60, 'Swap usage');
assert(swapUsage('SwapTotal: 0 kB\nSwapFree: 0 kB') === null, 'No swap is unavailable');
const network = parseNetwork('lo: 99 0 0 0 0 0 0 0 99\neth0: 1000 0 0 0 0 0 0 0 2000');
assert(!network.lo && network.eth0.tx === 2000, 'Network parser excludes loopback');
assert(networkRates(network.eth0, {rx: 5000, tx: 3000}, 2).download === 2000, 'Network counter rates');
assert(networkRates(network.eth0, {rx: 1, tx: 1}, 2).download === null, 'Counter reset has no negative speed');
const sampler = new ResourceSampler();
const sample = await sampler.sample(); sampler.dispose();
assert(sample.memory === null || sample.memory >= 0 && sample.memory <= 100, 'Live memory sample is valid');
for (const size of [48, 88, 180]) {
    const rings = concentricGeometry(size, 8, 18, 12);
    assert(rings.length === 8 && rings.every(ring => ring.radius > 0), 'All concentric rings fit');
    assert(rings.every((ring, i) => i === 0 || ring.radius + ring.stroke / 2 <= rings[i - 1].radius - rings[i - 1].stroke / 2), 'Nested rings do not overlap');
}
print('LUNA_DESKTOP_RESOURCE_METRICS_PASS');
