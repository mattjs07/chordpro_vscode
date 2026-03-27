# chordpro-vscode

Edit, render, and build ChordPro songs in VSCode — with PDF preview, an interactive chord builder, auto-completion, syntax highlighting, auto-scroll preview, visual tab editor, and a guided rendering configurator.

## Features

- [x] Compile `.cho` files with **Render ChordPro PDF** (`Ctrl+Shift+B`)
- [x] **Preview ChordPro PDF** — renders and opens the PDF automatically in a side panel (`Ctrl+Shift+V`)
- [x] **Auto-scroll Preview** — renders the song as HTML and scrolls it automatically (`Ctrl+Alt+S`)
- [x] Build on save (enable from extension settings)
- [x] **Rendering Parameters** — write config/options directly in the source file, with completion, hover docs, and a guided ⚙ configurator
- [x] **Interactive Chord Builder** — fretboard panel to build and insert chord definitions (`Ctrl+Alt+D`)
- [x] **Tab Editor** — visual 6-string grid to write tablature without typing dashes (`Ctrl+Alt+T`)
- [x] **Chord Analyzer** — opens Oolimo chord analyzer in a side panel (`Ctrl+Alt+A`)
- [x] **Auto-completion** — type `{` for directive suggestions, `[` for chord suggestions
- [x] Chords saved in the Chord Builder appear first in the `[` completion list
- [x] **Syntax highlighting** — chords, directives, sections, comments
- [ ] Ultimate Guitar to/from ChordPro converter

## Commands

| Command | Shortcut | Description |
|---|---|---|
| Render ChordPro PDF | `Ctrl+Shift+B` | Compile and render the active `.cho` file to PDF |
| Preview ChordPro PDF | `Ctrl+Shift+V` | Render and open PDF beside the editor |
| Auto-scroll Preview | `Ctrl+Alt+S` | Render to HTML and open an auto-scrolling performance view |
| Open Chord Builder | `Ctrl+Alt+D` | Open the interactive fretboard panel |
| Insert Chord by Name | `Ctrl+I` | Insert a saved chord by typing its name |
| Insert Chord from List | `Ctrl+L` | Pick a saved chord from a quick-pick list |
| Open Tab Editor | `Ctrl+Alt+T` | Visual tab editor — click cells, type fret numbers, insert tab |
| Open Chord Analyzer | `Ctrl+Alt+A` | Open Oolimo chord analyzer in a side panel |
| Open ChordPro Minimal Template | — | Blank template to start a new song |
| Open ChordPro Example Template | — | Example file (Yesterday by The Beatles) |
| Configure ChordPro Rendering | — | Guided UI to set config, options, suffix, output (also via ⚙ CodeLens) |

## Chord Builder

Open the **Chord Builder** panel (`Ctrl+Alt+D` or from the panel at the bottom).

- Click strings and frets to place fingers on the fretboard
- The extension auto-detects the chord name from your finger positions
- Click a suggestion to fill the name field, or type your own
- Click **Insert definition** to insert the `{define: ...}` block into the active editor
- Saved chords appear at the top of the `[` auto-completion list

## Tab Editor

Open the **Tab Editor** (`Ctrl+Alt+T`). A visual 6-string grid appears beside the editor.

- Click any cell to select it, then type the fret number (0–24)
- **Backspace** clears a cell; **Enter** / **→** advances to the next cell
- **↑ ↓** switches between strings; **← →** moves between columns
- **+ Column** adds a new position at the end
- **| Bar** inserts a bar line after the selected column (or at the end)
- **Delete last** removes the rightmost column; **Clear** empties all values
- A live tab preview is shown below the grid
- **Insert tab** wraps the result in `{start_of_tab}` / `{end_of_tab}` and inserts it at the cursor

## Auto-scroll Preview

Press `Ctrl+Alt+S` to render the current song as HTML and open it in a side panel.

- The song is parsed and rendered directly — no ChordPro CLI needed for this view
- A floating control bar at the bottom lets you play/pause and adjust speed
- **Space** = play/pause · **↑** = faster · **↓** = slower
- Speed adjusts in 10 px/s increments (5–300 px/s); auto-stops at the end
- Re-running the command while the panel is open reloads the content

## Auto-completion

Auto-completion activates automatically in `.cho` / `.chordpro` files.

- Type `{` → suggestions for all ChordPro directives (`title`, `key`, `capo`, `start_of_chorus`, `define`, font/colour directives, `transpose`, …)
- Type `[` → suggestions for chords — your saved chords appear first, followed by all standard chords (including extensions like `7b9`, `7#9`, `maj7`, `dim7`, `mmaj7`, …)

