#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
VERSION_FILE="$SCRIPT_DIR/version.txt"

if [ ! -f "$VERSION_FILE" ]; then
    echo "Missing version file: $VERSION_FILE" >&2
    exit 1
fi

current_version=$(cat "$VERSION_FILE")
case "$current_version" in
    ''|*[!0-9.]*|.*|*..*|*.)
        echo "Invalid version in $VERSION_FILE: $current_version" >&2
        exit 1
        ;;
esac

old_ifs=$IFS
IFS=.
set -- $current_version
IFS=$old_ifs
if [ "$#" -ne 3 ]; then
    echo "Version must have major.minor.patch format: $current_version" >&2
    exit 1
fi

major=$1
minor=$2
patch=$3
patch_number=$(printf '%s' "$patch" | sed 's/^0*//')
[ -n "$patch_number" ] || patch_number=0
next_patch=$((patch_number + 1))
next_version="$major.$minor.$next_patch"

build_succeeded=0
version_tmp=''
restore_version() {
    if [ "$build_succeeded" -ne 1 ]; then
        printf '%s\n' "$current_version" > "$VERSION_FILE"
    fi
    if [ -n "$version_tmp" ]; then
        rm -f "$version_tmp"
    fi
}
trap restore_version EXIT
trap 'exit 1' HUP INT TERM

version_tmp=$(mktemp "$SCRIPT_DIR/.version.txt.XXXXXX")
printf '%s\n' "$next_version" > "$version_tmp"
chmod 644 "$version_tmp"
mv "$version_tmp" "$VERSION_FILE"
version_tmp=''

cd "$SCRIPT_DIR"
docker buildx build --no-cache --push --platform linux/amd64 \
    --tag "jonitooo/loop-kicker-journey:$next_version" \
    --tag jonitooo/loop-kicker-journey:latest .
build_succeeded=1
