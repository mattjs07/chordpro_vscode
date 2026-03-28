# chordpro-vscode

Edit, render, and build ChordPro songs in VSCode — with PDF preview, an interactive chord builder, auto-completion, syntax highlighting, auto-scroll preview, visual tab editor, chord diagram hover, and a guided rendering configurator.

## Features

- [x] Compile `.cho` files with **Render ChordPro PDF** (`Ctrl+Shift+B`)
- [x] **Preview ChordPro PDF** — renders and opens the PDF automatically in a side panel (`Ctrl+Shift+V`)
- [x] **Auto-scroll Preview** — renders the song as HTML and scrolls it automatically (`Ctrl+Alt+S`); tap tempo, section jump, lyrics-only mode, full-screen, live transpose, two-column layout, dark/light theme toggle, save as standalone HTML
- [x] Build on save (enable from extension settings)
- [x] **Rendering Parameters** — write config/options directly in the source file, with completion, hover docs, and a guided ⚙ configurator
- [x] **Interactive Chord Builder** — fretboard panel to build and insert chord definitions (`Ctrl+Alt+D`)
- [x] **Tab Editor** — visual 6-string grid to write tablature without typing dashes (`Ctrl+Alt+T`)
- [x] **Chord Analyzer** — opens Oolimo chord analyzer in a side panel (`Ctrl+Alt+A`)
- [x] **Auto-completion** — type `{` for directive suggestions, `[` for chord suggestions
- [x] Chords defined in the file (`{define:}`) and saved in the Chord Builder appear first in the `[` completion list
- [x] **Chord Diagram Hover** — hover over any `[chord]` token to see a fretboard diagram
- [x] **Document Outline** — lists the song title and all sections (Verse, Chorus, Bridge…) in the Outline panel (Explorer sidebar → Outline section)
- [x] **Go to Definition** — `Ctrl+click` a `[chord]` token to jump to its `{define:}` block
- [x] **Rename Chord** — right-click a chord → Rename Symbol to update every `[token]` and the `{define:}` block at once
- [x] **Section Folding** — fold `{start_of_chorus}` … `{end_of_chorus}` blocks like code
- [x] **Diagnostics** — info squiggle for chords with no known fingering; hint for unused `{define:}` blocks
- [x] **Syntax highlighting** — chords, directives, sections, comments
- [x] **Transpose** — shift all chords (or a selection) up/down by semitones, with musical interval labels
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
| Transpose Chords | — | Transpose all chords (or a selection) by any number of semitones |
| Show Concert Pitch Chords | — | Show the effective (concert pitch) chord names given the current `{capo:}` |
| Detect Key | — | Analyse all chords and suggest the key; optionally insert `{key:}` |

## Chord Diagram Hover

Hover over any `[chord]` token in your `.cho` file to see a fretboard diagram popup.

- Diagrams are shown for a built-in library of ~100 common chords (all roots × major, minor, 7th, maj7, sus, dim, aug, 6, 9, 11, 13, m7b5, mmaj7, 69, and more)
- **`{define:}` blocks in the file take priority** — if a chord is defined in the file, that exact fingering is shown instead of the built-in default
- Chords saved via the Chord Builder also override the built-in library (priority: file defines > Chord Builder > built-in)
- If no diagram is available, the chord name is shown in bold

## Chord Builder

Open the **Chord Builder** panel (`Ctrl+Alt+D` or from the panel at the bottom).

- Click strings and frets to place fingers on the fretboard
- The extension auto-detects the chord name from your finger positions
- Click a suggestion to fill the name field, or type your own
- Click **Insert definition** to insert the `{define: ...}` block into the active editor
- Saved chords appear at the top of the `[` auto-completion list
- Chords defined via `{define:}` in the file are also recognised — they appear in completions, the insert-from-list picker, and the hover diagram without needing to re-save them in the Chord Builder

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

Press `Ctrl+Alt+S` to render the current song as HTML and open it in **performance mode** — a clean, distraction-free side panel designed for playing along.

