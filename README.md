# chordpro-vscode

Edit, render, and build ChordPro songs in VSCode — with PDF preview, an interactive chord builder, and smart auto-completion.

## Features

- [x] Compile `.cho` files with **Render ChordPro PDF** (`Ctrl+Shift+B`)
- [x] **Preview ChordPro PDF** — renders and opens the PDF automatically in a side panel (`Ctrl+Shift+V`)
- [x] Build on save (enable from extension settings)
- [x] Write rendering parameters directly in source code
- [x] **Interactive Chord Builder** — fretboard panel to build and insert chord definitions
- [x] **Auto-completion** — type `{` for directive suggestions, `[` for chord suggestions
- [x] Chords saved in the Chord Builder appear first in the `[` completion list
- [x] **Syntax highlighting** — chords, directives, sections, comments
- [ ] Ultimate Guitar to/from ChordPro converter based on [ChordSheetJS](https://github.com/martijnversluis/ChordSheetJS)
- [ ] Auto-scrolling

## Commands

| Command | Shortcut | Description |
|---|---|---|
| Render ChordPro PDF | `Ctrl+Shift+B` | Compile and render the active `.cho` file |
| Preview ChordPro PDF | `Ctrl+Shift+V` | Render and open PDF beside the editor |
| Open Chord Builder | `Ctrl+Alt+D` | Open the interactive fretboard panel |
| Insert Chord by Name | `Ctrl+I` | Insert a saved chord by typing its name |
| Insert Chord from List | `Ctrl+L` | Pick a saved chord from a quick-pick list |
| Open ChordPro Minimal Template | — | Blank template to start a new song |
| Open ChordPro Example Template | — | Example file (Yesterday by The Beatles) |

## Chord Builder

Open the **Chord Builder** panel (`Ctrl+Alt+D` or from the panel at the bottom).

- Click strings and frets to place fingers on the fretboard
- The extension auto-detects the chord name from your finger positions
- Click a suggestion to fill the name field, or type your own
- Click **Insert definition** to insert the `{define: ...}` block into the active editor
- Saved chords appear at the top of the `[` auto-completion list

## Auto-completion

Auto-completion activates automatically in `.cho` / `.chordpro` files.

- Type `{` → suggestions for all ChordPro directives (`title`, `key`, `start_of_chorus`, `define`, …)
- Type `[` → suggestions for chords — your saved chords appear first, followed by all standard chords

## Rendering Parameters

Parameters can be written in the first 25 lines of your `.cho` file:

```
# {options = -l}
# {suffix = "lyrics_only"}
# {output = mysong_out.pdf}
# {config = "dark"}
```

- **config** can be a [preset name](https://www.chordpro.org/chordpro/chordpro-configuration-presets/#preset-configurations) (`modern1`, `dark`, …) or a path to a `.json` file (absolute or relative to the `.cho` file). Defaults to `modern1`.
- **suffix** is appended to the output filename: `mysong_lyrics_only.pdf`
- **output** sets the output filename directly

## Requirements

Install ChordPro from the [official website](https://www.chordpro.org/chordpro/chordpro-installation/) and make sure to **add chordpro to your system PATH**.

## Workflow

1. Open a template: **Open ChordPro Minimal Template** or **Open ChordPro Example Template**
2. Write your song — use `{` and `[` auto-completion to insert directives and chords
3. Use the **Chord Builder** to define custom chord fingerings
4. Press `Ctrl+Shift+V` to render and open the PDF preview beside the editor
5. Enable **Build on save** in settings to auto-render on every `Ctrl+S`

*Note: if you change the suffix or output filename, you need to open the new PDF file once for it to auto-refresh.*

## Advice

- Use `.cho` as your file extension — the extension registers it as ChordPro automatically
- Combine with [ChordPro by ricardomfmsousa](https://marketplace.visualstudio.com/items/?itemName=ricardomfmsousa.chordpro) for syntax highlighting

## Release Notes

### 0.1.0
- Added interactive Chord Builder with fretboard webview
- Added Preview ChordPro PDF command (renders + opens beside editor)
- Added auto-completion for directives (`{`) and chords (`[`)
- Saved chords from the Chord Builder appear first in chord completions
- Registered `.cho` / `.chordpro` / `.chopro` as ChordPro language

### 0.0.1
Initial release with basic render and template functions.

---

## Online Tools

Some great websites for ChordPro editing:

- [Songcraft.io](https://songcraft.io/) — BPM, autoscrolling, visual editor, chord progressions, collaboration. 5 free songs, then ~4€/month.
- [Chordly.io](https://chordly.io/) — Metronome, autoplay. Free as of 2025.

**Enjoy!!**
