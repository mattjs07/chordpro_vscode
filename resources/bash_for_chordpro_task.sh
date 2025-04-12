#!/bin/bash

# Arguments
INPUT_FILE="$1"
OUTPUT_FILE="$2"
CONFIG="$3"
OPTIONS="$4"

# Show the command that will be run
echo "Running: chordpro $OPTIONS \"$INPUT_FILE\" --output \"$OUTPUT_FILE\""

# Run it
chordpro $OPTIONS "$INPUT_FILE" --output "$OUTPUT_FILE" --config=$CONFIG
