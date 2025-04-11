#!/bin/bash

# Arguments
INPUT_FILE="$1"
OUTPUT_BASE="$2"

# Defaults
OPTIONS=""
SUFFIX=""

# Read the first 5 lines and look for {options=...} and {suffix=...}
while IFS= read -r line; do
    if [[ "$line" =~ \{[[:space:]]*options[[:space:]]*=[[:space:]]*([^}]*)\} ]]; then
        OPTIONS="${BASH_REMATCH[1]}"
    fi
    if [[ "$line" =~ \{[[:space:]]*suffix[[:space:]]*=[[:space:]]*\"?([^}\"]+)\"?\} ]]; then
        SUFFIX="${BASH_REMATCH[1]}"
    fi

done < <(head -n 5 "$INPUT_FILE")

# Build output filename
if [[ -n "$SUFFIX" ]]; then
    OUTPUT_FILE="${OUTPUT_BASE}_${SUFFIX}.pdf"
else
    OUTPUT_FILE="${OUTPUT_BASE}.pdf"
fi

# Show the command that will be run
echo "Running: chordpro $OPTIONS \"$INPUT_FILE\" --output \"$OUTPUT_FILE\""

# Run it
chordpro $OPTIONS "$INPUT_FILE" --output "$OUTPUT_FILE"



