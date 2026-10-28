#!/bin/sh
set -eu
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT HUP INT TERM
curl --fail --silent --show-error --max-time 30 https://hellohop.app/docs/openapi.json -o "$work/openapi.json"
deno run --no-remote --no-npm --deny-net --allow-read="fixtures,$work" --allow-write="$work/issue.md" scripts/openapi-diff.ts "$work/openapi.json" "$work/issue.md"
if [ ! -s "$work/issue.md" ]; then exit 0; fi
issue=$(gh issue list --state open --search 'in:title "openapi.json changed"' --json number,title --jq '.[] | select(.title == "openapi.json changed") | .number' | head -n 1)
if [ -n "$issue" ]; then
  gh issue edit "$issue" --body-file "$work/issue.md"
else
  gh issue create --title 'openapi.json changed' --body-file "$work/issue.md"
fi
