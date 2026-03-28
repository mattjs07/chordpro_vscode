# ChordPro VSCode

**Write, rehearse, and perform your songs — without leaving VSCode.**

![Installs](https://img.shields.io/visual-studio-marketplace/i/mattjs07.chordpro-vscode?label=installs&color=blue)

ChordPro VSCode turns VSCode into a full-featured songwriting and performance environment. Write `.cho` files with rich auto-completion, visualise chord fingerings instantly, scroll through your setlist hands-free, and generate print-ready PDFs — all from the editor you already use.

---

## Highlights

| | |
|---|---|
| 🎸 **Chord diagrams everywhere** | Hover over any `[chord]` in the source *or* in the live preview to see an SVG fretboard diagram |
| 📜 **Auto-scroll performance view** | Full-screen HTML view with auto-scroll, tap tempo, metronome, section jump, live transpose, and more |
| 🎵 **Song Library & Setlist** | Browse your entire song folder, select a few songs, and launch a live setlist with one click |
| 🥁 **Metronome** | Web Audio click track that locks to `{tempo:}` or tap tempo — no external app needed |
| 🎛 **Visual Chord Builder** | Click strings and frets on an interactive fretboard; the chord name is detected automatically |
| 🎼 **Visual Tab Editor** | Build guitar tablature by clicking a grid — no dashes to type |
| 🔄 **Transpose** | Shift chords by any interval in the source, or preview in a different key without touching the file |
| 🔍 **Chord Analyzer** | Open Oolimo's chord analyzer in a side panel, without leaving VSCode |

---

## GIF Showcase

> *GIFs coming soon — see the sections below for a full description of each feature.*

| Feature | Preview |
|---|---|
| Auto-scroll performance view | `images/gif_autoscroll.gif` |
| Chord diagram hover (source + HTML) | `images/gif_hover.gif` |
| Chord Builder | `images/gif_chord_builder.gif` |
| Tab Editor | `images/gif_tab_editor.gif` |
| Song Library & Setlist | `images/gif_setlist.gif` |
| Oolimo Chord Analyzer | `images/gif_oolimo.gif` |

---

## Quick Start

1. Install the extension and open (or create) a `.cho` file
2. Press `Ctrl+Alt+S` to open the **Auto-scroll Preview**
3. Press **Space** to start scrolling — use the control bar to adjust speed, transpose, or jump to a section

No ChordPro CLI required for the preview. PDF rendering requires the [ChordPro CLI](https://www.chordpro.org/chordpro/chordpro-installation/) on your PATH.

---

## Commands & Shortcuts

### Performance & Preview

| Command | Shortcut | Description |
|---|---|---|
| Auto-scroll Preview | `Ctrl+Alt+S` | Render the song as HTML and open the performance view |
| Open Chord Analyzer | `Ctrl+Alt+A` | Open Oolimo in a side panel |
| Preview ChordPro PDF | `Ctrl+Shift+V` | Render and open the PDF beside the editor |
| Render ChordPro PDF | `Ctrl+Shift+B` | Compile the active `.cho` file to PDF |

### Auto-scroll controls (inside the preview)

| Key | Action |
|---|---|
| `Space` | Play / Pause |
| `↑` / `↓` | Faster / Slower (±5 px/s) |
| `T` | Tap tempo — sets scroll speed from your rhythm |
| `M` | Toggle metronome |
| `L` | Lyrics-only mode — hide chord symbols |
| `§` button | Section jump — click any section to scroll there |
| `F` | Full-screen (works in saved HTML / browsers) |
| `♭` / `♯` buttons | Live transpose — shift chords in the view without editing the file |
| `⊞` button | Two-column layout |
| `♩` button | Snap scroll speed back to tempo speed |
| `A−` / `A+` | Font size |
| `🌙` / `☀️` | Toggle dark / light theme |
| `💾` | Save as standalone HTML |

### Editing & Writing

| Command | Shortcut | Description |
|---|---|---|
| Open Chord Builder | `Ctrl+Alt+D` | Interactive fretboard panel to define custom chords |
| Insert Chord by Name | `Ctrl+I` | Insert a saved chord by typing its name |
| Insert Chord from List | `Ctrl+L` | Pick a saved chord from a quick-pick list |
| Open Tab Editor | `Ctrl+Alt+T` | Visual tab editor — click cells, type fret numbers |
| Transpose Chords | — | Shift all chords (or a selection) by any number of semitones |
| Show Concert Pitch Chords | — | Show the chords other instruments hear given the current `{capo:}` |
| Detect Key | — | Analyse all chords and suggest the key; optionally insert `{key:}` |

### Song Library & Setlist

| Command | Description |
|---|---|
| Set Library Folder (`📂` button) | Choose the root folder containing your `.cho` files (subfolders are scanned recursively) |
| Refresh Library (`⟳` button) | Re-scan the library folder |
| Play as Setlist (`▶` button) | Open selected songs (or all songs) in the Setlist Preview |
| Click a song | Open the `.cho` file in the editor |
| Right-click a song → Preview | Open the song in the Auto-scroll Preview |

**Setlist navigation:**

| Key | Action |
|---|---|
| `PageUp` / `PageDown` | Previous / Next song |
| `◀` / `▶` buttons | Previous / Next song |
| **Auto** button | Auto-advance to the next song when scroll reaches the end |

### Templates & Configuration

| Command | Description |
|---|---|
| Open ChordPro Minimal Template | Blank template to start a new song |
| Open ChordPro Example Template | Example file (Yesterday by The Beatles) |
| Configure ChordPro Rendering | Guided UI for config, options, suffix, output (also via ⚙ CodeLens above line 1) |

---

## Feature Details

### Chord Diagram Hover

Hover over any `[chord]` token — in your `.cho` source file *or* in the Auto-scroll HTML preview — to see an SVG fretboard diagram popup.

- Built-in library of ~100 chords (all roots × major, minor, 7th, maj7, sus, dim, aug, 6, 9, 11, 13, m7b5, mmaj7, 69, and more)
- `{define:}` blocks in the file take priority over the built-in library
- Chords saved via the Chord Builder also override the built-in defaults
- The hover tooltip also shows how many times the chord appears in the song

### Auto-scroll Performance View

Press `Ctrl+Alt+S` to render the song as HTML and open it in a clean, distraction-free performance view. No ChordPro CLI needed.

- **Tempo-based speed** — add `{tempo: 120}` to your file; scroll speed is calculated automatically so the song passes at the right pace. A `♩` button snaps back to tempo speed at any time.
- **Tap tempo** — tap `T` repeatedly to set BPM from your rhythm; averaged over the last 8 taps.
- **Metronome** — `M` key or `♪` button; Web Audio click track locked to the current BPM (from `{tempo:}` or tap tempo); beat 1 accented.
- **Live transpose** — `♭` / `♯` buttons shift all chord names in the view without touching the source file.
- **Section jump** — `§` button opens a numbered list of all sections; click to scroll smoothly.
- **Lyrics-only mode** — `L` key hides chord symbols while preserving layout.
- **Auto-reload on save** — the preview refreshes automatically every time you save, restoring scroll position.
- **Save as HTML** — `💾` button saves a fully self-contained `_preview.html` to disk; all controls work in any browser.

### Song Library & Setlist

Open the **Song Library** panel in the activity bar (music note icon).

1. Click `📂` to set your library folder — all `.cho` files in subfolders are found automatically
2. Songs are listed by title (from `{title:}`) with the artist as a subtitle
3. **Ctrl+click** or **Shift+click** to select specific songs
4. Click `▶` **Play as Setlist** to open the selected songs (or all songs if none are selected) in the Setlist Preview
5. In the Setlist Preview, use `PageUp` / `PageDown` or the `◀ ▶` buttons to navigate; enable **Auto** to advance automatically at the end of each song
6. The setlist can be saved as a standalone HTML file with the `💾` button

### Chord Builder

Open with `Ctrl+Alt+D` or from the panel at the bottom.

- Click strings and frets to place fingers on the fretboard
- The chord name is detected automatically from your finger positions
- Click **Insert definition** to insert the `{define:}` block at the cursor
- Saved chords appear at the top of the `[` auto-completion list and in the chord hover diagrams

### Tab Editor

Open with `Ctrl+Alt+T`.

- Click any cell to select it, then type the fret number (0–24)
- `Backspace` clears a cell; `Enter` / `→` advances to the next column; `↑` / `↓` moves between strings
- **+ Column** inserts a new column after the selected position
- **| Bar** inserts a bar line; **Delete last** removes the rightmost column; **Clear** empties all values
- A live tab preview is shown below the grid
- **Insert tab** wraps the result in `{start_of_tab}` / `{end_of_tab}` and inserts it at the cursor position in the source file

### Transposing

**Live transpose (preview only):** use the `♭` / `♯` buttons in the Auto-scroll or Setlist preview to shift chord display without modifying the source.

**Permanent transpose (source file):** command palette → **Transpose Chords** — pick a musical interval or enter a custom number of semitones. Updates all `[chord]` tokens and `{key:}` directives. Undoable with `Ctrl+Z`.

**For PDF only:** add `{transpose: 2}` in the file; the CLI applies it at render time without changing the source (note: the HTML preview ignores this directive).

### Auto-completion

- Type `{` → suggestions for all ChordPro directives; section pairs (`{start_of_chorus}` etc.) insert the closing tag automatically with the cursor placed between them
- Type `[` → chord suggestions; your saved and defined chords appear first
- Rendering parameters (`# {config = ...}`, etc.) have their own completions in the first 25 lines

### Chord Analyzer (Oolimo)

Press `Ctrl+Alt+A` to open [Oolimo](https://www.oolimo.com/en/guitar-chords/analyze) in a VSCode side panel — look up any chord, explore voicings, and analyse progressions without leaving the editor.

---

## Requirements

PDF rendering requires the [ChordPro CLI](https://www.chordpro.org/chordpro/chordpro-installation/) installed and on your system PATH.

The **Auto-scroll Preview**, **Song Library**, **Setlist**, **Chord Builder**, **Tab Editor**, and **Chord Analyzer** work without the CLI.

---

## Useful Links

- [ChordPro format reference](https://www.chordpro.org/chordpro/chordpro-directives/)
- [Oolimo chord analyzer](https://www.oolimo.com/en/guitar-chords/analyze)
- [Songcraft.io](https://songcraft.io/) — BPM, autoscrolling, visual editor, chord progressions
- [Full Changelog](CHANGELOG.md)

---

**Enjoy your playing!**
