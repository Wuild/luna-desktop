# Desktop Widget API v1

Luna - Desktop hosts local GTK4 widgets in its separate desktop companion process.
Nothing from a widget is imported into GNOME Shell. These are **trusted local
JavaScript modules**, with normal user file/network access, not sandboxed apps.
Only explicitly enabled widgets are loaded. Widgets may opt into multiple instances with `"multiple": true`; each instance receives its own ID, options, position, and state file.

Enable Desktop Widgets → Show desktop widgets. Desktop icons and widgets are independently enabled.
The built-in Clock is a complete example in `src/desktop/widgets/clock/`.

## Create a widget

Create `~/.local/share/luna-desktop/widgets/my-widget/` containing:

`widget.json`:
```json
{
  "apiVersion": 1,
  "id": "my-widget",
  "name": "My Widget",
  "description": "An example desktop widget",
  "width": 260,
  "height": 160
}
```

IDs must start with a lowercase letter and contain only lowercase letters,
digits, and hyphens (maximum 64 characters). The folder and ID must match.
Built-in IDs are reserved. Dimensions are logical pixels, clamped to fit.

`widget.js`:
```js
import Gtk from 'gi://Gtk?version=4.0';

export function create(context) {
    let {count = 0} = context.loadState();
    const button = new Gtk.Button({label: `Clicked ${count} times`});
    button.connect('clicked', () => {
        button.label = `Clicked ${++count} times`;
        context.saveState({count});
    });
    return button;
}
```

Use Edit Desktop → Add widget to discover and add the widget. Local widget
code is cached by GJS; restart the desktop component after editing code.

## Context

- `apiVersion`, `id`: immutable host/API identity.
- `loadState()`: JSON state, or `{}` when no valid state exists.
- `saveState(value)`: save JSON under the user's local widget-state directory.
- `every(milliseconds, callback)`: periodic update, minimum 100 ms; automatically
  stops when the instance is removed or rebuilt.
- `onDispose(callback)`: release signals, subprocesses, or other resources.
  Called in reverse registration order when removed, rebuilt, or shut down.
- `openUri(uri)`: open a URI with its default application.

`create(context)` must synchronously return one unparented `Gtk.Widget`. Use
asynchronous I/O for updates. Avoid blocking the GTK loop. Do not quit the
application or alter its windows. Use `onDispose` for anything you create
outside the returned widget, including your own timers and signal connections.

In Edit Desktop mode, the host provides the title, remove button, draggable
header, and remembered position. Widgets remain below application windows. Widgets can be dragged between displays using their Edit Desktop header, or a registered normal-mode handle. The pointer offset and destination monitor are preserved independently of icon monitor settings.
Removing a widget disables it; saved state is retained. The Widgets setting hides
all widgets without changing the enabled list. Runtime errors are logged under
`[Luna - Desktop desktop]`; a failed module displays an error card.

## HUD, editing, and customization

Widgets are a passive HUD by default: their content does not intercept pointer
input, and the title and controls are hidden. Right-click the desktop → **Edit
Desktop** to reveal the editor toolbar and widget controls. **Add Widget** lists
installed widgets; drag anywhere on a widget to move it; use its settings button to
customize it or its trash button to remove it. **Done** returns to HUD mode.

A widget that needs hover or buttons declares `"interactive": true` in its
manifest. Its controls work outside edit mode unless the user disables **Allow
hover and button controls**. Leave this field out for display-only widgets.
`context.editing` describes the current mode. Hosts retain widgets across edit-mode changes and rebuild only instances whose
options change, calling registered cleanup functions first.

Common customization controls include width, height, whole-widget opacity,
optional background, background color/opacity, and corner radius. Background
opacity is independent of text/content opacity. Settings are saved per widget.

Declare additional controls with a manifest `settings` array, for example:
```json
"settings": [
  {"key":"showDate", "label":"Show date", "type":"boolean", "default":true},
  {"key":"textSize", "label":"Text size", "type":"number", "min":12, "max":48, "default":24},
  {"key":"color", "label":"Text color", "type":"color", "default":"#ffffff"},
  {"key":"format", "label":"Format", "type":"choice", "default":"short",
   "choices":[{"label":"Short", "value":"short"},{"label":"Long", "value":"long"}]}
]
```

