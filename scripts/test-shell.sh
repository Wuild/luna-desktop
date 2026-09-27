#!/usr/bin/env bash
set -euo pipefail
project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
test_dir=$(mktemp -d /tmp/luna-desktop-shell.XXXXXX)
# A portal may leave a FUSE mount briefly while its private bus shuts down.
# Never traverse that mount, and do not turn a successful test into a cleanup failure.
trap 'rm -rf --one-file-system "$test_dir" 2>/dev/null || printf "Temporary portal mount remains at %s\n" "$test_dir" >&2' EXIT
mkdir -p "$test_dir"/{config,cache,data/gnome-shell/extensions,runtime}
mkdir -p "$test_dir/Desktop"
printf 'XDG_DESKTOP_DIR="%s/Desktop"\n' "$test_dir" > "$test_dir/config/user-dirs.dirs"
chmod 700 "$test_dir/runtime"
ln -s "$project_dir/dist" "$test_dir/data/gnome-shell/extensions/luna-desktop@wuild"
export XDG_CONFIG_HOME="$test_dir/config" XDG_CACHE_HOME="$test_dir/cache"
export XDG_DATA_HOME="$test_dir/data" XDG_RUNTIME_DIR="$test_dir/runtime"
export GSETTINGS_BACKEND=keyfile GIO_USE_VFS=local GTK_A11Y=none
export LUNA_TEST_ROOT="$project_dir"
export LUNA_SHELL_SCRIPT="${1:-$project_dir/tests/desktop-shell-smoke.js}"
dbus-run-session -- bash -c '
    gsettings set org.gnome.shell enabled-extensions "['"'"'luna-desktop@wuild'"'"']"
    gsettings set org.gnome.shell disable-user-extensions false
    gsettings set org.gnome.shell welcome-dialog-last-shown-version "50.4"
    timeout 75s gnome-shell --headless --wayland --no-x11 --virtual-monitor 1280x800 \
        --automation-script "$LUNA_SHELL_SCRIPT"
'
