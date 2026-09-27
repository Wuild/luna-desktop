# Desktop settings

The schema is `org.gnome.shell.extensions.luna-desktop`, at `/org/gnome/shell/extensions/luna-desktop/`. It contains only desktop settings and is independent of LunaBar and Luna - Taskbar.

## Desktop Icons

Enable icons; show Home, Trash, hidden files and removable/network drives; choose single-click opening, display placement, sorting, grid snapping, icon/label sizes, spacing, colors and selection accent. Application-grid shortcut actions can be enabled independently.

Icon positions are stored by URI with display identity and edge-relative coordinates. Desktop files remain in the user's XDG Desktop directory.

## Widgets

Enable widgets independently of icons. Choose built-in or locally installed widgets, alignment snapping, edge spacing and snapping distance. Right-click the desktop and select Edit Desktop to manage instances, positions, sizes and appearance. Sticky Notes supports multiple instances.

Widget positions and options are stored in this schema. Each widget's content state is stored separately under `$XDG_DATA_HOME/luna-desktop/widget-state/`. Local custom widgets live in `$XDG_DATA_HOME/luna-desktop/widgets/`.

## Development

Edit `schemas/org.gnome.shell.extensions.luna-desktop.gschema.xml`, then run `pnpm generate`. The generated `src/settings/keys.ts` supplies valid keys, value types, enum literals and ranges to the typed preferences and Shell bridge. `pnpm typecheck` also checks compile-time rejection of foreign keys and invalid values.

GNOME Shell only manages the companion process and desktop window roles. File I/O and widgets run in the separate GTK process. Its windows stay below applications, off the taskbar and visible across workspaces.