## Rendering Parameters

Parameters can be written in the first 25 lines of your `.cho` file:

```
# {config = "modern1"}
# {options = -l}
# {suffix = "lyrics_only"}
# {output = mysong_out.pdf}
```

| Parameter | Description |
|---|---|
| `config` | Preset name (`modern1`, `dark`, …) or path to a `.json` config file |
| `options` | Extra CLI flags passed verbatim (e.g. `-l`, `--toc`, `--no-chord-grids`) |
| `suffix` | Appended to the output filename: `mysong_<suffix>.pdf` |
| `output` | Full output filename, overrides the default |

### Three ways to configure rendering

**1. Auto-completion** — type `# {` on any line in the first 25 lines to get a dropdown of the four parameters. For `config`, a snippet choice list of all presets is offered automatically.

**2. Hover tooltip** — hover over any `# {key = ...}` line to see a description, the current value, valid presets (for `config`), and a full list of common CLI flags (for `options`).

**3. ⚙ Configure rendering (CodeLens)** — click the **⚙ Configure rendering** button that appears above line 1 of any `.cho` file. A guided multi-step UI lets you:
- Pick a parameter (`config`, `options`, `suffix`, `output`)
- For `config`: choose from a preset list or enter a custom JSON path
- For `options`: choose from a list of 20 common CLI flags or enter custom flags
- For `suffix` / `output`: type a value in an input box
- The line is inserted or updated automatically in the file

## Requirements

Install ChordPro from the [official website](https://www.chordpro.org/chordpro/chordpro-installation/) and make sure to **add chordpro to your system PATH**. Required for PDF rendering; not needed for the auto-scroll HTML preview or the tab editor.

## Workflow

1. Open a template: **Open ChordPro Minimal Template** or **Open ChordPro Example Template**
2. Write your song — use `{` and `[` auto-completion to insert directives and chords
3. Use the **Chord Builder** to define custom chord fingerings
4. Use the **Tab Editor** to write tablature sections visually
5. Click **⚙ Configure rendering** (line 1) to set the config preset and any CLI options
6. Press `Ctrl+Shift+V` to render and open the PDF preview beside the editor
7. Press `Ctrl+Alt+S` for a scrollable HTML performance view
8. Enable **Build on save** in settings to auto-render on every `Ctrl+S`

*Note: if you change the suffix or output filename, you need to open the new PDF file once for it to auto-refresh.*

## Advice

- Use `.cho` as your file extension — the extension registers it as ChordPro automatically
- The `config` preset `modern1` is a good default; try `dark` for a dark-themed PDF

## Release Notes

### 0.8.0
- Added **Tab Editor** (`Ctrl+Alt+T`): visual grid with 6 string lines
- Click a cell to select it, type fret numbers (0–24), backspace to clear
- Arrow keys and Tab to navigate between cells
- **+ Column**, **| Bar**, **Delete last**, **Clear**, **Insert tab** controls
- Live tab preview shown below the grid

### 0.7.0
- Added **Auto-scroll Preview** (`Ctrl+Alt+S`): built-in ChordPro parser + HTML renderer, no CLI needed
- Floating control bar: Play/Pause, Faster, Slower, speed display
- Keyboard: `Space` = play/pause, `↑`/`↓` = speed; auto-stops at bottom
- Re-running the command reloads the panel content

### 0.6.0
- Added **Chord Analyzer** panel (`Ctrl+Alt+A`): opens Oolimo in a side panel
- Falls back to opening in the system browser if the site blocks the embedded iframe

### 0.5.0
- Expanded directive completions: `sorttitle`, `sortartist`, `tag`, `chorus`, `highlight`, `start_of_abc/ly/svg`, font/colour directives, `transpose`, and more
- Expanded chord completions: `7b9`, `7#9`, `maj9`, `dim7`, `mmaj7`, `m7b5`, and other extended qualities
- Syntax highlighting: `start_of_abc/ly/svg`, `chorus`, `sob/eob`, `sog/eog`
- Options helper: hover shows full CLI flag list; **⚙ Configure rendering** CodeLens offers a flag picker for `options`

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

- [Songcraft.io](https://songcraft.io/) — BPM, autoscrolling, visual editor, chord progressions, collaboration
- [Chordly.io](https://chordly.io/) — Metronome, autoplay. Free as of 2025
- [Oolimo](https://www.oolimo.com/en/guitar-chords/analyze) — Guitar chord analyzer and diagram lookup

**Enjoy!!**
