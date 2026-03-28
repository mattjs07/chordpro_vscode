# Changelog

## 1.7.2
- Section autocomplete now inserts paired `{start_of_*}` / `{end_of_*}` with cursor placed between them (chorus, verse, bridge, tab, grid, textblock)
- Tab Editor: `+ Column` inserts after the selected column instead of always at the end
- Tab Editor: fixed "No active editor" error when inserting tab after the webview takes focus
- Adaptive side margins using `clamp()` in both the scroll preview and setlist
- Setlist multi-select: Ctrl+click / Shift+click songs in the library panel; **Play as Setlist** plays only selected songs (falls back to all if none selected)

## 1.7.1
- Version bump for Marketplace publishing

## 1.7.0
- **Metronome** — Web Audio API click track; beat 1 accented (1320 Hz), beats 2–4 softer (880 Hz); `♪` button + `M` key; activates from `{tempo:}` or tap tempo; restarts automatically on BPM change
- **Song Library panel** — activity bar tree view; recursive subfolder scan; sorted by title; folder persisted across sessions
- **Song Library commands** — set folder, refresh, open in editor, preview in scroll view, play as setlist
- **Setlist Preview** — fixed nav bar (◀ counter title ▶), auto-advance at song end, PageUp/PageDown navigation, shared chord SVG map (no duplication per song), per-song transpose/scroll/metronome/font/lyrics/two-column controls, save as standalone HTML

## 1.6.0
- **Tap tempo** — tap `T` (or the Tap button) to measure BPM from your rhythm; averages last 8 taps, resets after 3 s idle
- **Section jump** — `§` button opens a popup list of all song sections; click to scroll smoothly to any section
- **Lyrics-only mode** — `L` key or **Ly** button fades out chord symbols without shifting layout
- **Full-screen** — `F` key or **⤢** button; works in saved HTML and browsers

## 1.5.0
- **Live transpose in preview** — ♭ / ♯ buttons shift all displayed chord names without modifying the source
- **Two-column layout** — ⊞ button toggles two-column mode
- **Theme toggle** — 🌙/☀️ button overrides OS dark/light preference per-session
- **Scroll position memory** — auto-reload on save restores scroll position
- **Chord hover: usage count** — hover tooltip shows how many times the chord appears in the file
- **Capo Helper** — *Show Concert Pitch Chords* command
- **Detect Key** — analyses chords and suggests the key; offers to insert `{key:}`

## 1.4.0
- **Dark mode** — preview auto-adapts to OS dark/light theme
- **Font size controls** — A− / A+ buttons (11–28 px range)
- **Capo badge** — capo number rendered as a distinct gold pill in the song header
- **Progress bar** — thin bar at the top tracks scroll position
- **Print stylesheet** — hides controls and produces a clean printed output

## 1.3.0
- **Tempo-based scroll speed** — `{tempo: N}` auto-sets scroll speed; ♩ button snaps back to tempo speed
- **Save as HTML** — 💾 button saves a self-contained `_preview.html` to disk

## 1.2.0
- **Auto-scroll preview auto-reload** — preview refreshes automatically on every file save
- **Chord diagrams in the preview** — hover over any chord name in the HTML view to see a fretboard diagram

## 1.1.0
- **Document Outline** — song title and sections in the VSCode Outline panel
- **Go to Definition** — Ctrl+click a chord token to jump to its `{define:}` block
- **Rename Chord** — right-click → Rename Symbol to rename everywhere atomically
- **Section Folding** — `{start_of_*}` … `{end_of_*}` fold like code blocks
- **Diagnostics** — info squiggle for chords with no fingering; hint for unused `{define:}` blocks

## 1.0.0
- **Chord Diagram Hover** — hover over any `[chord]` token to see an SVG fretboard popup
- Built-in fingering library (~100 chords: all roots × major, minor, 7th, maj7, sus, add9, dim, aug, 6, 9, 11, 13, m7b5, mmaj7, 69…)

## 0.9.0
- **Transpose Chords** — transposes `[chord]` tokens and `{key:}` directives; preserves sharp/flat spelling; slash chord support

## 0.8.0
- **Tab Editor** — visual 6-string grid; click cells, type fret numbers, insert `{start_of_tab}` block

## 0.7.0
- **Auto-scroll Preview** — built-in ChordPro parser + HTML renderer, no CLI needed; floating control bar

## 0.6.0
- **Chord Analyzer** panel — opens Oolimo in a VSCode side panel

## 0.5.0
- Expanded directive and chord completions; options helper with CLI flag picker

## 0.1.0
- Interactive **Chord Builder** with fretboard webview
- **Preview ChordPro PDF** command
- Auto-completion for directives and chords
- `.cho` / `.chordpro` / `.chopro` language registration + syntax highlighting

## 0.0.1
Initial release — basic render and template commands.