Supported types: `boolean`, `number` (optional `step`), `string`, `choice`, and
`color`. Read current values from `context.options`. Reserve the common keys
`width`, `height`, `opacity`, `interactive`, `background`, `backgroundColor`,
`backgroundOpacity`, and `cornerRadius` for the host. Return synchronously and
perform any later asynchronous updates without retaining disposed instances.

The bundled **Resources** example shows CPU, GPU, and memory as separate rings,
or concentric rings showing all enabled metrics. Its options include ring diameter/thickness,
per-metric colors, text color, labels, and sampling interval. CPU usage is based
on `/proc/stat` deltas; memory uses `MemTotal - MemAvailable`. GPU usage uses
DRM `gpu_busy_percent` counters when provided by the driver (the busiest GPU
when multiple expose it). Unsupported counters display an em dash; no elevated
permissions or vendor command-line utility is required.

Customization previews changes live; **Done** keeps them and **Cancel** restores
the values from when the dialog opened. Bundled widgets expose shadow
controls. Widgets always paint underneath desktop icons, including while editing.

Resources also offers individually selectable swap, disk, download, upload, and
battery rings. Disk usage measures the filesystem containing the configured path
(blank uses Home). Network speed is bytes/second; ring fill uses the configured
Mbps scale. `auto` selects the IPv4 default-route interface, falling back to the
first non-loopback interface; a specific interface name may be entered. Battery
shows the mean reported capacity of available system batteries. Swap without a
configured swap area, missing batteries, and unsupported GPU counters display
an em dash. CPU/network rates need one initial sampling interval.

Ring shape supports full, three-quarter, half, quarter, or custom 30–360° arcs.
Rotation is measured clockwise from the top. Progress is mapped to the selected
arc, including its shadow and track. Ring arrangement can wrap automatically or
use a horizontal/vertical line. Metric labels and value strings have independent
visibility switches.

Editing chrome is an overlay: it does not resize or shift widget content.
Clicking an editing widget raises it above other widgets, always below icons.
Widget and icon placement stores edge distances, preserving right/bottom
placement through monitor/work-area resizing without accumulating grid drift.

Concentric mode nests every enabled metric from outside to inside, with a color-matched legend. Ring spacing and thickness fit the selected outer diameter. It has no single-metric selector.


## Weather, Now Playing, and Sticky Notes

- **Weather:** enter a city and optional two-letter country code in Customize.
  The resolved city/region is displayed. Choose Celsius/Fahrenheit, forecast,
  details, temperature size, color, and shadow. Conditions refresh every 15
  minutes; cached data remains available offline. No automatic location access
  is used. City lookups and coordinates are sent to Open-Meteo only when enabled
  and configured. Attribution is displayed on the widget.
  API references: https://open-meteo.com/en/docs and
  https://open-meteo.com/en/docs/geocoding-api.
- **Now Playing:** uses local MPRIS players, preferring a playing player, or a
  configured player name. Artwork, album name, and playback controls can be
  toggled; controls can appear on hover. Unsupported controls are disabled.
  Artwork URLs supplied by the player are loaded asynchronously. Player exit
  resets the card. Reference: https://specifications.freedesktop.org/mpris/latest/.
- **Sticky Note:** click and type directly on the desktop. Multiline text saves
  automatically, independently of appearance options, and is flushed when the
  widget is removed/rebuilt. Ctrl+A/C/X/V operate on the text editor. Edit
  Desktop → Add Widget → Sticky Note adds another independent note. Customize
  its title, alignment, text size/color, shadow, and standard background options.
  Turning off interaction makes a note read-only. Removing a note hides it;
  its saved state is retained.

