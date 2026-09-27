import Gtk from 'gi://Gtk?version=4.0';
import GObject from 'gi://GObject';

const CellLayout = GObject.registerClass(class CellLayout extends Gtk.LayoutManager {
    vfunc_measure(widget, orientation, _forSize) {
        const size = orientation === Gtk.Orientation.HORIZONTAL ? widget._cellWidth : widget._cellHeight;
        return [size, size, -1, -1];
    }
    vfunc_allocate(widget, width, height, baseline) {
        widget.get_child()?.allocate(width, height, baseline, null);
    }
});

export const DesktopButton = GObject.registerClass(class DesktopButton extends Gtk.Button {
    _init(width, height, properties = {}) {
        this._cellWidth = width;
        this._cellHeight = height;
        super._init({...properties, overflow: Gtk.Overflow.HIDDEN});
        this.add_css_class('desktop-item');
        this.set_layout_manager(new CellLayout());
    }
});
