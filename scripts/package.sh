#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
out_dir=${1:-/tmp/luna-desktop-build}
mkdir -p "$out_dir"
out_dir=$(cd "$out_dir" && pwd)
pnpm build
cd dist
gnome-extensions pack --extra-source=LICENSE --extra-source=LICENSE-NOTICE --force --out-dir "$out_dir" --extra-source=desktop --extra-source=icons --extra-source=widgets --extra-source=shell --extra-source=settings --extra-source=preferences .
