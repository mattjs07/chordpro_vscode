#!/bin/bash

# Arguments
INPUT_FILE="$1"
OUTPUT_BASE="$2"

# Defaults
OPTIONS=""
SUFFIX=""
OUTPUT_FILE=""

# Read the first 10 lines and look for #'{options=...}, #'{suffix=...}, and #'{output=...}
head -n 10 "$INPUT_FILE" | while IFS= read -r line; do
    if [[ "$line" =~ ^#\{[[:space:]]*options[[:space:]]*=[[:space:]]*([^}]+)\} ]]; then
        OPTIONS="${BASH_REMATCH[1]}"
    fi
    if [[ "$line" =~ ^#\{[[:space:]]*suffix[[:space:]]*=[[:space:]]*\"?([^}\"]+)\"?\} ]]; then
        SUFFIX="${BASH_REMATCH[1]}"
    fi
    if [[ "$line" =~ ^#\{[[:space:]]*output[[:space:]]*=[[:space:]]*\"?([^}\"]+)\"?\} ]]; then
        OUTPUT_FILE="${BASH_REMATCH[1]}"
    fi
done

# Trim whitespace from SUFFIX and OPTIONS
SUFFIX="$(echo -n "$SUFFIX" | xargs)"
OPTIONS="$(echo -n "$OPTIONS" | xargs)"

# Build output filename
if [[ -z "$OUTPUT_FILE" ]]; then
    if [[ -n "$SUFFIX" ]]; then
        OUTPUT_FILE="${OUTPUT_BASE}_${SUFFIX}.pdf"
    else
        OUTPUT_FILE="${OUTPUT_BASE}.pdf"
    fi
fi

# Show the command that will be run
echo "Running: chordpro $OPTIONS \"$INPUT_FILE\" --output \"$OUTPUT_FILE\""

# Run it
chordpro $OPTIONS "$INPUT_FILE" --output "$OUTPUT_FILE"
