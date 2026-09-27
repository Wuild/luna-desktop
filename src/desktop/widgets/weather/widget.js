import Gtk from 'gi://Gtk?version=4.0';
import GLib from 'gi://GLib';
import {applyTextStyle, applyIconStyle} from '../textStyle.js';
import {httpClient} from '../http.js';
import {conditions, temperature, forecastUrl} from './model.js';

export function create(context) {
    const {options} = context;
    const iconTheme = new Gtk.IconTheme({theme_name: 'Adwaita'});
    const weatherPaintable = (name, size) => iconTheme.lookup_icon(name, ['weather-overcast-symbolic'], size, 1, Gtk.TextDirection.NONE, Gtk.IconLookupFlags.FORCE_SYMBOLIC);
    const align = {left: Gtk.Align.START, center: Gtk.Align.CENTER, right: Gtk.Align.END}[options.alignment] ?? Gtk.Align.CENTER;
    const xalign = {left: 0, center: 0.5, right: 1}[options.alignment] ?? 0.5;
    const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 8});
    const label = (text = '') => {
        const item = new Gtk.Label({label: text, xalign, justify: xalign === 0.5 ? Gtk.Justification.CENTER : xalign === 1 ? Gtk.Justification.RIGHT : Gtk.Justification.LEFT, wrap: true});
        applyTextStyle(item, options); return item;
    };
    const city = label('Weather');
    const current = new Gtk.Box({spacing: 12, halign: align});
    const icon = new Gtk.Image({icon_name: 'weather-overcast-symbolic', pixel_size: Math.max(20, Math.min(120, Number(options.iconSize) || 48)), visible: options.showIcon !== false});
    applyIconStyle(icon, options);
    const degrees = label('—');
    current.append(icon); current.append(degrees);
    const description = label(); const details = label();
    const forecast = new Gtk.Box({spacing: 14, homogeneous: true});
    const status = label(); const attribution = label('Weather data by Open-Meteo');
    attribution.add_css_class('caption'); status.add_css_class('caption');
    for (const item of [city, current, description, details, forecast, status, attribution]) box.append(item);
    city.visible = options.showLocation !== false;
    description.visible = options.showConditions !== false;
    attribution.visible = options.showAttribution !== false;
    status.visible = options.showUpdated !== false;
    details.visible = options.showDetails !== false;
    forecast.visible = options.showForecast !== false;
    let disposed = false, busy = false;
    context.onDispose(() => { disposed = true; });
    const http = httpClient(context);
    const query = String(options.city ?? '').trim();
    const country = String(options.countryCode ?? '').trim().toUpperCase();
    const key = JSON.stringify([query.toLowerCase(), country, options.units]);
    let cache = context.loadState();
    const render = data => {
        const now = data.current;
        if (!now || !Number.isFinite(now.temperature_2m)) throw new Error('Missing weather data');
        degrees.set_markup(`<span size="${Math.max(20, Math.min(64, Number(options.textSize) || 36)) * 1024}">${temperature(now.temperature_2m)}${options.units === 'fahrenheit' ? 'F' : 'C'}</span>`);
        const [text, name] = conditions(now.weather_code, !!now.is_day);
        description.label = text; icon.set_from_paintable(weatherPaintable(name, icon.pixel_size));
        details.label = `Feels like ${temperature(now.apparent_temperature)} · Wind ${now.wind_speed_10m ?? '—'} km/h`;
        for (let child = forecast.get_first_child(); child; child = forecast.get_first_child()) forecast.remove(child);
        for (let i = 0; i < Math.min(3, data.daily?.time?.length ?? 0); i++) {
            const column = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 4});
            const date = GLib.DateTime.new_from_iso8601(`${data.daily.time[i]}T12:00:00Z`, null);
            column.append(label(i === 0 ? 'Today' : date?.format('%a') ?? ''));
            const forecastIcon = new Gtk.Image({paintable: weatherPaintable(conditions(data.daily.weather_code[i])[1], 22), pixel_size: 22, visible: options.showIcon !== false, halign: align});
            applyIconStyle(forecastIcon, options);
            column.append(forecastIcon);
            column.append(label(`${temperature(data.daily.temperature_2m_max[i])} / ${temperature(data.daily.temperature_2m_min[i])}`));
            forecast.append(column);
        }
        context.contentChanged?.();
    };
    if (cache.key === key && cache.data) {
        try { render(cache.data); city.label = cache.location.name; status.label = 'Saved weather · updating…'; } catch { cache = {}; }
    }
    const update = async () => {
        if (disposed || busy || !query) return;
        busy = true;
        try {
            let location = cache.key === key ? cache.location : null;
            if (!location) {
                const result = await http.json(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json${/^[A-Z]{2}$/.test(country) ? `&countryCode=${country}` : ''}`);
                if (disposed) return;
                const found = result.results?.[0];
                if (!found) throw new Error('City not found. Try a nearby city or country code.');
                location = {latitude: found.latitude, longitude: found.longitude,
                    name: [found.name, found.admin1, found.country_code].filter(Boolean).join(', ')};
            }
            const data = cache.key === key && Date.now() - cache.updated < 900000 ? cache.data : await http.json(forecastUrl(location, options.units));
            if (disposed) return;
            render(data); city.label = location.name;
            cache = {key, location, data, updated: cache.data === data ? cache.updated : Date.now()};
            context.saveState(cache);
            status.visible = options.showUpdated !== false;
            status.label = `Updated ${GLib.DateTime.new_from_unix_local(Math.floor(cache.updated / 1000)).format('%H:%M')}`;
            context.contentChanged?.();
        } catch (error) {
            if (!disposed) { status.visible = true; status.label = cache.key === key && cache.data ? 'Offline · showing saved weather' : `Weather unavailable: ${error.message}`; }
        } finally { busy = false; }
    };
    if (!query) { description.visible = true; description.label = 'Set your city in Edit Desktop → Customize.'; current.visible = false; details.visible = false; forecast.visible = false; }
    else {
        if (!cache.data) status.label = 'Loading weather…';
        // Debounce live edits so typing a city does not send a request per keystroke.
        let pending = true;
        const source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 900, () => { pending = false; update(); return GLib.SOURCE_REMOVE; });
        context.onDispose(() => { if (pending) GLib.Source.remove(source); });
        context.every(900000, update);
    }
    return box;
}
