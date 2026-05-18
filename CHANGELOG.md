# Changelog

## 2.1.2

### Bug fixes
- **Chord Builder — "Insert anyway" broken for unknown names**: clicking "Insert anyway" (or a "Did you mean" suggestion) after an unknown-name warning did nothing; the click handler was reading `_pendingInsert` after it had already been nulled by `_hideInsertWarning`
- **Chord Builder — SVG diagrams with open string + high frets**: chords like `E7 base-fret 3 frets 0 x 4 2 1 x` showed incomplete diagrams (highest dot dropped, no fret label); the window-shift now triggers on `maxFret > NF` instead of `minFret > NF`, and the fret label shows whenever the window doesn't start at the nut
- **"Defined but never used" false positive on `{chord:}`**: the diagnostic regex used `\S+` to capture the chord name, swallowing the closing `}` and producing a key mismatch with `usedChords`; changed to `[^\s}]+`
- **"Defined but never used" false positive for grid chords**: chords used inside `{start_of_grid}` blocks were not counted as used; grid lines are now scanned and all chord tokens added to the used-chord set

## 2.1.1

### Sidebar UI overhaul
- **Quick Actions panel** — new top-level sidebar section with 7 shortcut buttons: Performance View, Preview PDF, Build PDF, Chord Builder, Tab Editor, Grid Editor, Oolimo; same Linear Violet dark/light palette as the Chord Reference panel
- **Song Library converted to webview** — purple hover highlight on song items and inline ▶ play button; currently-open file is highlighted with purple text and a soft violet background; filter input to search by title or artist; consistent dark/light palette across all three sidebar sections
- **Sidebar order**: Quick Actions → Song Library → Chord Reference

### Editor
- **Edit existing tab/grid blocks via CodeLens** — `$(edit) Edit tab` and `$(edit) Edit grid` lenses appear above every `{start_of_tab}` and `{start_of_grid}` line; clicking opens the respective editor pre-populated with the block's current content; saving replaces the original block in-place

### Chord Builder — bug fixes
- **Insert Inline now always adds `{define:}`** — if the chord has no existing define in the document, one is inserted at the top of the defines section automatically
- **"Already defined" dialog fires after mismatch warning** — when "Insert anyway" is clicked after a voicing-mismatch warning, the standard already-defined flow (Go to definition / Replace / Add as _2) now correctly triggers instead of silently skipping it
- **`{chord:}` insert cursor position fixed** — the `editor.edit()` for inserting the define is now properly awaited before the cursor position is read, preventing the chord directive from landing on the wrong line

### SVG chord diagrams — bug fixes
- **Large-stretch chords render correctly** — diagrams like `{define: Am7 base-fret 5 frets x 0 1 1 1 x}` previously appeared blank; the fret window now shifts to the dot positions and a fret-number label appears at the correct row; fix applies to both the builder SVG and the Chord Reference panel

## 2.1.0

### Chord Builder
- **Smart voicing memory** — the builder learns chord names from your own insertions: every chord you insert is stored as a shape fingerprint. Next time you play the same fingering (or a barre-transposed version of it), your name appears as a ★ suggestion alongside the standard auto-detected names. Click × to forget a saved shape.
- **Name validation on insert** — clicking any insert button (Inline, `{chord:}`, `{define:}`) validates the chord name before inserting:
  - *Unknown name*: warns with fuzzy-matched suggestions ("Did you mean C5, Caug…?"); click a suggestion to re-validate with that name immediately
  - *Note mismatch*: warns when the voicing is missing notes required by the chord name, listing the missing notes
  - *Wrong root, correct quality*: automatically checks all 12 roots with the same chord suffix and suggests the matching root (e.g. "Voicing doesn't match Cmaj6 — but it fits: Dmaj6"); click to re-validate and insert in one step
  - All warnings appear inline in the builder panel; "Insert anyway" overrides the check
