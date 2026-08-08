#!/usr/bin/env bash
# Produces the two tarballs that packer/backend-ami.pkr.hcl uploads:
#   packer/build/pulsemonitor-backend.tar.gz
#   packer/build/pulsemonitor-frontend.tar.gz
#
# Why tarballs and not packer's own directory upload: the file provisioner
# transfers a directory as one SCP put per file, and node_modules-heavy trees
# (thousands of small files) reliably trip "wait: remote command exited
# without exit status or exit signal". One archive sidesteps that.
#
# Why a script and not shell-local provisioners inside the template: packer
# validates a file provisioner's source at config-parse time, before any
# provisioner runs, so a shell-local step in the same build block cannot
# produce the file in time.
#
# Run from anywhere:  ./scripts/package-artifacts.sh
# Then:               cd packer && packer build -var="subnet_id=..." backend-ami.pkr.hcl
#
# NOTE: this installs backend/ and lambda/*/ with --omit=dev, which removes
# jest. Run unit tests BEFORE this, or re-run a plain `npm ci` afterwards.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

build_dir="packer/build"
stage_dir="$build_dir/frontend-stage"

echo "==> Frontend: install (with devDependencies) and production build"
# The frontend needs its devDependencies (next, typescript) to build at all,
# so it gets a full `npm ci`; only its traced standalone output ships.
(cd frontend && npm ci && npm run build)

for required in frontend/.next/standalone frontend/.next/static frontend/public; do
  [[ -d "$required" ]] || { echo "FATAL: expected $required after the build" >&2; exit 1; }
done

echo "==> Backend and Lambdas: production-only installs"
# These ship node_modules as-is onto the AMI / into the Lambda zip, so dev
# dependencies must not be present.
(cd backend && npm ci --omit=dev)
(cd lambda/pinger && npm ci --omit=dev)
(cd lambda/notifier && npm ci --omit=dev)

echo "==> Packaging"
rm -rf "$build_dir"
mkdir -p "$stage_dir/.next"

tar -czf "$build_dir/pulsemonitor-backend.tar.gz" -C backend .

# Next's standalone output deliberately omits static assets, so stage them in
# rather than shipping them as separate top-level directories on the AMI.
cp -r frontend/.next/standalone/. "$stage_dir/"
cp -r frontend/.next/static "$stage_dir/.next/static"
cp -r frontend/public "$stage_dir/public"
tar -czf "$build_dir/pulsemonitor-frontend.tar.gz" -C "$stage_dir" .

rm -rf "$stage_dir"

echo "==> Done"
ls -lh "$build_dir"/*.tar.gz
