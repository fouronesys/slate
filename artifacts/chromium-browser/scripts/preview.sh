#!/usr/bin/env bash
set -euo pipefail

# Never carry the Linux preview's sandbox/GPU exceptions over to a Mac.
unset NODE_OPTIONS
if [ "$#" -eq 0 ]; then set -- .; fi
if [ "$(uname -s)" != "Linux" ]; then
  exec electron "$@"
fi

# The Replit desktop preview uses NixOS. Electron's binary needs these Nix
# library directories on its loader path; macOS development does not use this.
library_dirs="$(
  # Nix libraries live directly under each package's lib/. Do not recursively
  # scan the entire store: that can delay preview/tests by minutes.
  for library in /nix/store/*/lib/libgbm.so.1 /nix/store/*/lib/libxkbcommon.so.0 /nix/store/*/lib/libasound.so.2; do
    if [ -f "$library" ]; then printf '%s\n' "${library%/*}"; fi
  done | sort -u | paste -sd:
)"
export LD_LIBRARY_PATH="${library_dirs}${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec electron "$@" --no-sandbox --disable-gpu --disable-dev-shm-usage