- **Audio playback** — click the 🔊 speaker button (or press `P`) to hear the chord: each string is plucked individually from low E to high e, then a quick full strum plays all notes together (Karplus-Strong synthesis, no external library needed)
- **Ctrl+Shift+Z redo** — redo stack added to the Chord Builder (and Tab Editor); Ctrl+Z undoes fret/string changes, Ctrl+Shift+Z redoes; performing a new action clears the redo stack

### Performance View
- **Three-column layout** — new "Three" option in the ⚙ Settings popup; supports `{x_columns_on}` / `{x_columns_off}` col-zone directives same as two-column mode
- **Per-file settings memory** — theme, columns, font size, legend mode, diagram sizes, and BPM are saved per file URI and restored automatically on next open; `{tempo:}` always takes priority over saved BPM
- **Full-screen icon fix** — enter/exit icons are now inline SVG (corner-bracket expand/compress) instead of Unicode glyphs that rendered blank in some fonts; the exit icon correctly shows inward arrows once in full-screen
- **Custom side panel** — `{x_start_side_panel}` / `{x_end_side_panel}` / `{x_panel_section_title: Label}` directives define a chord reference panel that appears as a fixed right column ("Side" mode) or inline grey card ("Inline" mode); toggle in ⚙ Settings; panel width controlled by a shared slider (120–260 px); incompatible with the chord legend "Side panel" mode

### All SVG chord diagrams
- **Fret number display** — the position indicator (e.g. "5" instead of "5fr") is now vertically centred in the first fret slot with a larger font; applies to hover tooltips, the Chord Reference panel, and the builder mini-diagram

## 2.0.0