- The song is parsed and rendered directly — no ChordPro CLI needed for this view
- A floating control bar at the bottom lets you play/pause and adjust speed
- **Space** = play/pause · **↑** = faster · **↓** = slower
- Speed adjusts in 10 px/s increments (5–300 px/s); auto-stops at the end
- Re-running the command while the panel is open reloads the content
- **Auto-reload on save** — the preview refreshes automatically every time you save the file
- **Chord diagrams** — hover over any chord name in the preview to see a fretboard diagram popup (same fingering priority as the source hover: file `{define:}` > Chord Builder > built-in library)
- **Tempo-based speed** — if the file contains `{tempo: N}`, the scroll speed is auto-set so the song scrolls at the right pace (1 bar per chord line); a ♩ button appears in the control bar (gold when active); click it any time to snap back to tempo speed
- **Tap tempo** — click **Tap** (or press `T`) to tap the beat; BPM is averaged from the last 8 taps and sets the scroll speed automatically; resets if no tap for 3 seconds
- **Section jump** — click **§** to open a section list; click any entry to scroll smoothly to that part of the song
- **Lyrics-only mode** — click **Ly** (or press `L`) to fade out all chord symbols; the layout is preserved so lines don't shift
- **Full-screen** — click **⤢** (or press `F`) to enter full-screen mode (shown in browsers; `⤡` to exit); keyboard shortcut works in the saved HTML too
- **Live transpose** — ♭ / ♯ buttons in the control bar shift all chord names in the view by semitones without touching the source file; counter shows current offset (gold when non-zero)
- **Two-column layout** — ⊞ button toggles two-column mode; useful for long songs
- **Theme toggle** — 🌙/☀️ button manually overrides the OS dark/light preference
- **Scroll position memory** — auto-reload on save restores your scroll position
- **Save as HTML** — click the 💾 button to save a standalone `{basename}_preview.html` to disk; works in any browser with all controls functional
- **Dark mode** — automatically adapts to the OS dark/light theme (`prefers-color-scheme`); overridable per-session with the theme toggle button
- **Font size controls** — A− / A+ buttons in the control bar to resize text (11–28 px); tempo speed recalculates automatically
- **Capo badge** — capo number shown as a distinct pill badge in the song header
- **Progress bar** — thin bar at the top of the page shows scroll position
- **Print-friendly** — `@media print` stylesheet hides controls and renders cleanly on paper

## Transposing

There are two ways to transpose a song, and they serve different purposes:

**1. `{transpose: N}` directive** (ChordPro CLI)

Add `{transpose: 2}` anywhere in your `.cho` file. The CLI will apply the transposition at render time — the chord names in the source are unchanged.

- ✓ PDF output is transposed
- ✗ Auto-scroll HTML preview is **not** affected (our JS renderer ignores this directive)
- ✓ Non-destructive — remove the directive to revert instantly

**2. Transpose Chords command** (this extension)

Open the command palette (`Ctrl+Shift+P`) → **Transpose Chords**. Pick an interval or enter a custom number of semitones.

- ✓ Rewrites chord names directly in the source file (`[Am]` → `[Bm]`)
- ✓ PDF output is transposed (source reflects the new key)
- ✓ Auto-scroll HTML preview is transposed (reads from source)
- ✓ Apply to the whole file or just a selection
- ✓ Fully undoable with `Ctrl+Z`

**Rule of thumb:** use `{transpose}` for a quick one-off PDF in a different key; use the **Transpose Chords** command when you want to permanently change the key across all outputs.

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

### 1.6.0
- **Tap tempo** — tap `T` (or the Tap button) to measure BPM from your rhythm; auto-sets scroll speed; averages last 8 taps, resets after 3 s idle
- **Section jump** — `§` button opens a popup list of all song sections; click to scroll smoothly to any section
- **Lyrics-only mode** — `L` key or **Ly** button fades out chord symbols without shifting layout (CSS opacity transition)
- **Full-screen** — `F` key or **⤢** button; available in saved HTML and in browsers (not in the VSCode webview)

