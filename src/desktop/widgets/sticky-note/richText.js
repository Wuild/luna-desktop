import Gtk from 'gi://Gtk?version=4.0';
import Pango from 'gi://Pango';

export function richText(buffer, state = {}) {
    const tags = {
        bold: new Gtk.TextTag({name: 'bold', weight: Pango.Weight.BOLD}),
        italic: new Gtk.TextTag({name: 'italic', style: Pango.Style.ITALIC}),
        underline: new Gtk.TextTag({name: 'underline', underline: Pango.Underline.SINGLE}),
    };
    for (const tag of Object.values(tags)) buffer.tag_table.add(tag);
    const link = new Gtk.TextTag({name: 'web-link', underline: Pango.Underline.SINGLE}); buffer.tag_table.add(link);
    for (const span of state.spans ?? []) {
        if (tags[span.style] && Number.isInteger(span.start) && Number.isInteger(span.end) && span.start >= 0 && span.end > span.start && span.end <= buffer.get_char_count())
            buffer.apply_tag(tags[span.style], buffer.get_iter_at_offset(span.start), buffer.get_iter_at_offset(span.end));
    }
    let links = [];
    const updateLinks = () => {
        buffer.remove_tag(link, buffer.get_start_iter(), buffer.get_end_iter());
        links = [...buffer.text.matchAll(/https?:\/\/[^\s<>]+/gi)].map(match => {
            const url = match[0].replace(/[.,;!?)\]]+$/, '');
            const start = Array.from(buffer.text.slice(0, match.index)).length;
            return {url, start, end: start + Array.from(url).length};
        });
        for (const item of links) buffer.apply_tag(link, buffer.get_iter_at_offset(item.start), buffer.get_iter_at_offset(item.end));
    };
    updateLinks();
    return {
        updateLinks,
        linkAt: offset => links.find(item => offset >= item.start && offset < item.end)?.url,
        toggle(style) {
            const [selected, start, end] = buffer.get_selection_bounds();
            if (!selected || !tags[style]) return false;
            const tag = tags[style];
            if (start.has_tag(tag)) buffer.remove_tag(tag, start, end);
            else buffer.apply_tag(tag, start, end);
            return true;
        },
        serialize() {
            const spans = [];
            for (const [style, tag] of Object.entries(tags)) {
                let iter = buffer.get_start_iter();
                while (iter.get_offset() < buffer.get_char_count()) {
                    const start = iter.get_offset(), active = iter.has_tag(tag);
                    const next = iter.copy(); next.forward_to_tag_toggle(tag);
                    if (next.get_offset() <= start) break;
                    if (active) spans.push({style, start, end: next.get_offset()});
                    iter = next;
                }
            }
            return {text: buffer.text, spans};
        },
    };
}