Multiple-instance manifests still use their folder ID (e.g. `sticky-note`).
The enabled list may additionally contain IDs such as `sticky-note:<uuid>`.
The host resolves the shared module but keys options/state/positions by the full
instance ID; unknown IDs and invalid suffixes are ignored. Existing single-ID
widget settings and positions remain compatible.

Sticky Notes default to opaque warm paper with dark text and no text shadow.
Outside Edit Desktop, drag their top strip to move, use the lower-right handle
 to resize, and use the settings button for per-note color and appearance.
Escape, the checkmark, or clicking outside the text ends typing. Each note keeps
its own dimensions and colors. The previous white/shadowed HUD defaults are
upgraded while retaining text and any custom paper color.

Widgets can register `context.registerDragHandle(widget)` and
`context.registerResizeHandle(widget)` for normal-mode movement/resizing.
`context.configure()` opens the instance's customization dialog.
`context.setVisible(boolean)` hides the whole card (including background), but
Edit Desktop always reveals it. Now Playing uses this for **Hide when nothing
is playing**, including paused/stopped players, and returns when playback resumes.

Edit Desktop now reuses live widget instances and overlays editor controls;
unchanged widgets are also preserved when another widget's settings change.
A customized widget keeps its top-left position as its content changes size.
Weather offers independent switches for location, condition text, update time,
provider credit, and weather icons, plus current-condition icon size. Icons
cover clear/partly cloudy day and night, overcast, fog, drizzle, rain, snow,
showers, and thunderstorms. Open-Meteo remains credited in the widget catalog.

Weather uses the complete Adwaita symbolic weather set so night icons remain visible with custom desktop icon themes. Current and forecast icons share the text color and shadow toggle/strength.


Desktop Widgets settings include magnetic snapping (enabled by default) and a
2–32 pixel snapping distance. During dragging, guide lines indicate alignment
with other visible widgets' edges/centers, screen margins/center, or 12px gaps.
The full outer widget bounds, including padding and borders, are used for both
screen edges. Notes expose a trash button with confirmation and a shaded
triangular corner for resizing.

Now Playing supports **Excluded apps (comma-separated names or IDs)**, for
example `Firefox, VLC`. Matches are case-insensitive substrings of the player
name, MPRIS bus name, or desktop ID. Exclusions take priority over Preferred
player and apply to track details, controls, visibility, and the visualizer.

The optional **Audio visualizer (selected app)** offers bar count, height, and
color settings. Color mode can be green → yellow → red (by bar height), a
solid chosen color, or a dominant color extracted from the current album
artwork. Artwork mode uses the solid color as a fallback and also works with
the thumbnail hidden. Sensitivity adjusts fixed audio gain; the level curve
keeps quiet bands low and leaves room for louder peaks. Capture uses overlapping
FFT windows, drops queued old audio, and paints on GTK’s frame clock. It matches the selected MPRIS player's process ID or application
identity to an active PulseAudio playback stream, then uses `parec` to monitor
only that stream on its actual output device. It follows stream/device changes
and retries when audio is unavailable. It requires `pactl`, `parec`, Python 3,
and PulseAudio or PipeWire's PulseAudio compatibility service. No microphone or
mixed-output fallback is used; audio stays local and is not saved. If an app
exposes multiple playback streams, one matching stream is selected; browser
tabs mixed into one app stream cannot be separated. Capture stops when paused,
rebuilt, or removed. Hover over the visualizer for capture/dependency status.


Sticky Notes support saved bold, italic, and underline ranges. Select text and
use the formatting buttons or Ctrl+B/I/U. HTTP/HTTPS links are clickable when
not editing; Ctrl+click opens them while editing. The caret is enabled only by
an explicit click into the text, and Escape, Done, desktop clicks, or focus loss
end editing. Move/settings/delete controls reveal on hover without resizing the
note. The shaded resize triangle sits at the outer bottom-right corner.

Weather defaults to **Fit height to visible content**. Hidden details and forecast
rows no longer leave an empty fixed-height card. Turn it off to use Fixed height.
Edit Desktop overlays its controls without increasing Weather's dimensions.
