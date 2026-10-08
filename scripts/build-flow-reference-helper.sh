#!/bin/sh
set -eu
# Reproducible helper build; does not replace the existing flow engine.
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENGINE=${FLOW_ENGINE_DIR:-"$ROOT/flow-drama-autopilot/flow-agent-ref/flow-agent"}
REV=70ec73861091267dd1f57184bcf809a922bea85b
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT HUP INT TERM
git -C "$WORK" init -q
git -C "$WORK" remote add origin https://github.com/kodelyx/flow-go.git
git -C "$WORK" fetch -q --depth 1 origin "$REV"
git -C "$WORK" checkout -q --detach FETCH_HEAD
mkdir -p "$WORK/flow-go/cmd/huobao-reference" "$ENGINE/bin"
cp "$ROOT/scripts/flow-reference-helper/main.go" "$WORK/flow-go/cmd/huobao-reference/main.go"
cp "$ROOT/scripts/flow-reference-helper/main_test.go" "$WORK/flow-go/cmd/huobao-reference/main_test.go"
cd "$WORK/flow-go"
NAME=flow-reference-helper
GOTOOLCHAIN=auto go test ./cmd/huobao-reference
if [ "${GOOS:-$(go env GOOS)}" = windows ]; then NAME=flow-reference-helper.exe; fi
GOTOOLCHAIN=auto go build -trimpath -o "$WORK/$NAME" ./cmd/huobao-reference
cp "$WORK/$NAME" "$ENGINE/bin/$NAME"
printf 'Built %s/bin/%s from %s\n' "$ENGINE" "$NAME" "$REV"