### Performance View
- **Grouped control bar** — buttons reorganised into three labelled bracket sections: Tempo, Scroll, and Transpose; remaining controls (A−/A+, Ly, ⤢, 💾, ⚙) sit ungrouped at the right
- **Settings panel** — ⚙ gear button opens a popup with: Chord legend mode (Off / End / Side), legend diagram size slider, song diagram size slider, Theme (Dark/Light), and Columns (Single/Two); replaces the previous Cd / 🌙 / ⊞ buttons in the control bar
- **BPM input field** — replaces the tap label; type a BPM directly or use the Tap button; Enter confirms and returns focus to the page; keyboard shortcuts are suppressed while the field is focused
- **Physical metronome icon** — ♪ replaced with an inline SVG of a metronome (inverted-V body + swinging arm)
- **Sync-scroll button** — moved to the Scroll group with a ↓♩ icon; turns violet when active (distinct from the metronome's gold)
- **Mid-word chord spacing fix** — chord pairs whose lyric does not end with a space get `margin-right: 0`, eliminating the visual gap in mid-word chords like `hel[G]lo`
- **Proportional section gap** — paragraph spacing between sections scales with font size (`A−` / `A+`) instead of staying fixed
- **Lyrics-only collapses chord row** — in lyrics-only mode the chord row is physically removed (height: 0) so lyric lines have the same spacing as plain text
- **SVG diagram size controls** — two independent sliders in the Settings panel control legend diagram width and inline `{chord:}` diagram width

### Editor & Language
- **`{x_start_section: title}` / `{x_end_section}`** — new extension directives create a generic labeled section with a teal vertical badge; syntax-highlighted as section directives; autocomplete snippets added
- **Double-bracket autocomplete fix** — accepting a directive or chord completion no longer produces `{title: }}` or `[Am]]` when VS Code has already auto-closed the bracket
- **Cursor placement after chord insert** — inserting a chord from the Chord Reference panel places the cursor immediately after `]` using a snippet `$0` marker
- **Unused-define warning includes `{chord:}` usages** — a chord used only via `{chord: NAME}` (without an inline `[NAME]` token) no longer triggers the "defined but never used" hint

### Chord Builder
- **Three insert buttons** — *Inline* inserts `[CHORD]` at the cursor; *{chord:}* inserts `{chord: CHORD}` at the cursor and adds `{define:}` in the defines section; *{define:}* adds `{define:}` to the defines section only
- **"Chord already defined" prompt** — when inserting a chord that is already defined, offers: *Go to definition* (jumps to the `{define:}` line in the editor), *Replace* (overwrites the existing define), or *Add as A_2* (inserts a new define with the next available `_N` suffix)
- **Multiple voicings per chord** — chords named `A`, `A_2`, `A_3`, … are grouped under a single card in My Chords with ◀ ▶ navigation; each voicing carries its exact variant name so insertion uses the correct define
- **Note names in fret dots** — selected fret dots show the note name (always-sharp convention, e.g. C#); display scales with the larger 32 px row height
- **Interval display** — a *Notes / Intervals* segmented toggle switches dots between absolute note names and interval names relative to the chord root (1, m3, 3, 5, b7, maj7 …); Notes is the default
- **Auto-detect chord name** — the chord name field fills automatically with the best-matching name as frets change; typing or clicking a suggestion locks the name; clearing the field resumes auto-detect

## 1.16.0
- **Chord Builder & Chord Reference redesign** — both panels adopt the Linear Violet palette with CSS variables for dark/light mode; cleaner card layout, smooth hover transitions, violet accent colour throughout
- **`{x_columns_on}` / `{x_columns_off}` directives** — new extension directives wrap a zone of sections in two-column layout; works in the performance view and setlist; `{x_columns_off}` alone implicitly starts the zone from the beginning; autocomplete entries added; diagnostic warning when `{x_columns_off}` has no matching `{x_columns_on}`
- **Wrap in Section** — right-click context menu on any selection in a `.cho` file → *Wrap in Section* → Chorus / Verse / Bridge / Tab / Grid; inserts the matching `{start_of_*}` … `{end_of_*}` tags around the selected text; also available as individual commands
- **`[]` auto-closing** — square brackets now auto-close and auto-surround selections in ChordPro files (consistent with `{}` and `()`)
- **Section badges** — Verse / Chorus / Bridge labels in the performance view and setlist moved to the left edge as a vertical rotated pill; no longer consume vertical space above the section content
- **Performance mode: transpose now covers all chord types** — grid chord tokens (`{start_of_grid}`) and `{chord:}` directives now correctly follow the ♭/♯ transpose buttons; previously only inline `[chord]` tokens were transposed
- **Chord legend** — `Cd` button in the performance view control bar cycles through three modes: hidden / appended at end of page / fixed right-side panel; populated from the same chord library and enharmonic fallbacks as hover tooltips; updates on every rerender and file reload
- **Print / Save as PDF** — new `🖨 Print / PDF` option via the export popup; print stylesheet hides the control bar and side legend while keeping the end-of-page legend if active
- **Export dropdown** — "Save as HTML" and "Print / PDF" merged into a single `💾` button that unfolds a small popup; replaces the two separate buttons
- **Full screen fixed** — `⤢` / `F` now calls `workbench.action.maximizeEditorHideSidebar` instead of the blocked `requestFullscreen()` API; button icon toggles `⤢` / `⤡` to reflect state
- **Sections (`§`) button removed** from the performance view control bar
- **Fingering toggle** in Chord Builder converted from a button to an animated CSS pill switch
- **Ctrl+Z undo** in Chord Builder (fret clicks, string toggles, shift up/down) and Tab Editor (digit entry, backspace, column/bar ops)
- **Open in Chord Builder** from the Chord Reference panel right-click menu
- **Barre rendering fix** — barre bar is only drawn when fretted strings are contiguous; non-contiguous voicings (e.g. G#m7) now render as individual dots in both the hover tooltip and the Reference panel

## 1.15.0
- **Chord Reference panel** — new sidebar view with three tabs: *File* (chords in the open file), *My Chords* (personal library), and *Library* (full built-in library)
- **My Chords** — automatically tracks every `{define:}` block across all files you work on; voicings from file defines, the Chord Builder, and the built-in library are merged and deduplicated per chord name
- Multiple voicings per chord in the reference panel: navigate with ◀ ▶ arrows; delete a single voicing or all voicings of a chord via the × button
- Sort toggle in My Chords: A↕ alphabetical / #↕ by frequency of use; file tooltip on each card
- Right-click context menu on reference cards: *Insert inline* / *Insert diagram*
- Click a reference card to insert `[CHORD]` inline; `Ctrl+click` to insert `{chord:}`; both auto-add `{define:}` if the chord isn't yet defined in the file
- Hint bar at the bottom of the reference panel with usage instructions
- Chord names in reference cards enlarged (12 px bold)
- **Chord Builder: fingering mode** — toggle to assign finger numbers 1–4 by clicking fret dots on the mini-diagram
- **Load into Builder** — hover over any `[chord]` token or `{define:}` line and click *Open in Chord Builder* to load that voicing directly into the Builder
- Builder *With defines* insert now prompts to replace or keep both when the chord is already defined in the file
- Builder mini-diagram top-aligned; reduced dead space in SVG
- **Tracking fixes** — chord usage re-tracked on every file save (`onDidSaveTextDocument`); closed files scanned at activation via `openTextDocument` to backfill missing frets; chords with an explicit `{define:}` are automatically un-hidden even if previously deleted from My Chords
- Sidebar activity-bar icon updated to a chord-diagram SVG

## 1.14.2
- Chord Builder: reworked layout — name field + Insert/Reset controls above fretboard, aligned to fretboard width
- Chord Builder: two insert buttons ("At cursor" / "With defines") with smart placement logic; reset replaced by ↺ icon

## 1.14.1
- Insert Chord Inline/Diagram: list now includes inline `[CHORD]` tokens from the file, not just defined/saved chords
- Insert Chord Inline/Diagram: fuzzy filtering — typing `A7` matches `Am7b5`; always shows a "new chord" item for the typed value
- Chord Builder: keybinding changed to `Ctrl+Alt+B`; enharmonic equivalents (e.g. Bb / A#) now stack vertically as pairs
- Grid Editor chord palette now includes `{define:}` chords

## 1.14.0
- Renamed "Auto-scroll Preview" to "Performance View" (`Ctrl+Alt+P`)
- Added `ChordPro: Insert Title` command — inserts `{title: }` at the cursor
- Added `ChordPro: Insert Chord Diagram` (`Ctrl+Shift+D`) — same picker as Insert Chord Inline but inserts `{chord: CHORD}`
- Renamed "Insert Chord from List" to `ChordPro: Insert Chord Inline` (`Ctrl+I`); removed redundant "Insert Chord by Name"
- Grid Editor now includes chords from `{define:}` blocks in the song palette
- Hidden "Preview Song" from the command palette (library context menu only)

## 1.13.1
- Add `language-configuration.json` so `Ctrl+/` toggles `#` line comments in `.cho` files

## 1.13.0
- README: Grid Editor gif added to showcase; highlights table reordered

## 1.12.0
- **Grid Editor** (`Ctrl+Alt+G`) — visual editor for `{start_of_grid}` blocks: multi-beat cells per bar, song chord palette, Tab/Shift+Tab navigation, live preview
- **Chord hover in grids** — chord names inside `{start_of_grid}` blocks are syntax-highlighted green in the source file and show SVG diagram tooltips on hover, both in the source and in the HTML preview
- **`{define:}` chords** recognized in grid hover diagrams

## 1.11.0
- **User Config Library** — personal `.json` config files stored in a configurable folder (Dropbox-friendly); manage via new `ChordPro: Create / Import / Edit Config` and `ChordPro: Set User Configs Folder` commands
- **Bundled config presets** — extension ships with a *two columns* preset config ready to use
- **All commands prefixed `ChordPro:`** — every command in the palette now starts with `ChordPro:` for easy discovery

## 1.10.0
- **`{chord: Name}` directive** — name-only chord directives (without fret data) now render inline fretboard diagrams in the HTML preview and setlist
- **Safe inline HTML** — `<b>`, `<i>`, `<em>`, `<strong>`, `<u>`, `<s>` tags in lyric and comment lines are now rendered as formatted text instead of escaped source

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
