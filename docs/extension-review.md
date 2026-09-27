# extensions.gnome.org submission review

Reviewed against the [GNOME Shell extension review guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html) on 2026-09-27. These checks prepare a submission; they do not constitute approval.

## Submission package

Use `pnpm run pack`. The ZIP contains readable transpiled JavaScript, GTK widget assets, XML schemas and GPL-2.0-or-later license notices. A package check rejects native libraries, typelibs, source maps, build/test files and unexpected Python helpers. Metadata declares clipboard use for file operations and widget text editing. The service assigns the extension version.

`pnpm run pack:local` is a separate package for personal installation. It may contain the optional native tiling helper and must not be submitted. Standard packages retain ordinary tiling but cannot offer the native constraints or experimental square-corner behavior. The native build remains available to developers outside the submission archive.

## Runtime review

- Shell controllers are created by `enable()` and released by `disable()`. GTK/GDK/libadwaita imports belong to the separate desktop process or preferences, not the Shell import graph.
- Window and layout connections, pending positioning/reflow sources, keyboard bindings, chrome, constraint objects and cached style settings have teardown paths. The previous Mutter edge-tiling preference is restored.
- The GTK desktop process is owned by the controller. Its audio capture children terminate on disposal; direct parent ownership replaces the Python visualizer helper. FFT and selected-player stream matching are implemented in GJS. `pactl` queries are asynchronous and bounded; `parec` captures only the selected stream.
- Preferences do not import Shell-only libraries. Clipboard access is user initiated. Weather requests and artwork downloads serve visible features; there is no telemetry implementation.
- Custom widgets are user-installed local code. Optional Wallpaper integration and coexistence with other tilers should be explained in the reviewer notes; this extension does not install or enable other extensions.

## Validation and submission notes

Run `pnpm test`, the desktop Shell smoke test, and the two-monitor snapping test. Exercise disable/re-enable, lock/unlock, window dragging, widget disposal and audio capture shutdown on GNOME Shell 50. Tests include synthetic audio routing/FFT/disposal without recording personal audio.

Explain the separate GTK desktop process in the submission: it provides desktop surfaces, file operations and interactive GTK widgets. Include exact reproduction steps for tiling and clipboard behavior. Reviewers may request changes to subprocess use or extension integration. The maintainer must understand and be able to explain submitted code, including tool-assisted changes.
