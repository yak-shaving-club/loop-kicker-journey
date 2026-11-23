#!/bin/sh
# Container start: copies the bundled ghost rides into GHOSTRIDES_DIR (without overwriting existing files)
# and starts the server. Seeding here instead of in the image also works for bind-mounted host folders,
# which hide everything the image put below /data.
set -u

BUNDLED_GHOSTRIDES_DIR=/app/data/ghostrides
GHOSTRIDES_DIR="${GHOSTRIDES_DIR:-$BUNDLED_GHOSTRIDES_DIR}"
SCORES_FILE="${ESCARGOZZLED_SCORES_FILE:-/app/escargozzled/scores.json}"

if [ "$GHOSTRIDES_DIR" != "$BUNDLED_GHOSTRIDES_DIR" ]; then
    if mkdir -p "$GHOSTRIDES_DIR" 2>/dev/null; then
        for source in "$BUNDLED_GHOSTRIDES_DIR"/*.loop-kicker-journey-ghost.json; do
            [ -e "$source" ] || continue
            target="$GHOSTRIDES_DIR/$(basename "$source")"
            if [ ! -e "$target" ]; then
                cp "$source" "$target" 2>/dev/null \
                    && echo "Added bundled ghost ride $(basename "$source")" \
                    || echo "WARNING: could not copy $(basename "$source") to $GHOSTRIDES_DIR"
            fi
        done
    else
        echo "WARNING: cannot create $GHOSTRIDES_DIR; bundled ghost rides are not available"
    fi
fi

SCORES_DIR="$(dirname "$SCORES_FILE")"
# The server writes highscores to a temp file and renames it, so only the folder needs to be writable
WRITE_PROBE="$SCORES_DIR/.write-test-$$"
if touch "$WRITE_PROBE" 2>/dev/null; then
    rm -f "$WRITE_PROBE"
else
    echo "WARNING: $SCORES_DIR is not writable for user $(id -u):$(id -g); highscores cannot be saved." \
        "Give the mounted folder to that user, e.g. chown -R $(id -u):$(id -g) <host folder>"
fi

exec node server.js
