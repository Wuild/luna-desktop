# Luna Desktop

**Make room for your notes, your apps, and your next idea.**

Desktop icons and customizable widgets for GNOME Shell 50 on Wayland. Keep the things you reach for every day on your desktop, and arrange them your way.

![Luna Desktop with sticky notes, a clock, calendar, resource rings, quick links, and desktop shortcuts](docs/screenshots/desktop-widgets.png)

*A real test desktop with sample content. The taskbar shown is the separate [Luna Taskbar](https://github.com/Wuild/luna-taskbar) extension.*

## Put your desktop to work

- **Leave yourself a note.** Sticky notes support multiple instances, colors, rich text, and direct editing.
- **Build your own widget layout.** Add a clock, weather, calendar and personal agenda, quick links, Now Playing, system resource rings, or storage information.
- **Make it yours.** Move and resize widgets; choose backgrounds, opacity, corner radius, and widget-specific options.
- **Keep useful files close.** Desktop files, folders, standard `.desktop` application launchers, Home, Trash, and mounted drives are supported.
- **Arrange once.** Drag icons into place, snap to a grid, and keep display-aware positions as your workspace changes.
- **Bring apps to the desktop.** Optional **Add to Desktop / Remove from Desktop** actions appear in GNOME’s application grid.

## Start making it yours

Right-click the desktop and choose **Edit Desktop** to add, move, resize, and customize widgets. Open preferences for the full set of icon and widget controls; search helps you find a setting quickly.

Desktop icons are on initially. Turn on widgets in **Desktop Widgets → Show desktop widgets**. Icons and widgets can be enabled independently.

Weather uses network access. Now Playing follows compatible media players; its optional visualizer uses Python 3, `pactl`, and `parec`.

## Install

Requires **GNOME Shell 50 on Wayland**, GJS, GTK 4, and libadwaita. Disable any other desktop-icon extension before enabling Luna Desktop.

Build the extension with Node.js 22+, pnpm, Python 3, and GLib schema tools:

```sh
git clone https://github.com/Wuild/luna-desktop.git
cd luna-desktop
pnpm install --frozen-lockfile
pnpm run pack
gnome-extensions install --force /tmp/luna-desktop-build/luna-desktop@wuild.shell-extension.zip
```

Log out and back in, then enable **Luna - Desktop** in GNOME’s Extensions app, or run:

```sh
gnome-extensions enable luna-desktop@wuild
```

After installing an update, log out and back in to load the new code. Your desktop files remain in your normal Desktop folder. Widget layouts, preferences, and saved content persist separately.

## Build a Luna desktop

Each extension works on its own. Combine the pieces you want:

| Project | What it brings |
| --- | --- |
| [Luna Taskbar](https://github.com/Wuild/luna-taskbar) | App groups, animated previews, a system tray, and calendar/system panels |
| [Luna Wallpaper](https://github.com/Wuild/luna-wallpaper) | Daily images and wallpaper rotation; adds **Change wallpaper** to Desktop’s context menu |
| [Luna Devkit](https://github.com/Wuild/luna-devkit) | A separate GNOME session for experimenting with the whole setup |

Also from the same author: [Mutter Unmuted](https://github.com/Wuild/mutter-unmuted), an experimental, opt-in Mutter/Xwayland patch pair for legacy X11 push-to-talk across GNOME on Wayland, including Discord. It is a separate system-level project, not required by Luna; read its compatibility and input-forwarding notes before installing.

## For tinkerers

Create your own GTK widgets using the [Widget API](docs/widget-api.md), or explore the [desktop settings guide](docs/desktop-settings.md). Custom widgets are trusted local code with your user’s permissions.

```sh
pnpm typecheck
pnpm test
pnpm test:shell
```

The Shell tests run in a disposable headless session. Build output is in `dist/`. Saved widget state and custom widgets live in `~/.local/share/luna-desktop/` (or your `XDG_DATA_HOME`).

## Feedback

[Report a bug or suggest an idea](https://github.com/Wuild/luna-desktop/issues). Include your distribution, GNOME version, monitor layout/scaling, and the steps to reproduce it. Screenshots help!

## License

Copyright © 2026 Wuild. Licensed under [GPL-2.0-or-later](LICENSE). You are welcome to use, study, modify, and redistribute it under those terms.
