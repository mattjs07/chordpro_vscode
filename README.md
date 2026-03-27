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
| Open Chord Analyzer | `Ctrl+Alt+A` | Open Oolimo chord analyzer in a side panel |
| Auto-scroll Preview | `Ctrl+Alt+S` | Render to HTML and open an auto-scrolling preview |
| Open Tab Editor | `Ctrl+Alt+T` | Visual tab editor — click cells, type fret numbers, insert tab |

## Chord Builder

Open the **Chord Builder** panel (`Ctrl+Alt+D` or from the panel at the bottom).

- Click strings and frets to place fingers on the fretboard
- The extension auto-detects the chord name from your finger positions
- Click a suggestion to fill the name field, or type your own
- Click **Insert definition** to insert the `{define: ...}` block into the active editor
- Saved chords appear at the top of the `[` auto-completion list

## Auto-completion

Auto-completion activates automatically in `.cho` / `.chordpro` files.

- Type `{` → suggestions for all ChordPro directives (`title`, `key`, `start_of_chorus`, `define`, font/colour directives, …)
- Type `[` → suggestions for chords — your saved chords appear first, followed by all standard chords (including extensions like `7b9`, `maj7`, `dim7`, …)

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
- **options** passes extra CLI flags verbatim, e.g. `-l`, `--toc`, `--no-chord-grids`, `--page-size=a4`

Hover over any `# {key = ...}` line to see a description, valid values, and common flags. Click **⚙ Configure rendering** (CodeLens at line 1) to use a guided picker UI.

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

### 0.8.0
- Added **Tab Editor** (`Ctrl+Alt+T`): visual grid with 6 string lines
- Click a cell to select it, type fret numbers (0–24), backspace to clear
- Arrow keys and Tab to navigate between cells
- **+ Column** adds a position, **| Bar** inserts a bar line, **Delete last** removes the last column
- **Clear** empties all values, **Insert tab** wraps output in `{start_of_tab}` / `{end_of_tab}` and inserts at cursor
- Live tab preview shown below the grid

### 0.7.0
- Added **Auto-scroll Preview** (`Ctrl+Alt+S`): renders the song to HTML and opens it in a side panel with a floating control bar
- Controls: Play/Pause, Faster (+10 px/s), Slower (−10 px/s), speed display
- Keyboard shortcuts in the preview: `Space` = play/pause, `↑`/`↓` = speed
- Auto-stops at the end of the song
- Re-running the command on an updated file reloads the preview panel

### 0.6.0
- Added **Chord Analyzer** panel (`Ctrl+Alt+A`): opens Oolimo in a side panel
- If the cursor is inside a `[Chord]` token, the chord name is pre-filled automatically
- Falls back to opening in the system browser if Oolimo blocks the embedded iframe

### 0.5.0
- Expanded directive completions: `sorttitle`, `sortartist`, `tag`, `chorus`, `highlight`, `start_of_abc/ly/svg`, font/colour directives, `transpose`, and more
- Expanded chord completions: `7b9`, `7#9`, `maj9`, `dim7`, `mmaj7`, `m7b5`, and other extended qualities
- Syntax highlighting now covers `start_of_abc/ly/svg`, `chorus`, `sob/eob`, `sog/eog` section markers
- Options helper: hover over `# {options = ...}` now shows a full list of common CLI flags
- Options helper: **⚙ Configure rendering** CodeLens now offers a flag picker for the `options` field

### 0.1.0
- Added interactive Chord Builder with fretboard webview
- Added Preview ChordPro PDF command (renders + opens beside editor)
- Added auto-completion for directives (`{`) and chords (`[`)
- Saved chords from the Chord Builder appear first in chord completions
- Registered `.cho` / `.chordpro` / `.chopro` as ChordPro language
- Added syntax highlighting with TextMate grammar
- Added options helper: completion, hover tooltip, and CodeLens for `# {key = value}` rendering params

### 0.0.1
Initial release with basic render and template functions.

---

## Online Tools

Some great websites for ChordPro editing:

- [Songcraft.io](https://songcraft.io/) — BPM, autoscrolling, visual editor, chord progressions, collaboration. 5 free songs, then ~4€/month.
- [Chordly.io](https://chordly.io/) — Metronome, autoplay. Free as of 2025.

**Enjoy!!**
