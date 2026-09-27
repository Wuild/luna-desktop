import Gio from 'gi://Gio';
import GIRepository from 'gi://GIRepository?version=3.0';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';

let bridge = null;
let attempted = false;
export function clearNativeBridge() { bridge = null; attempted = false; }
export function loadNativeBridge() {
    if (attempted) return bridge;
    attempted = true;
    const directory = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_child('native');
    if (!directory.get_child('LunaTiling-1.0.typelib').query_exists(null)) return null;
    try {
        const repository = GIRepository.Repository.dup_default();
        repository.prepend_search_path(directory.get_path());
        repository.prepend_library_path(directory.get_path());
        imports.gi.versions.LunaTiling = '1.0';
        bridge = imports.gi.LunaTiling;
    } catch (error) {
        console.warn(`Luna tiling: native bridge unavailable: ${error.message}`);
    }
    return bridge;
}

export const TileConstraint = GObject.registerClass({Implements: [Meta.ExternalConstraint]}, class TileConstraint extends GObject.Object {
    vfunc_constrain(window, info) {
        if (this.enabled && this.rect && !window.is_fullscreen()) {
            const {x, y, width, height} = this.rect;
            bridge.constrain(info, x, y, width, height);
        }
        return true;
    }
});
