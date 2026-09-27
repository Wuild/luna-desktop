# Window tiling implementation

Luna keeps normalized layout rectangles, window membership, a workspace, and a monitor together in each group. The same rectangle calculation drives previews, placements, gaps, assist selection, and geometry validation. Separate snap operations join matching layouts where a slot is free. Group ratios survive workspace switching and usable-area changes; monitor changes reflow existing groups; removed outputs fall back to a surviving monitor.

Dividers have a transparent background until hovered or dragged. The grabbed divider handles motion and release directly, since a Clutter grab can bypass stage capture. Both shared dividers and native window-edge resizing change the group's split positions and place the affected windows. During a native grab, Mutter owns the actively resized window; Luna updates its neighbors, then reconciles every member at grab end. Minimum sizes constrain shared splits. Spacing is applied after rounding layout coordinates so odd-numbered gaps remain exact.

The reference behavior is informed by [Pop Shell's measure/arrange and sibling resizing](https://github.com/pop-os/shell/blob/master_noble/src/forest.ts) and [i3's split containers](https://i3wm.org/docs/userguide.html#_tree). This implementation uses fixed layout presets with shared boundaries, not a general automatic tiling tree. No reference implementation code was copied.

## Maximize styling investigation

GNOME 50's `Meta.Window.set_maximize_flags()` changes geometry as well as state. Its Wayland implementation sends the maximized state based on Mutter's window state. There is no independent public client-decoration toggle here.

A headless GNOME 50 experiment implemented `Meta.ExternalConstraint` in GJS, maximized a GTK window, and tried to constrain it to 500×400 at (100,100). After changing the retrieved `info.new_rect`, another read still returned the original width (1280). The actual maximized frame remained (0,32), 1280×768. The nested rectangle is exposed as a copy in this path, so the JavaScript mutations did not reach Mutter's constraint calculation. The experimental override is not shipped.

The native bridge in `native/luna-tiling.c` solves the boxed-copy problem by writing the pointed-to rectangle synchronously inside the constraint callback. A follow-up headless test retained maximized state at (100,100), 500×400, resized it to 700×500, and restored normal state on unsnap. The extension installs an external constraint per tracked window and updates it whenever its grid changes. With square corners enabled, Mutter reports the app as maximized while the native constraint supplies the tile's size. The app remains responsible for drawing its decorations in that state. This appearance workaround is experimental and off by default: applications such as Nautilus may persist maximization as an app-wide default and use it for new windows. Native constraints still enforce tile geometry when the workaround is off.

The helper is optional, built for Meta 18 and the local architecture. A source fingerprint prevents silently packaging a stale cached binary. `GIRepository` loads the typelib and shared library from the extension's `native/` directory. Unsnapping, closing, and disabling release constraints; square styling is removed when returning to normal state. Native window resizing suspends the active window's constraint until grab completion. In maximized appearance mode the shared divider is the resizing affordance.

## Group resizing and suggestions

Monitor/work-area notifications coalesce before reflow. They do not reset group membership. Normalized grid coordinates remain authoritative; every member's target is recalculated for the new screen area, including a resized Devkit screen. Unexpected client geometry triggers bounded reconciliation instead of deleting the group. Removing a member leaves remaining members in the grid.

Suggestions use shortest-column placement to form a masonry grid, vertically centered if its contents fit and scrollable otherwise. A translucent black backdrop dims the target tile behind the cards without adding a solid gray panel. The backdrop fades in while the content also slides into place; closing overlays fade out after releasing input immediately. Hover highlights transition smoothly. All motion respects the system animation setting. A modal input grab captures clicks outside app cards and closes suggestions, including clicks on blank space inside the tile; keyboard snapping remains available in normal action mode.

## Luna window switcher

`SnapSwitcher` owns a unified MRU list of individual windows plus one entry per live snap group with at least two members. Both application and window switching bindings invoke Luna; same-app cycling remains GNOME's. Group cards retain the normalized tile arrangement, while ordinary cards show a single window. Individual switcher cards expose a hover close button that sends `Meta.Window.delete()` and keeps the switcher open. An unmanaged signal schedules a refresh after group membership settles; the grid repacks, obsolete group entries disappear, and selection follows the same surviving entry or nearest remaining index. A rejected or pending close leaves its card intact. Group cards never offer a bulk-close button. Both switcher and assist use `windowPreviewCard.js` for their header, preview surface and selection outline.

Luna's grid packs cards in MRU order with a fixed 180-pixel preview height and widths derived from window aspect ratios, bounded by a 180-pixel minimum and the available row width. Previews retain their aspect ratio and are centered in the available space. Up/Down selects the nearest horizontal center in the adjacent row. The grid wraps at the configured monitor-width percentage and scrolls vertically when it exceeds 75% of monitor height. Its backdrop fits the content rather than spanning the screen. Shared cards and the panel respond to system color-scheme changes while open. Shell's switcher popup primitive provides modal input and modifier-release handling; the entries, presentation and activation are Luna's. Group activation revalidates membership, unminimizes and raises members, reapplies geometry, and focuses the most recently used member on its workspace. The current-workspace-only window-switcher setting is respected. Closing or moving a listed window to another workspace refreshes an open popup; it closes automatically only if no entries remain. Disabling the feature closes its popup and reinstates GNOME handlers. This is restoration of living windows, not persistent application/session restoration.

## Opening application windows

GNOME and each application control initial window placement, size, monitor and maximized state. Luna does not save or restore application window layouts or redirect newly opened windows to another monitor. Tiling applies when the user explicitly snaps a window.

## Validation

- `pnpm test`: geometry, layout coverage, boundary constraints, exact odd/even gaps, and existing desktop tests.
- `pnpm test:tiling`: disposable GNOME Shell with real GTK Wayland windows; placement, independent snaps joining a grid, divider and native resizing, spacing changes, flyout cancellation, maximize, and lifecycle cleanup.
- `pnpm test:shell`: existing desktop and preferences smoke tests.

Manual checks still matter for application-specific sizing behavior, mixed-DPI monitor dragging, and animation appearance.

Snap ghosts and layout-choice tiles obtain the accent from `St.ThemeContext.get_accent_color()`. The color is blended slightly toward neutral and drawn with low fill opacity. Theme-context changes refresh visible actors automatically.

The drag layout chooser begins as an 18-pixel-high top-edge tab with the same width and horizontal alignment as the expanded chooser as soon as window movement is detected. Hovering opens its clipped content with a 220ms downward slide; leaving the chooser collapses it, and completing/canceling the drag removes both. The keyboard flyout stays directly accessible.

Switcher appearance settings are independent of Taskbar settings but start with the same schema defaults: transparency enabled, opacity 56%, blur radius 12, corner radius 12, padding 6 and card spacing 6. Disabling transparency produces an opaque surface and disables blur. Appearance/layout changes apply to an open switcher.

The collapsed tab and expanded chooser use `switcherSurface.js`, the same live surface settings as the App switcher (opacity, blur, background override, color scheme and corners). Their top corners stay square where attached to the monitor edge.