### 1.5.0
- **Live transpose in preview** — ♭ / ♯ buttons in the control bar shift all displayed chord names without modifying the source; offset shown in gold when non-zero
- **Two-column layout** — ⊞ button toggles two-column mode in the performance view
- **Theme toggle** — 🌙/☀️ button overrides OS dark/light preference per-session
- **Scroll position memory** — auto-reload on save now restores scroll position instead of jumping to top
- **Chord hover: usage count** — hover tooltip now shows how many times the chord appears in the file
- **Capo Helper** — command palette: *Show Concert Pitch Chords* — shows what chords other instruments hear given the `{capo:}` value
- **Detect Key** — command palette: *Detect Key* — analyses chords and suggests the key; offers to insert `{key:}` if missing

### 1.4.0
- **Dark mode** — preview auto-adapts to OS dark/light theme via `prefers-color-scheme`
- **Font size controls** — A− / A+ buttons in the control bar (11–28 px range)
- **Capo badge** — capo number rendered as a distinct gold pill in the song header
- **Progress bar** — thin bar at the top tracks scroll position through the song
- **Print stylesheet** — `@media print` hides controls and produces a clean printed output

### 1.3.0
- **Tempo-based scroll speed** — if `{tempo: N}` is in the file, scroll speed is auto-calculated (1 bar per chord line); ♩ button appears in the control bar (gold = active), click to snap back to tempo speed at any time; speed increments changed to ±5 px/s
- **Save as HTML** — 💾 button saves a self-contained `{basename}_preview.html` to disk; works in any browser with all controls functional

### 1.2.0
- **Auto-scroll preview auto-reload** — preview panel now refreshes automatically on every file save (no need to re-run the command)
- **Chord diagrams in the preview** — hover over any chord name in the performance view to see a fretboard diagram tooltip; fingering priority matches the source hover (file `{define:}` > Chord Builder > built-in library); diagrams update on reload

### 1.1.0
- **Document Outline** — song title and every section (Verse, Chorus, Bridge, Tab, Grid…) appear in the Outline panel (Explorer sidebar → Outline section, at the bottom); sections with a `label=` attribute or `: label` show their custom label, duplicates are auto-numbered
- **Go to Definition** — `Ctrl+click` any `[chord]` token to jump to its `{define:}` block in the same file
- **Rename Chord** — right-click a chord → *Rename Symbol* (`F2`) to rename it everywhere: all `[token]` occurrences and the `{define:}` block are updated atomically and are fully undoable
- **Section Folding** — `{start_of_chorus}` … `{end_of_chorus}` (and all other section pairs) fold and unfold like code blocks
- **Diagnostics**:
  - *Info* squiggle on any `[chord]` that has no known fingering (not in the file, Chord Builder, or built-in library) — suggests adding a `{define:}` or using the Chord Builder
  - *Hint* on any `{define:}` whose chord name never appears as a `[token]` in the song

### 1.0.0
- Added **Chord Diagram Hover** — hover over any `[chord]` token to see an SVG fretboard popup
- Built-in fingering library covering ~100 chords: all roots × major, minor, 7th, maj7, sus2/4, add9, dim, dim7, aug, 5, 6, m6, 9, maj9, 11, 13, maj13, 69, 7sus4, 7b9, 7#9, 7b5, 7#5, m7b5, mmaj7
- `{define:}` blocks in the file are parsed automatically — their fingerings appear in the hover diagram, chord completions, and insert-from-list picker without any manual save step
- Chord Builder saved chords also override the built-in library (priority: file defines > Chord Builder > built-in)

### 0.9.0
- Added **Transpose Chords** command (command palette: "Transpose Chords")
- Transposes all `[chord]` tokens in the document, or only the selected text
- QuickPick with common intervals: half step, whole step, minor/major third, fourth, tritone (±1 to ±6), plus custom input
- Also updates `{key: ...}` directives automatically
- Correctly preserves sharp/flat spelling (flat notes stay flat, sharp notes stay sharp)
- Slash chords (e.g. `[G/B]`) have both root and bass transposed

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
