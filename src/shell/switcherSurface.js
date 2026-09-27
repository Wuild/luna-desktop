import Shell from 'gi://Shell';
import St from 'gi://St';
import {darkStyle, watchStyle} from './windowPreviewCard.js';

// Shared surface for the switcher and the collapsed/expanded drag chooser.
export function bindSwitcherSurface(settings, actor, attached = false) {
    const blur = new Shell.BlurEffect({mode: Shell.BlurMode.BACKGROUND, radius: 12, brightness: 0.85});
    actor.add_effect(blur);
    const update = () => {
        const transparent = settings.get_boolean('desktop-switcher-transparency');
        const radius = settings.get_int('desktop-switcher-blur-radius');
        blur.enabled = transparent && radius > 0;
        blur.radius = radius * St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const opacity = transparent ? settings.get_int('desktop-switcher-opacity') / 100 : 1;
        let rgb = darkStyle() ? [20, 20, 24] : [205, 205, 205];
        const color = settings.get_string('desktop-switcher-color');
        if (settings.get_boolean('desktop-switcher-color-override') && /^#[0-9a-f]{6}$/i.test(color))
            rgb = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
        const corners = settings.get_int('desktop-switcher-corner-radius');
        actor.set_style(`background-color: rgba(${rgb.join(',')},${opacity}); color: ${darkStyle() ? '#f5f5f5' : '#202020'}; border-radius: ${attached ? `0 0 ${corners}px ${corners}px` : `${corners}px`};`);
    };
    watchStyle(actor, update);
    settings.raw.connectObject('changed', (_settings, key) => {
        if (key.startsWith('desktop-switcher-')) update();
    }, actor);
    return blur;
}
