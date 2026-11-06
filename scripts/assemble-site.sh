#!/usr/bin/env bash
# Copy the public site (and nothing else) into the directory given as $1.
# Used by the Kokoroou/makerlens repo, which serves this tool at /events/ on
# https://makerlens.kokoroou.workers.dev. A new top-level file the site serves
# must be added here.
set -euo pipefail
out=${1:?usage: scripts/assemble-site.sh <out-dir>}
cd "$(dirname "$0")/.."
mkdir -p "$out"
cp -R index.html faq.html og-image.png css js vendor LICENSE README.md "$out"/
