#!/usr/bin/env bash
# TDD structure check: every architecture layer must have a module scaffold
# with the standard main.tf / variables.tf / outputs.tf files.
set -euo pipefail

cd "$(dirname "$0")/.."

modules=(network compute storage monitoring dns)
files=(main.tf variables.tf outputs.tf)
missing=0

for m in "${modules[@]}"; do
  for f in "${files[@]}"; do
    path="modules/${m}/${f}"
    if [[ ! -f "$path" ]]; then
      echo "MISSING: $path"
      missing=1
    fi
  done
done

if [[ "$missing" -ne 0 ]]; then
  echo "FAIL: module scaffolding incomplete"
  exit 1
fi

echo "PASS: all module scaffolds present"
