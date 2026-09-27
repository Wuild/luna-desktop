// Pure spectrum math and stream selection, shared by capture and tests.
export const RATE = 22050;
export const SIZE = 1024;
const window = Array.from({length: SIZE}, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (SIZE - 1)));
export function levels(samples, bars = 24, sensitivity = 1) {
    const real = Float64Array.from(samples, (value, i) => value * window[i]);
    const imaginary = new Float64Array(SIZE);
    for (let i = 1, j = 0; i < SIZE; i++) {
        let bit = SIZE >> 1;
        while (j & bit) { j ^= bit; bit >>= 1; }
        j ^= bit;
        if (i < j) [real[i], real[j]] = [real[j], real[i]];
    }
    for (let length = 2; length <= SIZE; length *= 2) {
        const angle = -2 * Math.PI / length;
        const stepReal = Math.cos(angle), stepImaginary = Math.sin(angle);
        for (let start = 0; start < SIZE; start += length) {
            let phaseReal = 1, phaseImaginary = 0;
            for (let i = start; i < start + length / 2; i++) {
                const other = i + length / 2;
                const r = real[other] * phaseReal - imaginary[other] * phaseImaginary;
                const im = real[other] * phaseImaginary + imaginary[other] * phaseReal;
                real[other] = real[i] - r; imaginary[other] = imaginary[i] - im;
                real[i] += r; imaginary[i] += im;
                [phaseReal, phaseImaginary] = [phaseReal * stepReal - phaseImaginary * stepImaginary,
                    phaseReal * stepImaginary + phaseImaginary * stepReal];
            }
        }
    }
    return Array.from({length: bars}, (_, band) => {
        const low = Math.max(1, Math.floor(50 * 200 ** (band / bars) * SIZE / RATE));
        const high = Math.min(SIZE / 2, Math.max(low + 1, Math.floor(50 * 200 ** ((band + 1) / bars) * SIZE / RATE)));
        let amplitude = 0;
        for (let i = low; i < high; i++) amplitude = Math.max(amplitude, Math.hypot(real[i], imaginary[i]) * 4 / SIZE);
        const db = 20 * Math.log10(Math.max(1e-9, amplitude * sensitivity));
        return Math.round(Math.max(0, Math.min(1, (db + 55) / 50)) ** 1.7 * 1000) / 1000;
    });
}
const appId = value => String(value ?? '').toLowerCase().replace(/\.desktop$/, '');
export function chooseStream(streams, player) {
    const identities = new Set([player.DesktopEntry, player.Identity,
        (player.name ?? '').replace(/^org\.mpris\.MediaPlayer2\./, '').split('.')[0]].map(appId).filter(Boolean));
    let chosen = null, score = 0;
    for (const stream of streams) {
        if (stream.corked === true || stream.corked === 'yes') continue;
        const props = stream.properties ?? {};
        const pid = player.pid && String(props['application.process.id']) === String(player.pid);
        const match = ['application.id', 'application.name', 'application.process.binary', 'application.desktop']
            .some(key => identities.has(appId(props[key])));
        const rank = pid ? 2 : match ? 1 : 0;
        if (rank > score) { chosen = stream; score = rank; }
    }
    return chosen;
}
export function latestWindow(buffer, hop = Math.round(RATE / 60)) {
    const end = buffer.length - buffer.length % 4;
    if (end < SIZE * 4) return [null, buffer];
    return [buffer.slice(end - SIZE * 4, end), buffer.slice(end - Math.max(0, SIZE - hop) * 4)];
}
