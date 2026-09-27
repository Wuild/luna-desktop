import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
export interface WidgetDefinition {
    apiVersion: 1; id: string; name: string; description?: string;
    width: number; height: number; directory: Gio.File; multiple?: boolean;
    [key: string]: unknown;
}
export interface WidgetInstance extends WidgetDefinition {typeId: string;}
function readManifest(file: Gio.File): Partial<WidgetDefinition> | null {
    try {
        const value: unknown = JSON.parse(new TextDecoder().decode(file.load_contents(null)[1]));
        return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    } catch { return null; }
}
export function widgetRoots(extensionPath: string): string[] {
    return [`${extensionPath}/desktop/widgets`, `${GLib.get_user_data_dir()}/luna-desktop/widgets`];
}
export function discoverWidgets(extensionPath: string): WidgetDefinition[] {
    const found = new Map<string, WidgetDefinition>();
    for (const root of widgetRoots(extensionPath)) {
        const folder = Gio.File.new_for_path(root);
        if (!folder.query_exists(null)) continue;
        const entries = folder.enumerate_children('standard::name,standard::type', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        try {
            let info;
            while ((info = entries.next_file(null))) {
                const id = info.get_name();
                if (info.get_file_type() !== Gio.FileType.DIRECTORY || !/^[a-z][a-z0-9-]{0,63}$/.test(id) || found.has(id)) continue;
                const path = folder.get_child(id);
                const manifest = readManifest(path.get_child('widget.json'));
                if (!manifest || manifest.apiVersion !== 1 || manifest.id !== id || typeof manifest.name !== 'string') continue;
                found.set(id, {...manifest, apiVersion: 1, id, name: manifest.name, directory: path, width: Math.max(120, Math.min(600, Number(manifest.width) || 240)),
                    height: Math.max(80, Math.min(600, Number(manifest.height) || 160))});
            }
        } finally { entries.close(null); }
    }
    return [...found.values()];
}

export function widgetInstances(definitions: readonly WidgetDefinition[], enabled: readonly string[]): WidgetInstance[] {
    return enabled.flatMap(id => {
        const definition = definitions.find(item => item.id === id ||
            (item.multiple === true && id.startsWith(`${item.id}:`) && /^[a-z0-9-]+$/.test(id.slice(item.id.length + 1))));
        return definition ? [{...definition, typeId: definition.id, id}] : [];
    });
}
