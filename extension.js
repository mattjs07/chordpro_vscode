const vscode = require('vscode');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { Note, Chord } = require('tonal');


// Function to open a ChordPro template
function openChordProTemplate(context, templateName) {
    const templatePath = path.join(context.extensionPath, 'templates', `${templateName}_template.txt`);

    fs.readFile(templatePath, 'utf8', (err, data) => {
        if (err) {
            vscode.window.showErrorMessage(`Failed to read ${templateName} template file.`);
            return;
        }

        vscode.workspace.openTextDocument({ content: data, language: 'text' }).then(doc => {
            vscode.window.showTextDocument(doc);
        });
    });
}

// ─────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Returns { name, nameRange } if the cursor is inside a [chord] token, else null.
function chordTokenAtPosition(document, position) {
    const line = document.lineAt(position).text;
    const re = /\[([A-G][b#]?[^\]]*)\]/g;
    let m;
    while ((m = re.exec(line)) !== null) {
        const start = m.index, end = m.index + m[0].length;
        if (position.character >= start && position.character <= end) {
            return {
                name: m[1],
                nameRange: new vscode.Range(position.line, start + 1, position.line, end - 1)
            };
        }
    }
    return null;
}

// ─────────────────────────────────────────────
// Chord diagram hover — database + SVG generator
// ─────────────────────────────────────────────

// frets: [lowE, A, D, G, B, highE]  -1=muted  0=open  N=fret number
const CHORD_DB = {
    // C family
    'C':     [-1, 3, 2, 0, 1, 0],
    'Cm':    [-1, 3, 5, 5, 4, 3],
    'C7':    [-1, 3, 2, 3, 1, 0],
    'Cmaj7': [-1, 3, 2, 0, 0, 0],
    'Cadd9': [-1, 3, 2, 0, 3, 3],
    'Csus2': [-1, 3, 0, 0, 1, 0],
    // D family
    'D':     [-1, -1, 0, 2, 3, 2],
    'Dm':    [-1, -1, 0, 2, 3, 1],
    'D7':    [-1, -1, 0, 2, 1, 2],
    'Dmaj7': [-1, -1, 0, 2, 2, 2],
    'Dadd9': [-1, -1, 0, 2, 3, 0],
    'Dsus2': [-1, -1, 0, 2, 3, 0],
    'Dsus4': [-1, -1, 0, 2, 3, 3],
    'Dm7':   [-1, -1, 0, 2, 1, 1],
    // E family
    'E':     [ 0, 2, 2, 1, 0, 0],
    'Em':    [ 0, 2, 2, 0, 0, 0],
    'E7':    [ 0, 2, 0, 1, 0, 0],
    'Em7':   [ 0, 2, 2, 0, 3, 0],
    'Emaj7': [ 0, 2, 1, 1, 0, 0],
    'Esus4': [ 0, 2, 2, 2, 0, 0],
    // F family
    'F':     [ 1, 3, 3, 2, 1, 1],
    'Fm':    [ 1, 3, 3, 1, 1, 1],
    'F7':    [ 1, 3, 1, 2, 1, 1],
    'Fmaj7': [-1, -1, 3, 2, 1, 0],
    // G family
    'G':     [ 3, 2, 0, 0, 0, 3],
    'Gm':    [ 3, 5, 5, 3, 3, 3],
    'G7':    [ 3, 2, 0, 0, 0, 1],
    'Gmaj7': [ 3, 2, 0, 0, 0, 2],
    'Gsus4': [ 3, 3, 0, 0, 1, 3],
    'Gadd9': [ 3, 2, 0, 2, 0, 3],
    // A family
    'A':     [-1, 0, 2, 2, 2, 0],
    'Am':    [-1, 0, 2, 2, 1, 0],
    'A7':    [-1, 0, 2, 0, 2, 0],
    'Am7':   [-1, 0, 2, 0, 1, 0],
    'Amaj7': [-1, 0, 2, 1, 2, 0],
    'Asus2': [-1, 0, 2, 2, 0, 0],
    'Asus4': [-1, 0, 2, 2, 3, 0],
    'A9':    [-1, 0, 2, 4, 2, 0],
    // B family
    'B':     [-1, 2, 4, 4, 4, 2],
    'Bm':    [-1, 2, 4, 4, 3, 2],
    'B7':    [-1, 2, 1, 2, 0, 2],
    'Bm7':   [-1, 2, 4, 2, 3, 2],
    // Bb / A#
    'Bb':    [-1, 1, 3, 3, 3, 1],
    'Bbm':   [-1, 1, 3, 3, 2, 1],
    'Bb7':   [-1, 1, 3, 1, 3, 1],
    // F# / Gb
    'F#':    [ 2, 4, 4, 3, 2, 2],
    'F#m':   [ 2, 4, 4, 2, 2, 2],
    'F#7':   [ 2, 4, 2, 3, 2, 2],
    'F#m7':  [ 2, 4, 2, 2, 2, 2],
    // C# / Db
    'C#':    [-1, 4, 6, 6, 6, 4],
    'C#m':   [-1, 4, 6, 6, 5, 4],
    'Db':    [-1, 4, 6, 6, 6, 4],
    // Ab / G#
    'Ab':    [ 4, 6, 6, 5, 4, 4],
    'Abm':   [ 4, 6, 6, 4, 4, 4],
    // Eb / D#
    'Eb':    [-1, 6, 8, 8, 8, 6],
    'Ebm':   [-1, 6, 8, 8, 7, 6],

    // ── aug (augmented triad) ─────────────────────────────────────────
    // Note: augmented chords repeat every 4 semitones, so some shapes are shared
    'Caug':  [ 0, 3, 2, 1, 1, 0],   // E,C,E,G#,C,E
    'Daug':  [-1,-1, 0, 3, 3, 2],   // D,Bb,D,F#
    'Eaug':  [ 0, 3, 2, 1, 1, 0],   // same notes as Caug (C/E/Ab aug family)
    'Faug':  [ 1, 4, 3, 2, 2, 1],   // F,C#,F,A,C#,F
    'Gaug':  [ 3, 2, 1, 0, 0, 3],   // G,B,Eb,G,B,G
    'Aaug':  [-1, 0, 3, 2, 2, 1],   // A,F,A,C#,F
    'Baug':  [-1, 2, 1, 0, 0,-1],   // B,Eb,G,B

    // ── dim (diminished triad) ────────────────────────────────────────
    'Cdim':  [-1, 3, 4, 5, 4,-1],   // C,Gb,C,Eb
    'Ddim':  [-1,-1, 0, 1, 1, 1],   // D,Eb,C,F (open position; includes minor 7th)
    'Edim':  [ 0, 1, 2, 3, 2, 3],   // E,Bb,E,Bb,Db,G
    'Gdim':  [ 3, 4, 5, 3,-1,-1],   // G,Db,G,Bb
    'Adim':  [-1, 0, 1, 2, 1,-1],   // A,Eb,A,C
    'Bdim':  [-1, 2, 3, 4, 3,-1],   // B,F,B,D

    // ── dim7 (diminished seventh) ─────────────────────────────────────
    'Cdim7': [-1, 3, 4, 5, 4, 5],   // C,Gb,C,Eb,A
    'Ddim7': [-1,-1, 0, 1, 0, 1],   // D,Eb,D,Ab (symmetric shape)
    'Edim7': [ 0, 1, 2, 3, 2, 3],   // E,Bb,E,Bb,Db,G
    'Gdim7': [ 3, 4, 5, 3, 5, 3],   // G,Db,G,Bb,E,G
    'Adim7': [-1, 0, 1, 2, 1, 2],   // A,Eb,A,C,Ab
    'Bdim7': [-1, 2, 3, 4, 3, 4],   // B,F,B,D,Ab

    // ── 5 (power chord) ───────────────────────────────────────────────
    'C5':    [-1, 3, 5,-1,-1,-1],   // C,G
    'D5':    [-1,-1, 0, 2,-1,-1],   // D,A
    'E5':    [ 0, 2, 2,-1,-1,-1],   // E,B,E
    'F5':    [ 1, 3, 3,-1,-1,-1],   // F,C
    'G5':    [ 3, 5, 5,-1,-1,-1],   // G,D
    'A5':    [-1, 0, 2, 2,-1,-1],   // A,E,A
    'B5':    [-1, 2, 4, 4,-1,-1],   // B,F#

    // ── 6 (major sixth) ───────────────────────────────────────────────
    'C6':    [-1, 3, 2, 2, 1, 0],   // C,E,A,E
    'D6':    [-1,-1, 0, 2, 0, 2],   // D,A,B,F#
    'E6':    [ 0, 2, 2, 1, 2, 0],   // E,B,E,G#,C#,E
    'G6':    [ 3, 2, 0, 0, 0, 0],   // G,B,D,G,B,E
    'A6':    [-1, 0, 2, 2, 2, 2],   // A,E,A,C#,F#

    // ── m6 (minor sixth) ──────────────────────────────────────────────
    'Cm6':   [-1, 3, 5, 5, 4, 5],   // C,G,C,Eb,A
    'Dm6':   [-1,-1, 0, 2, 0, 1],   // D,A,B,F
    'Em6':   [ 0, 2, 2, 0, 2, 0],   // E,B,E,G,C#,E
    'Am6':   [-1, 0, 2, 2, 1, 2],   // A,E,A,C,F#

    // ── add4 (add11 — adds perfect 4th without omitting 3rd) ─────────
    'Cadd4': [-1, 3, 3, 0, 1, 0],   // C,F,G,C,E
    'Gadd4': [ 3, 2, 0, 0, 1, 3],   // G,B,D,G,C,G

    // ── 9 (dominant ninth) ────────────────────────────────────────────
    'C9':    [-1, 3, 2, 3, 3, 3],   // C,E,Bb,D,G
    'E9':    [ 0, 2, 0, 1, 0, 2],   // E,B,D,G#,B,F#
    'G9':    [ 3, 2, 0, 2, 0, 1],   // G,B,D,A,B,F
    // A9 already defined above

    // ── maj9 (major ninth) ────────────────────────────────────────────
    'Cmaj9': [-1, 3, 2, 0, 3, 0],   // C,E,G,D,E (no maj7 — practical open voicing)
    'Amaj9': [-1, 0, 2, 1, 0, 0],   // A,E,G#,B,E

    // ── 7sus4 ─────────────────────────────────────────────────────────
    'C7sus4':[-1, 3, 3, 3, 1, 1],   // C,F,Bb,C,F
    'D7sus4':[-1,-1, 0, 2, 1, 3],   // D,A,C,G
    'E7sus4':[ 0, 2, 2, 2, 0, 0],   // E,B,E,A,B,E
    'G7sus4':[ 3, 3, 0, 0, 1, 1],   // G,C,D,G,C,F
    'A7sus4':[-1, 0, 2, 2, 3, 3],   // A,E,A,D,G

    // ── 7b9 ───────────────────────────────────────────────────────────
    'E7b9':  [ 0, 2, 0, 1, 0, 1],   // E,B,D,G#,B,F
    'A7b9':  [-1, 0, 2, 3, 2, 3],   // A,E,Bb,C#,G

    // ── 7#9 (Hendrix chord) ───────────────────────────────────────────
    'E7#9':  [ 0, 2, 2, 1, 3, 0],   // E,B,E,G#,D,E (practical open voicing)
    'A7#9':  [-1, 0, 2, 0, 2, 3],   // A,E,G,C#,G (add #9 at high e)

    // ── 7b5 ───────────────────────────────────────────────────────────
    'E7b5':  [ 0, 2, 0, 3, 0,-1],   // E,B,D,Bb,B
    'A7b5':  [-1, 0, 1, 0, 2, 3],   // A,Eb,G,C#,G

    // ── 7#5 (augmented seventh) ───────────────────────────────────────
    'E7#5':  [ 0, 3, 2, 1, 1, 0],   // E,C,E,G#,C,E (Caug/E)
    'A7#5':  [-1, 0, 3, 0, 2, 1],   // A,F,G,C#,F

    // ── m7b5 (half-diminished) ────────────────────────────────────────
    'Em7b5': [ 0, 1, 2, 0, 3, 0],   // E,Bb,E,G,D,E
    'Am7b5': [-1, 0, 1, 2, 1, 3],   // A,Eb,A,C,G
    'Bm7b5': [-1, 2, 3, 2, 3,-1],   // B,F,B,D

    // ── mmaj7 (minor major seventh) ───────────────────────────────────
    'Ammaj7':[-1, 0, 2, 1, 1, 0],   // A,E,G#,C,E
    'Dmmaj7':[-1,-1, 0, 2, 2, 1],   // D,A,C#,F
    'Emmaj7':[ 0, 2, 2, 1, 0, 0],   // E,B,E,G#,B,E (= Emaj7 voicing, maj7 of Em)

    // ── 69 ────────────────────────────────────────────────────────────
    'C69':   [-1, 3, 2, 2, 3, 0],   // C,E,A,D,E
    'G69':   [ 3, 2, 2, 2, 0, 0],   // G,B,E,A,B,E
    'A69':   [-1, 0, 2, 4, 2, 2],   // A,E,B,C#,F#

    // ── m9 (minor ninth) ──────────────────────────────────────────────
    // Movable shape: root on A string fret n → [x, n, n-2, n, n, x]
    'Cm9':   [-1, 3, 1, 3, 3,-1],   // x3133x — user-verified
    'Dm9':   [-1, 5, 3, 5, 5,-1],
    'Fm9':   [-1, 8, 6, 8, 8,-1],
    'Gm9':   [-1,10, 8,10,10,-1],
    'Em9':   [ 0, 2, 4, 0, 3, 0],   // open: E,B,F#,G,D,E
    'Am9':   [-1, 0, 2, 0, 0, 0],   // open: A,E,G,B,E (omits b3, keeps 9th)
    'Bbm9':  [-1, 1,-1, 1, 1,-1],   // x1x11x

    // ── 11 (dominant eleventh) ────────────────────────────────────────
    // Movable shape: root on A string fret n → [x, n, n, n, n, n] (barre)
    'C11':   [-1, 3, 3, 3, 3, 3],   // x33333 — user-verified
    'D11':   [-1, 5, 5, 5, 5, 5],
    'E11':   [-1, 7, 7, 7, 7, 7],
    'F11':   [-1, 8, 8, 8, 8, 8],
    'G11':   [ 3, 3, 3, 0, 1, 1],   // open: G,C,F,G,C,F (1,11,b7)
    'A11':   [-1, 0, 0, 0, 0, 0],   // open strings: A,D,G,B,E (1,11,b7)
    'Bb11':  [-1, 1, 1, 1, 1, 1],

    // ── 13 (dominant thirteenth) ──────────────────────────────────────
    // Movable shape: root on A string fret n → [x, n, n-1, n, n, n+2]
    'C13':   [-1, 3, 2, 3, 3, 5],   // x32335 — user-verified
    'D13':   [-1, 5, 4, 5, 5, 7],
    'F13':   [-1, 8, 7, 8, 8,10],
    'G13':   [ 3, 2, 3, 2, 0, 0],   // open: G,B,F,A,B,E (1,3,b7,9,13)
    'E13':   [ 0, 2, 2, 1, 2, 2],   // open: E,B,E,G#,C#,F# (1,5,3,13,9)
    'A13':   [-1, 0, 2, 0, 2, 2],   // open: A,E,G,C#,F# (1,5,b7,3,13)
    'Bb13':  [-1, 1, 0, 1, 1, 3],

    // ── maj13 (major thirteenth) ──────────────────────────────────────
    // Movable shape: root on A string fret n → [x, n, x, n+1, n+2, n+2]
    'Cmaj13':[-1, 3,-1, 4, 5, 5],   // x3x455 — user-verified: C,B,E,A
    'Dmaj13':[-1, 5,-1, 6, 7, 7],
    'Fmaj13':[-1, 8,-1, 9,10,10],
    'Emaj13':[ 0, 2, 1, 1, 2, 2],   // open: E,B,D#,G#,C#,F# (1,5,maj7,3,13,9)
    'Amaj13':[-1, 0,-1, 1, 2, 2],   // open: A,G#,C#,F# (1,maj7,3,13)
    'Gmaj13':[-1,10,-1,11,12,12],   // barre (no clean open position for G)
};

// Parse {define: NAME base-fret N frets f1 f2 f3 f4 f5 f6} blocks from a document.
// Returns { chordName: [lowE, A, D, G, B, highE] } with absolute fret numbers.
const _trackedThisSession = new Set();
function trackChordUsage(document, context, chordRefProvider, forceUpdate = false) {
    if (document.languageId !== 'chordpro') return;
    const key = document.uri.toString();
    if (!forceUpdate && _trackedThisSession.has(key)) return;
    _trackedThisSession.add(key);
    const text = document.getText();
    const defines = parseDocumentDefines(document); // {name: [lowE..highE]}
    const names = new Set(Object.keys(defines));
    const re = /\[([A-G][^\[\]]*)\]/g;
    let m;
    while ((m = re.exec(text)) !== null) { const n = m[1].trim(); if (n) names.add(n); }
    if (!names.size) return;
    const chordFiles = context.globalState.get('chordFiles') || {};
    names.forEach(n => {
        if (!chordFiles[n]) chordFiles[n] = [];
        // Migrate legacy bare-string entries and update missing frets
        chordFiles[n] = chordFiles[n].map(e => typeof e === 'string' ? { uri: e, frets: null } : e);
        const existing = chordFiles[n].find(e => e.uri === key);
        if (!existing) {
            chordFiles[n].push({ uri: key, frets: defines[n] || null });
        } else if (defines[n]) {
            existing.frets = defines[n]; // backfill frets for old entries that had null
        }
    });
    context.globalState.update('chordFiles', chordFiles);
    // Chords with an explicit {define:} in the file should never stay hidden —
    // the user clearly wants them visible, even if they were previously deleted.
    const definedNames = Object.keys(defines);
    if (definedNames.length) {
        const hidden = context.globalState.get('hiddenChords') || [];
        const newHidden = hidden.filter(n => !definedNames.includes(n));
        if (newHidden.length !== hidden.length)
            context.globalState.update('hiddenChords', newHidden);
        const suppressed = context.globalState.get('suppressedVoicings') || [];
        const newSuppressed = suppressed.filter(s => !definedNames.includes(s.name));
        if (newSuppressed.length !== suppressed.length)
            context.globalState.update('suppressedVoicings', newSuppressed);
    }
    if (chordRefProvider) chordRefProvider.nudge();
}

function parseDocumentDefines(document) {
    const defines = {};
    const text = document.getText();
    // Step 1: extract the full content of each {define:...} or {chord:...} block
    const blockRe = /\{(?:define|chord):?\s+([^}]+)\}/gi;
    let block;
    while ((block = blockRe.exec(text)) !== null) {
        const content = block[1];
        // Step 2: chord name is the first whitespace-delimited token
        const nameMatch = content.match(/^\s*(\S+)/);
        if (!nameMatch) continue;
        const name = nameMatch[1];
        // Step 3: extract base-fret (defaults to 1 if absent)
        const baseFretMatch = content.match(/base-fret\s+(\d+)/i);
        const baseFret = baseFretMatch ? parseInt(baseFretMatch[1]) : 1;
        // Step 4: extract the 6 fret values after the "frets" keyword
        const fretsMatch = content.match(/\bfrets\s+((?:[x0-9-]+\s+){5}[x0-9-]+)/i);
        if (!fretsMatch) continue;
        const fretStrs = fretsMatch[1].trim().split(/\s+/);
        if (fretStrs.length !== 6) continue;
        const frets = fretStrs.map(f => {
            if (f === 'x' || f === 'X' || f === '-1') return -1;
            const n = parseInt(f);
            if (isNaN(n) || n < 0) return -1;
            if (n === 0) return 0;
            return n + baseFret - 1;
        });
        defines[name] = frets;
    }
    return defines;
}

function generateChordSvg(frets, chordName) {
    const W = 110, H = 130;
    const PL = 10, PR = 22, PT = 22, PB = 8;
    const NS = 6, NF = 5;
    const SW = (W - PL - PR) / (NS - 1); // string spacing
    const FH = (H - PT - PB) / NF;       // fret slot height

    const sx = i => PL + i * SW;
    const fy = i => PT + i * FH;
    const dy = i => PT + (i - 0.5) * FH;

    const frettedNotes = frets.filter(f => f > 0);
    const hasOpen = frets.some(f => f === 0);
    const minFret = frettedNotes.length ? Math.min(...frettedNotes) : 1;

    let startFret, showNut;
    if (hasOpen || minFret <= 3) {
        startFret = 1; showNut = true;
    } else {
        startFret = minFret; showNut = false;
    }

    // Detect barre: ≥ 4 strings on the same lowest fret AND they form a contiguous range
    const fretCounts = {};
    frets.forEach(f => { if (f > 0) fretCounts[f] = (fretCounts[f] || 0) + 1; });
    let barreFret = 0;
    const barreFretCandidate = Number(Object.keys(fretCounts).find(f => fretCounts[f] >= 4 && Number(f) === minFret) || 0);
    if (barreFretCandidate) {
        const barIdxs = frets.reduce((a, f, i) => { if (f === barreFretCandidate) a.push(i); return a; }, []);
        const span = Math.max(...barIdxs) - Math.min(...barIdxs) + 1;
        if (span === barIdxs.length) barreFret = barreFretCandidate; // contiguous only
    }

    const parts = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
        `<rect width="${W}" height="${H}" rx="5" fill="#fafafa" stroke="#ddd" stroke-width="1"/>`,
    ];

    // Fret lines
    for (let i = 0; i <= NF; i++) {
        const y = fy(i);
        const sw = i === 0 && showNut ? 3 : 1;
        const color = i === 0 ? '#222' : '#bbb';
        parts.push(`<line x1="${sx(0)}" y1="${y}" x2="${sx(NS-1)}" y2="${y}" stroke="${color}" stroke-width="${sw}"/>`);
    }
    // String lines
    for (let i = 0; i < NS; i++) {
        parts.push(`<line x1="${sx(i)}" y1="${fy(0)}" x2="${sx(i)}" y2="${fy(NF)}" stroke="#bbb" stroke-width="1"/>`);
    }

    // Mute / open indicators above nut
    for (let s = 0; s < NS; s++) {
        const x = sx(s), y = PT - 8;
        if (frets[s] === -1) {
            const d = 4;
            parts.push(`<line x1="${x-d}" y1="${y-d}" x2="${x+d}" y2="${y+d}" stroke="#c00" stroke-width="1.5"/>`);
            parts.push(`<line x1="${x+d}" y1="${y-d}" x2="${x-d}" y2="${y+d}" stroke="#c00" stroke-width="1.5"/>`);
        } else if (frets[s] === 0) {
            parts.push(`<circle cx="${x}" cy="${y}" r="4.5" fill="none" stroke="#222" stroke-width="1.5"/>`);
        }
    }

    // Barre bar
    if (barreFret) {
        const slot = barreFret - startFret + 1;
        const barStrings = frets.reduce((acc, f, i) => { if (f === barreFret) acc.push(i); return acc; }, []);
        const x1 = sx(Math.min(...barStrings)), x2 = sx(Math.max(...barStrings));
        const cy = dy(slot);
        parts.push(`<rect x="${x1 - 7}" y="${cy - 7}" width="${x2 - x1 + 14}" height="14" rx="7" fill="#222"/>`);
    }

    // Individual finger dots
    frets.forEach((f, s) => {
        if (f <= 0) return;
        if (barreFret && f === barreFret) return; // already drawn as barre
        const slot = f - startFret + 1;
        if (slot < 1 || slot > NF) return;
        parts.push(`<circle cx="${sx(s)}" cy="${dy(slot)}" r="7" fill="#222"/>`);
    });

    // Fret number label for non-open-position chords
    if (!showNut) {
        parts.push(`<text x="${sx(NS-1)+5}" y="${dy(1)+4}" font-size="11" font-weight="bold" fill="#555" font-family="sans-serif" text-anchor="start">${startFret}</text>`);
    }

    parts.push('</svg>');
    return parts.join('');
}

// ─────────────────────────────────────────────
// Transpose helpers
// ─────────────────────────────────────────────

const SHARPS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FLATS  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];

function transposeNote(note, semitones) {
    const inFlats  = FLATS.indexOf(note);
    const inSharps = SHARPS.indexOf(note);
    // Prefer flats if the original note is a flat accidental (Db, Eb, Gb, Ab, Bb)
    const preferFlats = inFlats !== -1 && inSharps === -1;
    const idx = inSharps !== -1 ? inSharps : inFlats;
    if (idx === -1) return note;
    const newIdx = ((idx + semitones) % 12 + 12) % 12;
    return preferFlats ? FLATS[newIdx] : SHARPS[newIdx];
}

function transposeChordToken(chordStr, semitones) {
    // Match root[b#]? + quality + optional /bass
    const m = chordStr.match(/^([A-G][b#]?)([^/]*)(\/([A-G][b#]?)(.*))?$/);
    if (!m) return chordStr;
    const newRoot = transposeNote(m[1], semitones);
    const newBass = m[4] ? transposeNote(m[4], semitones) : null;
    return newRoot + m[2] + (newBass ? '/' + newBass + (m[5] || '') : '');
}

// ─────────────────────────────────────────────
// Key detection helpers
// ─────────────────────────────────────────────

const MAJOR_SCALE_ROOTS = {
    'C':  ['C','D','E','F','G','A','B'],
    'G':  ['G','A','B','C','D','E','F#'],
    'D':  ['D','E','F#','G','A','B','C#'],
    'A':  ['A','B','C#','D','E','F#','G#'],
    'E':  ['E','F#','G#','A','B','C#','D#'],
    'B':  ['B','C#','D#','E','F#','G#','A#'],
    'F#': ['F#','G#','A#','B','C#','D#','F'],
    'F':  ['F','G','A','Bb','C','D','E'],
    'Bb': ['Bb','C','D','Eb','F','G','A'],
    'Eb': ['Eb','F','G','Ab','Bb','C','D'],
    'Ab': ['Ab','Bb','C','Db','Eb','F','G'],
    'Db': ['Db','Eb','F','Gb','Ab','Bb','C'],
    'Gb': ['Gb','Ab','Bb','Cb','Db','Eb','F'],
};
const RELATIVE_MINORS = {
    'C':'Am','G':'Em','D':'Bm','A':'F#m','E':'C#m','B':'G#m','F#':'D#m',
    'F':'Dm','Bb':'Gm','Eb':'Cm','Ab':'Fm','Db':'Bbm','Gb':'Ebm',
};
function detectKeyFromChords(chordNames) {
    const roots = [...new Set(chordNames.map(c => { const m = c.match(/^([A-G][b#]?)/); return m ? m[1] : null; }).filter(Boolean))];
    let bestKey = 'C', bestScore = -1;
    for (const [key, scale] of Object.entries(MAJOR_SCALE_ROOTS)) {
        const score = roots.filter(r => scale.includes(r)).length;
        if (score > bestScore) { bestScore = score; bestKey = key; }
    }
    return { major: bestKey, minor: RELATIVE_MINORS[bestKey] || '' };
}

// ─────────────────────────────────────────────

function resolveConfigPath(configPath, fileDirname) {
    // Check if configPath ends with '.json'
    if (configPath.endsWith('.json')) {
        // It's a file path; resolve it relative to the script's directory
        return path.resolve(fileDirname, configPath);
    } else {
        // It's a named profile; return as-is
        return configPath;
    }
}

function renderChordProLogic(context, onSuccess) {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
        vscode.window.showErrorMessage("No active editor found");
        return;
    }

    const document = editor.document;
    const filePath = editor.document.uri.fsPath;
    const fileDirname = path.dirname(filePath);
    const fileBasenameNoExtension = path.basename(filePath, path.extname(filePath));

    let options = '';
    let suffix = '';
    let outputFile = '';
    let config_path = '';

    // Iterate over all lines in the document
    for (let i = 0; i < Math.min(25, document.lineCount); i++) {
        const line = document.lineAt(i).text;

        // Match for options
        const optionsMatch = line.match(/^#'? {?\s*(option|options)\s*=\s*(.*)\s*}/);
        if (optionsMatch) {
            options = optionsMatch[2].trim();
        }

        // Match for suffix
        const suffixMatch = line.match(/^#'? {?\s*suffix\s*=\s*(["']?)(\S+)\1\s*}/);
        if (suffixMatch) {
            suffix = suffixMatch[2].trim().replace(/\s+/g, '');
        }

        // Match for output
        const outputMatch = line.match(/^#'? {?\s*output\s*=\s*(["']?)(\S+)\1\s*}/);
        if (outputMatch) {
            outputFile = outputMatch[2].trim();
        }
        
        // Match for config
        const configMatch = line.match(/^#'? {?\s*config\s*=\s*(["']?)(\S+)\1\s*}/);
        if (configMatch && configMatch[2]) {
            config_path = configMatch[2].trim();
        }
    }

    // Remove all whitespace characters from the suffix and configpath
    suffix = suffix.replace(/\s+/g, '');
    config_path = config_path.replace(/\s+/g, '');

    // If no config  is specified, default will be modern1
    if (!config_path) {
        config_path = 'modern1';
    }

    // Resolve the config path (relative or absolute)
    config_path = resolveConfigPath(config_path, fileDirname);

    // If no output filename is specified, construct it using the base name and suffix
    if (!outputFile) {
        outputFile = suffix ? `${fileBasenameNoExtension}_${suffix}.pdf` : `${fileBasenameNoExtension}.pdf`;
    }

    const scriptPath = path.join(context.extensionPath, 'resources', 'bash_for_chordpro_task.sh');
    if (!fs.existsSync(scriptPath)) {
        vscode.window.showErrorMessage("Bash script not found!");
        return;
    }

    const fullOutputPath = path.resolve(fileDirname, outputFile);

    // Build the command string to execute the bash script
    let command = `bash "${scriptPath}" "${filePath}" "${fullOutputPath}" "${config_path}"`;
    if (options) {
        // Ensure options are quoted in case they contain spaces
        command += ` "${options}"`;
    }

    console.log('File Directory:', fileDirname);
    console.log('Running command: ', command);

    // Execute the command
    exec(command, (error, stdout, stderr) => {
        if (error) {
            vscode.window.showErrorMessage(`Error: ${error.message}`);
            return;
        }
        if (stderr) {
            vscode.window.showErrorMessage(`stderr: ${stderr}`);
            return;
        }

        vscode.window.showInformationMessage(`ChordPro PDF rendered.`);
        if (onSuccess) { onSuccess(fullOutputPath); }
    });
}

// ─────────────────────────────────────────────
// Chord Builder
// ─────────────────────────────────────────────

// Standard tuning MIDI: index 0=high e, 1=B, 2=G, 3=D, 4=A, 5=low E
const OPEN_MIDI = [64, 59, 55, 50, 45, 40];

const ALIAS_OVERRIDE = {
    'M': '',          // major triad → just root (C not CM)
    '7add6': '13',    // dominant 13th
    '7add13': '13',
    '67': '13',
    '7b6': '7b13',    // dominant 7b13
    'add2': 'add9',
};

const ENHARMONIC = {
    'Bb': 'A#', 'Eb': 'D#', 'Ab': 'G#', 'Db': 'C#', 'Gb': 'F#',
    'A#': 'Bb', 'D#': 'Eb', 'G#': 'Ab', 'C#': 'Db', 'F#': 'Gb'
};
function enharmonicName(name) {
    const m = name.match(/^([A-G][b#]?)(.*)/);
    if (!m) { return null; }
    const alt = ENHARMONIC[m[1]];
    return alt ? alt + m[2] : null;
}

function prettyName(raw) {
    const c = Chord.get(raw);
    if (!c.tonic) { return ''; }
    const first = c.aliases[0] ?? '';
    const sym = (first in ALIAS_OVERRIDE) ? ALIAS_OVERRIDE[first] : first;
    return c.tonic + sym + (c.bass ? '/' + c.bass : '');
}

function detectChord(frets) {
    const seen = new Set();
    const pcs = [];
    let bassPC = '';

    for (let s = 5; s >= 0; s--) {
        if (frets[s] === -1) { continue; }
        const pc = Note.pitchClass(Note.fromMidi(OPEN_MIDI[s] + frets[s]));
        if (!pc || seen.has(pc)) { continue; }
        seen.add(pc);
        pcs.push(pc);
        if (!bassPC) { bassPC = pc; }
    }

    if (pcs.length < 2) { return []; }

    const opts = { assumePerfectFifth: true };
    let raw = Chord.detect(pcs, opts);

    if (raw.length === 0) {
        for (let i = 0; i < pcs.length && raw.length === 0; i++) {
            raw = Chord.detect(pcs.filter((_, j) => j !== i), opts);
        }
    }

    if (raw.length === 0) { return []; }

    const rootOf = n => (n.split('/')[0].match(/^[A-G][b#]?/) || [''])[0];

    return raw
        .map(prettyName)
        .filter(Boolean)
        .sort((a, b) => {
            const aOnBass = rootOf(a) === bassPC ? 0 : 1;
            const bOnBass = rootOf(b) === bassPC ? 0 : 1;
            if (aOnBass !== bOnBass) { return aOnBass - bOnBass; }
            return a.length - b.length;
        })
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .flatMap(name => { const e = enharmonicName(name); return e ? [name, e] : [name]; })
        .slice(0, 10)
        .reduce((groups, name, i, arr) => {
            if (i > 0 && groups.length && groups[groups.length - 1].length === 1) {
                const prev = groups[groups.length - 1][0];
                const mP = prev.match(/^([A-G][b#]?)(.*)/), mN = name.match(/^([A-G][b#]?)(.*)/);
                if (mP && mN && mP[2] === mN[2] && ENHARMONIC[mP[1]] === mN[1]) {
                    groups[groups.length - 1].push(name);
                    return groups;
                }
            }
            groups.push([name]);
            return groups;
        }, []);
}

function toChordProDefine(chord) {
    const cpFrets = [...chord.frets].reverse(); // low E first
    const frettedPositions = cpFrets.filter(f => f > 0);
    const baseFret = frettedPositions.length > 0 ? Math.min(...frettedPositions) : 1;
    const values = cpFrets.map(f => {
        if (f === -1) { return 'x'; }
        if (f === 0)  { return '0'; }
        return String(f - baseFret + 1);
    });
    let def = `{define: ${chord.name} base-fret ${baseFret} frets ${values.join(' ')}`;
    if (chord.fingers && chord.fingers.some(fn => fn > 0)) {
        const cpFingers = [...chord.fingers].reverse();
        const fv = cpFingers.map((fn, i) => cpFrets[i] <= 0 ? '0' : String(fn));
        def += ` fingers ${fv.join(' ')}`;
    }
    return def + '}';
}

// ── Saved voicings helpers ────────────────────────────────────────────────────
// Storage: context.globalState key 'savedVoicings' → [{name, frets, fingers}, ...]
// frets/fingers stored highE→lowE (same as before for chord_NAME keys).

function _svKey(chord) { return toChordProDefine(chord); }

function getSavedVoicings(context, name) {
    const all = context.globalState.get('savedVoicings') || [];
    return all.filter(v => v.name === name);
}

function getPrimaryVoicing(context, name) {
    return getSavedVoicings(context, name)[0] || null;
}

function getAllSavedNames(context) {
    const all = context.globalState.get('savedVoicings') || [];
    return [...new Set(all.map(v => v.name))];
}

// Returns the next available voicing name (e.g. "A" → "A_2", "A"+"A_2" → "A_3")
function nextVoicingName(document, baseName) {
    const text = document.getText();
    const escaped = escapeRegex(baseName);
    const re = new RegExp(`\\{define:?\\s+${escaped}(_\\d+)?[\\s}]`, 'gi');
    let maxN = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
        const n = m[1] ? parseInt(m[1].slice(1)) : 1;
        if (n > maxN) maxN = n;
    }
    return maxN === 0 ? null : baseName + '_' + (maxN + 1);
}

function addSavedVoicing(context, chord) {
    const all = context.globalState.get('savedVoicings') || [];
    const key = _svKey(chord);
    if (all.some(v => _svKey(v) === key)) return false; // duplicate
    context.globalState.update('savedVoicings', [...all, chord]);
    return true;
}

function migrateSavedChords(context) {
    const keys = context.globalState.keys().filter(k => k.startsWith('chord_'));
    if (!keys.length) return;
    const existing = context.globalState.get('savedVoicings') || [];
    const existingKeys = new Set(existing.map(_svKey));
    const incoming = [];
    for (const k of keys) {
        const chord = context.globalState.get(k);
        if (chord && chord.frets && !existingKeys.has(_svKey(chord))) {
            incoming.push(chord);
            existingKeys.add(_svKey(chord));
        }
        context.globalState.update(k, undefined);
    }
    if (incoming.length) {
        context.globalState.update('savedVoicings', [...existing, ...incoming]);
    }
}
async function backfillChordFileFrets(context, chordRefProvider) {
    const chordFiles = context.globalState.get('chordFiles') || {};
    // Collect unique URIs that still have at least one null-frets entry
    const urisToScan = new Set();
    for (const entries of Object.values(chordFiles)) {
        for (const e of entries) {
            if (typeof e === 'object' && e.frets === null) urisToScan.add(e.uri);
        }
    }
    if (!urisToScan.size) return;
    let changed = false;
    for (const uriStr of urisToScan) {
        try {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(uriStr));
            if (doc.languageId !== 'chordpro') continue;
            const defines = parseDocumentDefines(doc);
            if (!Object.keys(defines).length) continue;
            for (const [name, entries] of Object.entries(chordFiles)) {
                const entry = entries.find(e => typeof e === 'object' && e.uri === uriStr && e.frets === null);
                if (entry && defines[name]) { entry.frets = defines[name]; changed = true; }
            }
        } catch (_) { /* file may no longer exist */ }
    }
    if (changed) {
        await context.globalState.update('chordFiles', chordFiles);
        if (chordRefProvider) chordRefProvider.nudge();
    }
}
// ─────────────────────────────────────────────────────────────────────────────

class ChordBuilderViewProvider {
    constructor(context) {
        this.context = context;
        this._view = null;
    }

    // Load a chord into the builder (frets: lowE→highE absolute)
    loadChord(name, frets, fingers) {
        if (!this._view) return;
        const hiToLo = [...frets].reverse(); // Builder uses highE→lowE
        const fingersHiToLo = fingers ? [...fingers].reverse() : null;
        this._view.webview.postMessage({ command: 'loadChord', name, frets: hiToLo, fingers: fingersHiToLo });
    }

    resolveWebviewView(webviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = getWebviewContent();

        webviewView.webview.onDidReceiveMessage(async message => {
            if (message.command === 'insertInline') {
                const chord = message.chord;
                addSavedVoicing(this.context, chord);
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.env.clipboard.writeText('[' + chord.name + ']');
                    vscode.window.showInformationMessage('No active editor — chord name copied to clipboard');
                } else {
                    editor.insertSnippet(new vscode.SnippetString('[' + chord.name + ']$0'));
                }
            }

            if (message.command === 'insertChordDirective') {
                const chord = message.chord;
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.env.clipboard.writeText('{chord: ' + chord.name + '}\n' + toChordProDefine(chord));
                    vscode.window.showInformationMessage('No active editor — directive copied to clipboard');
                    addSavedVoicing(this.context, chord);
                } else {
                    const existingDefines = parseDocumentDefines(editor.document);
                    if (existingDefines[chord.name]) {
                        const nextName = nextVoicingName(editor.document, chord.name);
                        const lines = editor.document.getText().split('\n');
                        const matchRe = new RegExp(`^\\s*\\{(?:define|chord):?\\s+${escapeRegex(chord.name)}[\\s}]`, 'i');
                        const lineIdx = lines.findIndex(l => matchRe.test(l));
                        const answer = await vscode.window.showInformationMessage(
                            `"${chord.name}" is already defined in this file.`,
                            'Go to definition', 'Replace', `Add as ${nextName}`
                        );
                        if (answer === 'Go to definition') {
                            if (lineIdx >= 0) {
                                const pos = new vscode.Position(lineIdx, 0);
                                editor.selection = new vscode.Selection(pos, pos);
                                editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
                            }
                        } else if (answer === 'Replace') {
                            if (lineIdx >= 0) {
                                await editor.edit(eb => eb.replace(
                                    new vscode.Range(lineIdx, 0, lineIdx, lines[lineIdx].length),
                                    toChordProDefine(chord)
                                ));
                            }
                            const cursorPos = editor.selection.active;
                            await editor.edit(eb => eb.insert(cursorPos, '{chord: ' + chord.name + '}\n'));
                            addSavedVoicing(this.context, chord);
                        } else if (answer === `Add as ${nextName}`) {
                            const newChord = Object.assign({}, chord, { name: nextName });
                            const insertLine = findDefineInsertLine(editor.document);
                            await editor.edit(eb => eb.insert(new vscode.Position(insertLine, 0), toChordProDefine(newChord) + '\n'));
                            const cursorPos = editor.selection.active;
                            await editor.edit(eb => eb.insert(cursorPos, '{chord: ' + nextName + '}\n'));
                            addSavedVoicing(this.context, newChord);
                        }
                    } else {
                        addSavedVoicing(this.context, chord);
                        const cursorPos = editor.selection.active;
                        await editor.edit(eb => eb.insert(cursorPos, '{chord: ' + chord.name + '}\n'));
                        const insertLine = findDefineInsertLine(editor.document);
                        editor.edit(eb => eb.insert(new vscode.Position(insertLine, 0), toChordProDefine(chord) + '\n'));
                    }
                }
            }

            if (message.command === 'insertDefine') {
                const chord = message.chord;
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.env.clipboard.writeText(toChordProDefine(chord));
                    vscode.window.showInformationMessage('No active editor — definition copied to clipboard');
                    addSavedVoicing(this.context, chord);
                } else {
                    const existingDefines = parseDocumentDefines(editor.document);
                    if (existingDefines[chord.name]) {
                        const nextName = nextVoicingName(editor.document, chord.name);
                        const lines = editor.document.getText().split('\n');
                        const matchRe = new RegExp(`^\\s*\\{(?:define|chord):?\\s+${escapeRegex(chord.name)}[\\s}]`, 'i');
                        const lineIdx = lines.findIndex(l => matchRe.test(l));
                        const answer = await vscode.window.showInformationMessage(
                            `"${chord.name}" is already defined in this file.`,
                            'Go to definition', 'Replace', `Add as ${nextName}`
                        );
                        if (answer === 'Go to definition') {
                            if (lineIdx >= 0) {
                                const pos = new vscode.Position(lineIdx, 0);
                                editor.selection = new vscode.Selection(pos, pos);
                                editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
                            }
                        } else if (answer === 'Replace') {
                            if (lineIdx >= 0) {
                                await editor.edit(eb => eb.replace(
                                    new vscode.Range(lineIdx, 0, lineIdx, lines[lineIdx].length),
                                    toChordProDefine(chord)
                                ));
                            }
                            addSavedVoicing(this.context, chord);
                        } else if (answer === `Add as ${nextName}`) {
                            const newChord = Object.assign({}, chord, { name: nextName });
                            const insertLine = findDefineInsertLine(editor.document);
                            await editor.edit(eb => eb.insert(new vscode.Position(insertLine, 0), toChordProDefine(newChord) + '\n'));
                            addSavedVoicing(this.context, newChord);
                        }
                    } else {
                        addSavedVoicing(this.context, chord);
                        const insertLine = findDefineInsertLine(editor.document);
                        editor.edit(eb => eb.insert(new vscode.Position(insertLine, 0), toChordProDefine(chord) + '\n'));
                    }
                }
            }

            if (message.command === 'detectChord') {
                const groups = detectChord(message.frets);
                webviewView.webview.postMessage({ command: 'chordSuggestions', groups });
            }
        });
    }
}

function getWebviewContent() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Chord Builder</title>
<style>
* { box-sizing: border-box; }
/* Linear Violet palette — dark default, light when VS Code is in light theme */
:root {
  --bg: #131215; --surf: #1e1c22; --surf-hi: #262329;
  --text: #e6e8ef; --muted: #8b8fa3; --border: #2e2b36;
  --accent: #7c6af6; --accent-soft: rgba(124,106,246,0.15); --danger: #e5534b;
  --string: #6a7286;
}
body.vscode-light, body.vscode-high-contrast-light {
  --bg: #fafbfc; --surf: #ffffff; --surf-hi: #f0f3f9;
  --text: #0f1117; --muted: #64748b; --border: #dde1eb;
  --accent: #5e4fd8; --accent-soft: rgba(94,79,216,0.10); --danger: #cc3a33;
  --string: #94a3b8;
}

body { margin: 0; padding: 8px; background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; overflow: hidden; }
#wrapper { display: inline-block; }
#top { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; width: 100%; }
#chordName { flex: 1; min-width: 0; padding: 5px 10px; font-size: 13px; background: var(--surf); color: var(--text); border: 1px solid var(--border); border-radius: 5px; outline: none; font-family: inherit; transition: border-color 0.15s, box-shadow 0.15s; }
#chordName:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.insert-label { font-size: 11px; color: var(--muted); white-space: nowrap; }
#saveBtn, #saveDefineBtn, #saveDefineOnlyBtn, #shiftDownBtn, #shiftUpBtn { padding: 5px 10px; font-size: 11px; cursor: pointer; background: var(--surf); color: var(--text); border: 1px solid var(--border); border-radius: 5px; white-space: nowrap; font-family: inherit; transition: all 0.12s ease; }
#saveBtn:hover, #saveDefineBtn:hover, #saveDefineOnlyBtn:hover, #shiftDownBtn:hover, #shiftUpBtn:hover { background: var(--surf-hi); border-color: var(--accent); color: var(--accent); }
#fingeringToggle { display: flex; align-items: center; gap: 7px; font-size: 11px; color: var(--muted); cursor: pointer; user-select: none; }
.toggle-track { width: 30px; height: 17px; border-radius: 9px; background: var(--border); position: relative; transition: background 0.2s; flex-shrink: 0; }
#fingeringToggle.active .toggle-track { background: var(--accent); }
.toggle-thumb { width: 13px; height: 13px; border-radius: 50%; background: #fff; position: absolute; top: 2px; left: 2px; transition: left 0.18s; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
#fingeringToggle.active .toggle-thumb { left: 15px; }
#dot-mode-wrap { margin-top: 12px; }
#dot-mode-label { font-size: 10px; color: var(--muted); margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
#dot-mode-btns { display: flex; background: var(--border); border-radius: 8px; padding: 2px; gap: 2px; }
.dm-btn { flex: 1; font-size: 11px; font-weight: 500; padding: 6px 4px; background: transparent; color: var(--muted); border: none; border-radius: 6px; cursor: pointer; font-family: inherit; transition: all 0.15s ease; white-space: nowrap; line-height: 1; }
.dm-btn.active { background: var(--accent); color: #fff; font-weight: 600; box-shadow: 0 1px 4px rgba(0,0,0,0.25); }
#resetBtn { margin-left: 6px; padding: 4px 9px; font-size: 14px; line-height: 1; cursor: pointer; background: transparent; color: var(--danger); border: 1px solid var(--danger); border-radius: 5px; transition: all 0.12s ease; }
#resetBtn:hover { background: var(--danger); color: var(--bg); }
#fretboard { display: inline-flex; flex-direction: column; position: relative; background: var(--surf); border: 1px solid var(--border); border-radius: 6px; padding: 4px; margin-top: 4px; }
.string-row { display: flex; align-items: center; height: 32px; position: relative; }
.string-line { position: absolute; right: 0; top: 50%; transform: translateY(-50%); pointer-events: none; z-index: 2; background: var(--string); }
.string-indicator { width: 24px; height: 24px; flex-shrink: 0; margin-right: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 12px; font-weight: bold; border-radius: 50%; border: 2px solid; user-select: none; z-index: 4; position: relative; background: var(--bg); transition: all 0.12s ease; }
.string-indicator.muted  { color: var(--danger); border-color: var(--danger); }
.string-indicator.open   { color: var(--accent); border-color: var(--accent); }
.string-indicator.played { color: var(--muted); border-color: var(--muted); opacity: 0.4; }
.fret-cell { width: 40px; height: 32px; flex-shrink: 0; border-right: 1px solid var(--border); background: transparent; display: flex; align-items: center; justify-content: center; cursor: pointer; position: relative; z-index: 3; transition: background 0.1s; }
.fret-cell:hover { background: var(--accent-soft); }
.fret-cell.nut { border-left: 4px solid var(--text); }
.string-row:first-child .fret-cell { border-top: 1px solid var(--border); }
.string-row:last-child  .fret-cell { border-bottom: 1px solid var(--border); }
.finger-dot { width: 26px; height: 26px; border-radius: 50%; background: var(--accent); display: none; align-items: center; justify-content: center; position: absolute; z-index: 5; box-shadow: 0 1px 4px rgba(0,0,0,0.5); pointer-events: none; }
.fret-cell.selected .finger-dot { display: flex; }
.dot-note { font-size: 13px; font-weight: 700; color: #fff; line-height: 1; pointer-events: none; letter-spacing: -0.5px; }
#fret-numbers { display: flex; padding-left: 28px; margin-top: 4px; }
.fret-num { width: 40px; text-align: center; font-size: 10px; color: var(--muted); flex-shrink: 0; }
#suggestions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; min-height: 22px; align-items: center; }
#suggestions > span { font-size: 11px; color: var(--muted); }
.suggestion { padding: 3px 10px; font-size: 12px; cursor: pointer; background: var(--surf); color: var(--text); border: 1px solid var(--border); border-radius: 12px; user-select: none; transition: all 0.12s ease; }
.suggestion:hover { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
#outer-row { display: flex; gap: 16px; align-items: flex-start; }
#right-col { display: flex; flex-direction: column; align-items: center; gap: 8px; margin-top: 0; align-self: flex-start; }
#mini-diagram { user-select: none; }
.mini-svg .m-nut { fill: var(--text); }
.mini-svg .m-grid { stroke: var(--border); }
.mini-svg .m-string { stroke: var(--string); }
.mini-svg .m-dot { fill: var(--accent); }
.mini-svg .m-dot-text { fill: #ffffff; }
.mini-svg .m-x { fill: var(--danger); }
.mini-svg .m-o { stroke: var(--text); fill: none; }
.mini-svg .m-label { fill: var(--muted); }
</style>
</head>
<body>
<div id="outer-row">
  <div id="wrapper">
    <div id="top">
      <input id="chordName" placeholder="Chord name" />
      <span class="insert-label">Insert:</span>
      <button id="saveBtn" title="Insert [CHORD] inline at cursor">Inline</button>
      <button id="saveDefineBtn" title="Insert {chord: CHORD} at cursor and add {define:} to file">{chord:}</button>
      <button id="saveDefineOnlyBtn" title="Add {define:} to file (in defines section)">{define:}</button>
      <button id="resetBtn" title="Reset fretboard">↺</button>
      <button id="shiftDownBtn" title="Shift all frets down by 1">−1</button>
      <button id="shiftUpBtn" title="Shift all frets up by 1">+1</button>
    </div>
    <div id="fretboard"></div>
    <div id="fret-numbers"></div>
    <div id="suggestions"><span>play some strings...</span></div>
  </div>
  <div id="right-col">
    <div id="mini-diagram"></div>
    <div id="fingeringToggle">Fingering <span class="toggle-track"><span class="toggle-thumb"></span></span></div>
    <div id="fingering-hint" style="display:none;font-size:10px;text-align:center;line-height:1.5;max-width:100px;color:var(--muted);">Click a dot to cycle finger (1–4)</div>
    <div id="dot-mode-wrap">
      <div id="dot-mode-label">Show in dots</div>
      <div id="dot-mode-btns">
        <button class="dm-btn active" data-mode="notes">Notes</button>
        <button class="dm-btn" data-mode="intervals">Intervals</button>
      </div>
    </div>
  </div>
</div>
<script>
const vscode = acquireVsCodeApi();
const NUM_STRINGS = 6, NUM_FRETS = 15, ROW_H = 32, FRET_W = 40, INDICATOR_W = 28;
const OPEN_SEMITONES = [4, 11, 7, 2, 9, 4]; // highE→lowE: E B G D A E (matches fretsArray index 0=highE)
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const INTERVAL_NAMES = ['1','b2','2','m3','3','4','b5','5','#5','6','b7','maj7'];
const ROOT_SEMITONES = {C:0,D:2,E:4,F:5,G:7,A:9,B:11};
function noteName(s, fret) { return NOTE_NAMES[(OPEN_SEMITONES[s] + fret) % 12]; }
function parseRoot(chordName) {
    if (!chordName) return null;
    const m = chordName.match(/^([A-G])([#b]?)/);
    if (!m) return null;
    let n = ROOT_SEMITONES[m[1]];
    if (m[2] === '#') n = (n + 1) % 12;
    if (m[2] === 'b') n = (n + 11) % 12;
    return n;
}
function intervalName(s, fret, root) {
    return INTERVAL_NAMES[((OPEN_SEMITONES[s] + fret) - root + 12) % 12];
}
function dotLabel(s, fret) {
    if (displayMode === 'intervals') {
        const root = parseRoot(document.getElementById('chordName').value.trim());
        return root !== null ? intervalName(s, fret, root) : noteName(s, fret);
    }
    return noteName(s, fret);
}
let displayMode = 'notes';
let manualChordName = false;
const STRING_THICKNESS = [1.0, 1.3, 1.7, 2.2, 2.8, 3.5];
let fretsArray = Array(NUM_STRINGS).fill(-1);
let fingersOverride = Array(NUM_STRINGS).fill(null);
let fingeringActive = false;
let isDragging = false, dragFret = 0;
let builderUndoStack = [];
let builderRedoStack = [];
function builderPushUndo() {
    builderUndoStack.push({ f: fretsArray.slice(), g: fingersOverride.slice() });
    if (builderUndoStack.length > 50) builderUndoStack.shift();
    builderRedoStack = [];
}
const fretboardDiv = document.getElementById('fretboard');
const fretNumbersDiv = document.getElementById('fret-numbers');

for (let s = 0; s < NUM_STRINGS; s++) {
    const row = document.createElement('div');
    row.className = 'string-row';
    const indicator = document.createElement('div');
    indicator.className = 'string-indicator muted';
    indicator.innerText = 'X';
    indicator.addEventListener('click', () => { builderPushUndo(); fretsArray[s] = (fretsArray[s] === 0) ? -1 : 0; fingersOverride[s] = null; updateDisplay(); });
    row.appendChild(indicator);
    for (let f = 1; f <= NUM_FRETS; f++) {
        const cell = document.createElement('div');
        cell.className = 'fret-cell' + (f === 1 ? ' nut' : '');
        const dot = document.createElement('div');
        dot.className = 'finger-dot';
        const noteSpan = document.createElement('span');
        noteSpan.className = 'dot-note';
        dot.appendChild(noteSpan);
        cell.appendChild(dot);
        cell.addEventListener('mousedown', (e) => {
            e.preventDefault();
            builderPushUndo();
            const next = (fretsArray[s] === f) ? -1 : f;
            fretsArray[s] = next;
            fingersOverride[s] = null;
            isDragging = (next === f);
            dragFret = f;
            updateDisplay();
        });
        cell.addEventListener('mouseenter', () => {
            if (!isDragging || f !== dragFret) return;
            fretsArray[s] = f;
            fingersOverride[s] = null;
            updateDisplay();
        });
        row.appendChild(cell);
    }
    const sl = document.createElement('div');
    sl.className = 'string-line';
    sl.style.left = INDICATOR_W + 'px';
    sl.style.height = STRING_THICKNESS[s] + 'px';
    row.appendChild(sl);
    fretboardDiv.appendChild(row);
}
window.addEventListener('mouseup', () => { isDragging = false; });

const overlay = document.createElement('div');
overlay.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:1;';
function mkMarker(x, y) {
    const m = document.createElement('div');
    m.style.cssText = \`position:absolute;width:7px;height:7px;border-radius:50%;background:var(--muted);opacity:0.35;left:\${x}px;top:\${y}px;transform:translate(-50%,-50%);\`;
    return m;
}
for (const f of [3,5,7,9]) { overlay.appendChild(mkMarker(INDICATOR_W + (f-0.5)*FRET_W, 3*ROW_H)); }
overlay.appendChild(mkMarker(INDICATOR_W + 11.5*FRET_W, 2*ROW_H));
overlay.appendChild(mkMarker(INDICATOR_W + 11.5*FRET_W, 4*ROW_H));
fretboardDiv.appendChild(overlay);

for (let f = 1; f <= NUM_FRETS; f++) {
    const n = document.createElement('div');
    n.className = 'fret-num';
    n.innerText = String(f);
    fretNumbersDiv.appendChild(n);
}

function updateMiniDiagram() {
    const playedFrets = fretsArray.filter(f => f > 0);
    const W = 138, ML = 28, MR = 9, MT = 26, MB = 12;
    const SHOW = 4, NS = NUM_STRINGS;
    const gW = W - ML - MR, gH = 140;
    const ss = gW / (NS - 1), fs = gH / SHOW;
    const sx = c => ML + c * ss;
    const fy = r => MT + r * fs;
    const cy = r => fy(r) + fs / 2;
    const H = MT + gH + MB;
    const baseFret = playedFrets.length ? Math.min(...playedFrets) : 1;
    const strThick = [3.5, 2.8, 2.2, 1.7, 1.3, 1.0];
    let svg = '';

    if (baseFret === 1) {
        svg += '<rect class="m-nut" x="' + sx(0) + '" y="' + (MT-6) + '" width="' + gW + '" height="8" rx="3"/>';
    } else {
        svg += '<text class="m-label" x="' + (ML-3) + '" y="' + (cy(0)+6) + '" font-size="17" font-weight="bold" text-anchor="end">' + baseFret + '</text>';
    }
    for (let r = (baseFret === 1 ? 1 : 0); r <= SHOW; r++) {
        svg += '<line class="m-grid" x1="' + sx(0) + '" y1="' + fy(r) + '" x2="' + sx(NS-1) + '" y2="' + fy(r) + '" stroke-width="1.2"/>';
    }
    for (let c = 0; c < NS; c++) {
        const pi = NS-1-c;
        svg += '<line class="m-string" x1="' + sx(c) + '" y1="' + MT + '" x2="' + sx(c) + '" y2="' + fy(SHOW) + '" stroke-width="' + strThick[c] + '"/>';
        const fv = fretsArray[pi];
        if (fv === -1) { svg += '<text class="m-x" x="' + sx(c) + '" y="' + (MT-12) + '" font-size="16" text-anchor="middle">x</text>'; }
        else if (fv === 0) { svg += '<circle class="m-o" cx="' + sx(c) + '" cy="' + (MT-15) + '" r="7" stroke-width="2"/>'; }
    }

    for (let c = 0; c < NS; c++) {
        const pi = NS-1-c, fv = fretsArray[pi];
        if (fv <= 0) continue;
        const br = fv - baseFret;
        if (br < 0 || br >= SHOW) continue;
        const r = fs*0.27, fn = fingersOverride[pi] || 0;
        if (fingeringActive) {
            svg += '<circle class="fdot m-dot" data-pi="' + pi + '" cx="' + sx(c) + '" cy="' + cy(br) + '" r="' + r + '" style="cursor:pointer"/>';
            if (fn > 0) { svg += '<text class="m-dot-text" x="' + sx(c) + '" y="' + (cy(br)+4) + '" font-size="12" text-anchor="middle" pointer-events="none">' + fn + '</text>'; }
        } else {
            svg += '<circle class="m-dot" cx="' + sx(c) + '" cy="' + cy(br) + '" r="' + r + '"/>';
        }
    }

    document.getElementById('mini-diagram').innerHTML =
        '<svg class="mini-svg" width="' + W + '" height="' + H + '" xmlns="http://www.w3.org/2000/svg">' + svg + '</svg>';

    if (fingeringActive) {
        const cycle = cur => (cur === null || cur === 0) ? 1 : cur >= 4 ? null : cur + 1;
        document.querySelectorAll('#mini-diagram .fdot').forEach(el => {
            el.addEventListener('click', () => {
                const pi = parseInt(el.getAttribute('data-pi'));
                fingersOverride[pi] = cycle(fingersOverride[pi]);
                updateMiniDiagram();
            });
        });
    }
}

function updateDisplay() {
    const rows = fretboardDiv.children;
    for (let s = 0; s < NUM_STRINGS; s++) {
        const row = rows[s], indic = row.children[0], val = fretsArray[s];
        if (val === -1)     { indic.className = 'string-indicator muted';  indic.innerText = 'X'; }
        else if (val === 0) { indic.className = 'string-indicator open';   indic.innerText = dotLabel(s, 0); }
        else                { indic.className = 'string-indicator played';  indic.innerText = ''; }
        for (let f = 1; f <= NUM_FRETS; f++) {
            const cell = row.children[f];
            cell.classList.toggle('selected', val === f);
            const ns = cell.querySelector('.dot-note');
            if (ns) ns.textContent = val === f ? dotLabel(s, f) : '';
        }
    }
    updateMiniDiagram();
    vscode.postMessage({ command: 'detectChord', frets: [...fretsArray] });
}

window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.command !== 'chordSuggestions') { return; }
    const div = document.getElementById('suggestions');
    div.innerHTML = '';
    if (!msg.groups.length) { div.innerHTML = '<span>no chord found</span>'; return; }
    // Auto-fill best guess unless user has typed a custom name
    if (!manualChordName) {
        const bestGuess = msg.groups[0][0];
        const nameField = document.getElementById('chordName');
        if (nameField.value !== bestGuess) {
            nameField.value = bestGuess;
            updateDisplay(); // refresh interval labels with new root
        }
    }
    const pickName = name => {
        document.getElementById('chordName').value = name;
        manualChordName = true;
        updateDisplay();
    };
    msg.groups.forEach(group => {
        if (group.length > 1) {
            const stack = document.createElement('div');
            stack.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
            group.forEach(name => {
                const btn = document.createElement('div');
                btn.className = 'suggestion';
                btn.innerText = name;
                btn.addEventListener('click', () => pickName(name));
                stack.appendChild(btn);
            });
            div.appendChild(stack);
        } else {
            const btn = document.createElement('div');
            btn.className = 'suggestion';
            btn.innerText = group[0];
            btn.addEventListener('click', () => pickName(group[0]));
            div.appendChild(btn);
        }
    });
});

function doInsert(cmd) {
    const name = document.getElementById('chordName').value.trim();
    if (!name) { alert('Enter chord name'); return; }
    const hasFingers = fingeringActive && fingersOverride.some(f => f !== null && f > 0);
    const fingers = hasFingers ? fingersOverride.map(f => f === null ? 0 : f) : null;
    vscode.postMessage({ command: cmd, chord: { name, frets: [...fretsArray], fingers } });
}
document.getElementById('saveBtn').addEventListener('click', () => doInsert('insertInline'));
document.getElementById('saveDefineBtn').addEventListener('click', () => doInsert('insertChordDirective'));
document.getElementById('saveDefineOnlyBtn').addEventListener('click', () => doInsert('insertDefine'));
document.getElementById('chordName').addEventListener('keydown', e => { if (e.key === 'Enter') { doInsert('insertInline'); } });
document.getElementById('fingeringToggle').addEventListener('click', () => {
    fingeringActive = !fingeringActive;
    document.getElementById('fingeringToggle').classList.toggle('active', fingeringActive);
    document.getElementById('fingering-hint').style.display = fingeringActive ? 'block' : 'none';
    updateMiniDiagram();
});
document.querySelectorAll('.dm-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        displayMode = btn.dataset.mode;
        document.querySelectorAll('.dm-btn').forEach(b => b.classList.toggle('active', b === btn));
        updateDisplay();
    });
});
document.getElementById('chordName').addEventListener('input', () => {
    manualChordName = document.getElementById('chordName').value.trim().length > 0;
    updateDisplay();
});
document.getElementById('resetBtn').addEventListener('click', () => {
    fretsArray = Array(NUM_STRINGS).fill(-1);
    fingersOverride = Array(NUM_STRINGS).fill(null);
    manualChordName = false;
    document.getElementById('chordName').value = '';
    document.getElementById('suggestions').innerHTML = '<span>play some strings...</span>';
    updateDisplay();
});

document.getElementById('shiftUpBtn').addEventListener('click', () => {
    const hasFretted = fretsArray.some(f => f >= 0);
    if (!hasFretted) return;
    builderPushUndo();
    fretsArray = fretsArray.map(f => f === -1 ? -1 : Math.min(f + 1, NUM_FRETS));
    updateDisplay();
});
document.getElementById('shiftDownBtn').addEventListener('click', () => {
    const minFret = Math.min(...fretsArray.filter(f => f > 0));
    if (!isFinite(minFret) || minFret <= 1) return;
    builderPushUndo();
    fretsArray = fretsArray.map(f => f === -1 ? -1 : f === 0 ? 0 : f - 1);
    updateDisplay();
});
document.addEventListener('keydown', e => {
    if (e.ctrlKey && !e.shiftKey && e.key === 'z' && builderUndoStack.length) {
        builderRedoStack.push({ f: fretsArray.slice(), g: fingersOverride.slice() });
        const prev = builderUndoStack.pop();
        fretsArray = prev.f; fingersOverride = prev.g;
        updateDisplay(); e.preventDefault();
    } else if (e.ctrlKey && e.shiftKey && (e.key === 'z' || e.key === 'Z') && builderRedoStack.length) {
        builderUndoStack.push({ f: fretsArray.slice(), g: fingersOverride.slice() });
        const next = builderRedoStack.pop();
        fretsArray = next.f; fingersOverride = next.g;
        updateDisplay(); e.preventDefault();
    }
});

window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.command === 'loadChord') {
        fretsArray = msg.frets.slice();
        fingersOverride = msg.fingers ? msg.fingers.slice() : Array(NUM_STRINGS).fill(null);
        fingeringActive = msg.fingers && msg.fingers.some(f => f > 0);
        manualChordName = false;
        document.getElementById('chordName').value = msg.name || '';
        document.getElementById('fingeringToggle').classList.toggle('active', fingeringActive);
        document.getElementById('fingering-hint').style.display = fingeringActive ? 'block' : 'none';
        updateDisplay();
        vscode.postMessage({ command: 'detectChord', frets: fretsArray });
    }
});
</script>
</body>
</html>`;
}

// ─────────────────────────────────────────────
// Auto-completion data
// ─────────────────────────────────────────────

const DIRECTIVES = [
    // Metadata
    { label: 'title',                detail: 'Song title',                       snippet: 'title: $1}'                       },
    { label: 'sorttitle',            detail: 'Title used for sorting',           snippet: 'sorttitle: $1}'                   },
    { label: 'subtitle',             detail: 'Song subtitle',                    snippet: 'subtitle: $1}'                    },
    { label: 'artist',               detail: 'Artist / performer name',          snippet: 'artist: $1}'                      },
    { label: 'sortartist',           detail: 'Artist name used for sorting',     snippet: 'sortartist: $1}'                  },
    { label: 'composer',             detail: 'Composer name',                    snippet: 'composer: $1}'                    },
    { label: 'lyricist',             detail: 'Lyricist name',                    snippet: 'lyricist: $1}'                    },
    { label: 'copyright',            detail: 'Copyright info',                   snippet: 'copyright: $1}'                   },
    { label: 'album',                detail: 'Album name',                       snippet: 'album: $1}'                       },
    { label: 'year',                 detail: 'Year of publication',              snippet: 'year: $1}'                        },
    { label: 'key',                  detail: 'Song key (e.g. C, Am)',            snippet: 'key: $1}'                         },
    { label: 'time',                 detail: 'Time signature (e.g. 4/4)',        snippet: 'time: $1}'                        },
    { label: 'tempo',                detail: 'Tempo in BPM',                     snippet: 'tempo: $1}'                       },
    { label: 'duration',             detail: 'Song duration',                    snippet: 'duration: $1}'                    },
    { label: 'capo',                 detail: 'Capo position (fret number)',       snippet: 'capo: $1}'                        },
    { label: 'tag',                  detail: 'Arbitrary tag / label',            snippet: 'tag: $1}'                         },
    { label: 'meta',                 detail: 'Custom metadata key-value',        snippet: 'meta: $1}'                        },
    // Sections
    { label: 'start_of_chorus',      detail: 'Start chorus section',             snippet: 'start_of_chorus}\n$1\n{end_of_chorus}'     },
    { label: 'end_of_chorus',        detail: 'End chorus section',               snippet: 'end_of_chorus}'                                },
    { label: 'chorus',               detail: 'Repeat / reference chorus inline', snippet: 'chorus}'                                       },
    { label: 'start_of_verse',       detail: 'Start verse section',              snippet: 'start_of_verse}\n$1\n{end_of_verse}'           },
    { label: 'end_of_verse',         detail: 'End verse section',                snippet: 'end_of_verse}'                                 },
    { label: 'start_of_bridge',      detail: 'Start bridge section',             snippet: 'start_of_bridge}\n$1\n{end_of_bridge}'         },
    { label: 'end_of_bridge',        detail: 'End bridge section',               snippet: 'end_of_bridge}'                                },
    { label: 'start_of_tab',         detail: 'Start tablature section',          snippet: 'start_of_tab}\n$1\n{end_of_tab}'               },
    { label: 'end_of_tab',           detail: 'End tablature section',            snippet: 'end_of_tab}'                                   },
    { label: 'start_of_grid',        detail: 'Start chord grid section',         snippet: 'start_of_grid}\n$1\n{end_of_grid}'             },
    { label: 'end_of_grid',          detail: 'End chord grid section',           snippet: 'end_of_grid}'                                  },
    { label: 'x_columns_on',         detail: 'Start two-column zone (extension)',snippet: 'x_columns_on}'                                 },
    { label: 'x_columns_off',        detail: 'End two-column zone (extension)',  snippet: 'x_columns_off}'                                },
    { label: 'x_start_section',            detail: 'Labeled section with badge (extension)', snippet: 'x_start_section: $1}\n$2\n{x_end_section}'   },
    { label: 'x_end_section',        detail: 'End labeled section (extension)',  snippet: 'x_end_section}'                               },
    { label: 'x_start_side_panel',    detail: 'Start custom side panel block (extension)', snippet: 'x_start_side_panel}\n{x_panel_section_title: $1}\n{chord: $2}\n{x_end_side_panel}' },
    { label: 'x_end_side_panel',      detail: 'End custom side panel block (extension)',   snippet: 'x_end_side_panel}'                  },
    { label: 'x_panel_section_title', detail: 'Section title inside side panel (extension)', snippet: 'x_panel_section_title: $1}'      },
    { label: 'start_of_textblock',   detail: 'Start raw text block',             snippet: 'start_of_textblock}\n$1\n{end_of_textblock}'   },
    { label: 'end_of_textblock',     detail: 'End raw text block',               snippet: 'end_of_textblock}'                             },
    { label: 'start_of_abc',         detail: 'Start ABC music notation block',   snippet: 'start_of_abc}\n$1\n{end_of_abc}'  },
    { label: 'end_of_abc',           detail: 'End ABC music notation block',     snippet: 'end_of_abc}'                      },
    { label: 'start_of_ly',          detail: 'Start LilyPond notation block',    snippet: 'start_of_ly}\n$1\n{end_of_ly}'    },
    { label: 'end_of_ly',            detail: 'End LilyPond notation block',      snippet: 'end_of_ly}'                       },
    { label: 'start_of_svg',         detail: 'Start SVG content block',          snippet: 'start_of_svg}\n$1\n{end_of_svg}'  },
    { label: 'end_of_svg',           detail: 'End SVG content block',            snippet: 'end_of_svg}'                      },
    // Comments & formatting
    { label: 'comment',              detail: 'Inline comment / annotation',      snippet: 'comment: $1}'                     },
    { label: 'comment_italic',       detail: 'Italic comment',                   snippet: 'comment_italic: $1}'              },
    { label: 'comment_box',          detail: 'Boxed comment',                    snippet: 'comment_box: $1}'                 },
    { label: 'highlight',            detail: 'Highlighted text',                 snippet: 'highlight: $1}'                   },
    { label: 'image',                detail: 'Embed an image',                   snippet: 'image: src="$1"}'                 },
    { label: 'columns',              detail: 'Number of layout columns',         snippet: 'columns: $1}'                     },
    { label: 'column_break',         detail: 'Force column break',               snippet: 'column_break}'                    },
    { label: 'new_page',             detail: 'Force new page',                   snippet: 'new_page}'                        },
    { label: 'new_physical_page',    detail: 'Force new physical page',          snippet: 'new_physical_page}'               },
    { label: 'pagetype',             detail: 'Set page layout type',             snippet: 'pagetype: $1}'                    },
    // Chord definitions & transposition
    { label: 'define',               detail: 'Define a chord fingering',         snippet: 'define: $1 base-fret $2 frets $3}'},
    { label: 'chord',                detail: 'Inline chord definition',          snippet: 'chord: $1}'                       },
    { label: 'transpose',            detail: 'Transpose the song',               snippet: 'transpose: $1}'                   },
    // Font / size / colour — chords
    { label: 'chordfont',            detail: 'Chord font name',                  snippet: 'chordfont: $1}'                   },
    { label: 'chordsize',            detail: 'Chord font size',                  snippet: 'chordsize: $1}'                   },
    { label: 'chordcolour',          detail: 'Chord colour',                     snippet: 'chordcolour: $1}'                 },
    // Font / size / colour — lyrics
    { label: 'textfont',             detail: 'Lyrics font name',                 snippet: 'textfont: $1}'                    },
    { label: 'textsize',             detail: 'Lyrics font size',                 snippet: 'textsize: $1}'                    },
    { label: 'textcolour',           detail: 'Lyrics colour',                    snippet: 'textcolour: $1}'                  },
    // Font / size / colour — title
    { label: 'titlefont',            detail: 'Title font name',                  snippet: 'titlefont: $1}'                   },
    { label: 'titlesize',            detail: 'Title font size',                  snippet: 'titlesize: $1}'                   },
    { label: 'titlecolour',          detail: 'Title colour',                     snippet: 'titlecolour: $1}'                 },
    // Font / size / colour — chorus
    { label: 'chorusfont',           detail: 'Chorus font name',                 snippet: 'chorusfont: $1}'                  },
    { label: 'chorussize',           detail: 'Chorus font size',                 snippet: 'chorussize: $1}'                  },
    { label: 'choruscolour',         detail: 'Chorus colour',                    snippet: 'choruscolour: $1}'                },
    // Font / size / colour — tab
    { label: 'tabfont',              detail: 'Tablature font name',              snippet: 'tabfont: $1}'                     },
    { label: 'tabsize',              detail: 'Tablature font size',              snippet: 'tabsize: $1}'                     },
    { label: 'tabcolour',            detail: 'Tablature colour',                 snippet: 'tabcolour: $1}'                   },
    // Legacy / misc
    { label: 'diagrams',             detail: 'Toggle chord diagrams (legacy)',   snippet: 'diagrams: $1}'                    },
    { label: 'grid',                 detail: 'Show chord grids (legacy)',        snippet: 'grid}'                            },
    { label: 'no_grid',              detail: 'Hide chord grids (legacy)',        snippet: 'no_grid}'                         },
    { label: 'titles',               detail: 'Toggle titles (legacy)',           snippet: 'titles: $1}'                      },
];

const CHORD_ROOTS = ['C','C#','Db','D','D#','Eb','E','F','F#','Gb','G','G#','Ab','A','A#','Bb','B'];
const CHORD_QUALITIES = [
    '', 'm', '7', 'm7', 'maj7', 'maj9', 'maj11', 'maj13',
    'sus2', 'sus4', 'add9', 'add4',
    'dim', 'dim7', 'aug',
    '5', '6', 'm6', '69',
    '9', 'm9', '11', '13',
    '7sus4', '7b9', '7#9', '7b5', '7#5',
    'm7b5', 'mmaj7',
];
const COMPLETION_CHORDS = CHORD_ROOTS.flatMap(r => CHORD_QUALITIES.map(q => r + q));

const RENDER_OPTIONS = {
    config: {
        description: 'ChordPro config preset or path to a custom `.json` config file (absolute or relative to the `.cho` file).',
        presets: ['modern1', 'modern2', 'modern3', 'nashville', 'nashville2', 'rock', 'ukulele', 'dark', 'default'],
        placeholder: 'e.g. modern1, dark, or ./myconfig.json',
    },
    suffix: {
        description: 'String appended to the output filename: `songname_<suffix>.pdf`.',
        placeholder: 'e.g. lyrics_only',
    },
    output: {
        description: 'Full output PDF filename. Overrides the default name derived from the source file.',
        placeholder: 'e.g. mysong_final.pdf',
    },
    options: {
        description: 'Additional ChordPro CLI flags passed verbatim to the renderer.',
        placeholder: 'e.g. -l --toc --no-chord-grids',
        flags: [
            { flag: '-l',                  detail: 'Lyrics only — hide all chords'              },
            { flag: '--lyrics-only',        detail: 'Lyrics only — hide all chords'              },
            { flag: '--toc',               detail: 'Include a table of contents'                },
            { flag: '--no-toc',            detail: 'Remove the table of contents'               },
            { flag: '--chord-grids',        detail: 'Show all chord diagrams at the end'         },
            { flag: '--user-chord-grids',   detail: 'Show only user-defined chord diagrams'      },
            { flag: '--no-chord-grids',     detail: 'Hide chord diagrams'                        },
            { flag: '--decapo',            detail: 'Apply capo by transposing chords instead'   },
            { flag: '--diagrams=all',       detail: 'Show diagrams for all chords'               },
            { flag: '--diagrams=user',      detail: 'Show diagrams for user-defined chords only' },
            { flag: '--diagrams=none',      detail: 'Suppress all chord diagrams'                },
            { flag: '--page-size=a4',       detail: 'Set page size to A4'                        },
            { flag: '--page-size=letter',   detail: 'Set page size to US Letter'                 },
            { flag: '--start-page-number=1',detail: 'Override starting page number'              },
            { flag: '--strict',            detail: 'Enforce strict ChordPro syntax'             },
            { flag: '--no-strict',         detail: 'Allow relaxed / custom chord names'         },
            { flag: '--generate=pdf',       detail: 'Output as PDF (default)'                    },
            { flag: '--generate=html',      detail: 'Output as HTML'                             },
            { flag: '--generate=txt',       detail: 'Output as plain text'                       },
            { flag: '--generate=cho',       detail: 'Output as normalised ChordPro'              },
            { flag: '-x N',                detail: 'Transpose N semitones (replace N)'          },
            { flag: '--verbose',           detail: 'Print detailed execution log'               },
        ],
    },
};

// ─────────────────────────────────────────────
// Chord Reference Panel
// ─────────────────────────────────────────────
function findDefineInsertLine(document) {
    const lines = document.getText().split('\n');
    const metaRe = /^\{(title|subtitle|artist|composer|lyricist|copyright|album|year|key|time|tempo|capo|duration|sorttitle|sortartist|tag|meta)[\s:}]/i;
    const defineRe = /^\{define:/i;
    let headerEnd = -1;
    for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim();
        if (!t || t.startsWith('#') || t.startsWith('{')) { headerEnd = i; }
        else { break; }
    }
    let lastDefine = -1, lastMeta = -1;
    for (let i = 0; i <= headerEnd; i++) {
        const t = lines[i].trim();
        if (defineRe.test(t)) { lastDefine = i; }
        else if (metaRe.test(t)) { lastMeta = i; }
    }
    return lastDefine >= 0 ? lastDefine + 1 : lastMeta >= 0 ? lastMeta + 1 : 0;
}

class ChordReferenceViewProvider {
    constructor(context) {
        this._ctx = context;
        this._view = undefined;
        this._timer = null;
    }

    resolveWebviewView(view) {
        this._view = view;
        view.webview.options = { enableScripts: true };
        view.webview.html = this._buildHtml();
        view.webview.onDidReceiveMessage(async msg => {
            // ── Delete voicing/chord ──────────────────────────────────────
            if (msg.command === 'deleteVoicing') {
                const { name, voicingFrets, voicingCount } = msg;
                let scope = 'one';
                if (voicingCount > 1) {
                    const pick = await vscode.window.showQuickPick(
                        [
                            { label: `Delete this voicing`, description: `Keep the other ${voicingCount - 1} voicing(s) of ${name}`, value: 'one' },
                            { label: `Delete all voicings of ${name}`, description: 'Remove from My Chords entirely', value: 'all' },
                        ],
                        { placeHolder: `What would you like to delete?` }
                    );
                    if (!pick) return;
                    scope = pick.value;
                }
                if (scope === 'all') {
                    // Hide the chord entirely
                    const hidden = this._ctx.globalState.get('hiddenChords') || [];
                    if (!hidden.includes(name)) {
                        this._ctx.globalState.update('hiddenChords', [...hidden, name]);
                    }
                    // Also remove from savedVoicings
                    const all = (this._ctx.globalState.get('savedVoicings') || []).filter(v => v.name !== name);
                    this._ctx.globalState.update('savedVoicings', all);
                } else {
                    // Suppress just this voicing's fret pattern
                    const fretsKey = JSON.stringify(voicingFrets);
                    const suppressed = this._ctx.globalState.get('suppressedVoicings') || [];
                    if (!suppressed.some(s => s.name === name && s.fretsKey === fretsKey)) {
                        this._ctx.globalState.update('suppressedVoicings', [...suppressed, { name, fretsKey }]);
                    }
                    // Also remove from savedVoicings if it came from there
                    const allV = this._ctx.globalState.get('savedVoicings') || [];
                    const filtered = allV.filter(v => {
                        if (v.name !== name) return true;
                        return JSON.stringify([...v.frets].reverse()) !== fretsKey;
                    });
                    this._ctx.globalState.update('savedVoicings', filtered);
                }
                this.nudge();
                return;
            }

            // ── Open in Chord Builder ─────────────────────────────────────
            if (msg.command === 'openInBuilder') {
                vscode.commands.executeCommand('chordpro.openInBuilder', msg.name, msg.frets, msg.fingers || null);
                return;
            }

            // ── Insert chord ──────────────────────────────────────────────
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            // Snapshot cursor before any edit (edits shift the cursor and we need the original)
            let cursorPos = editor.selection.active;
            // Build a {define:} string from voicing data (lowE→highE)
            const buildDefineStr = (name, frets, fingers) => {
                const frettedPositions = frets.filter(f => f > 0);
                const baseFret = frettedPositions.length > 0 ? Math.min(...frettedPositions) : 1;
                const values = frets.map(f => f === -1 ? 'x' : f === 0 ? '0' : String(f - baseFret + 1));
                let def = `{define: ${name} base-fret ${baseFret} frets ${values.join(' ')}`;
                if (fingers && fingers.some(f => f > 0)) {
                    const fv = fingers.map((fn, i) => frets[i] <= 0 ? '0' : String(fn));
                    def += ` fingers ${fv.join(' ')}`;
                }
                return def + '}';
            };

            // defineOnly: insert only the {define:} block (with define prompt if already exists)
            if (msg.defineOnly) {
                if (msg.voicingFrets) {
                    const define = buildDefineStr(msg.name, msg.voicingFrets, msg.voicingFingers);
                    const existingDefines = parseDocumentDefines(editor.document);
                    if (existingDefines[msg.name]) {
                        const answer = await vscode.window.showInformationMessage(
                            `"${msg.name}" is already defined. Replace?`, 'Replace', 'Cancel'
                        );
                        if (answer !== 'Replace') return;
                        const lines = editor.document.getText().split('\n');
                        const matchRe = new RegExp(`^\\s*\\{(?:define|chord):?\\s+${escapeRegex(msg.name)}[\\s}]`, 'i');
                        const lineIdx = lines.findIndex(l => matchRe.test(l));
                        if (lineIdx >= 0) {
                            editor.edit(eb => eb.replace(new vscode.Range(lineIdx, 0, lineIdx, lines[lineIdx].length), define));
                        }
                    } else {
                        const insertLine = findDefineInsertLine(editor.document);
                        editor.edit(eb => eb.insert(new vscode.Position(insertLine, 0), define + '\n'));
                    }
                }
                return;
            }

            // Auto-insert {define:} using the voicing data sent from the webview (lowE→highE)
            if (msg.voicingFrets) {
                const existingDefines = parseDocumentDefines(editor.document);
                if (!existingDefines[msg.name]) {
                    const define = buildDefineStr(msg.name, msg.voicingFrets, msg.voicingFingers);
                    const insertLine = findDefineInsertLine(editor.document);
                    const ok = await editor.edit(eb => eb.insert(new vscode.Position(insertLine, 0), define + '\n'));
                    if (ok && insertLine <= cursorPos.line) {
                        cursorPos = cursorPos.translate(1, 0);
                    }
                }
            }
            if (msg.diagram) {
                editor.edit(eb => eb.insert(cursorPos, '{chord: ' + msg.name + '}\n'));
            } else {
                editor.insertSnippet(new vscode.SnippetString('[' + msg.name + ']$0'), cursorPos);
            }
        });
        this._push();
    }

    nudge() {
        clearTimeout(this._timer);
        this._timer = setTimeout(() => this._push(), 300);
    }

    _push() {
        if (!this._view) return;
        const editor = vscode.window.activeTextEditor;
        const fileChords = [];
        if (editor && editor.document.languageId === 'chordpro') {
            const defines = parseDocumentDefines(editor.document);
            const seen = new Set(Object.keys(defines));
            for (const [name, frets] of Object.entries(defines)) {
                fileChords.push({ name, frets });
            }
            const re = /\[([A-G][^\[\]]*)\]/g;
            const text = editor.document.getText();
            let m;
            while ((m = re.exec(text)) !== null) {
                const name = m[1].trim();
                if (!name || seen.has(name)) continue;
                seen.add(name);
                const saved = getPrimaryVoicing(this._ctx, name);
                const frets = saved ? [...saved.frets].reverse() : (CHORD_DB[name] || null);
                if (frets) fileChords.push({ name, frets });
            }
        }
        const chordFiles = this._ctx.globalState.get('chordFiles') || {};
        const hiddenChords = new Set(this._ctx.globalState.get('hiddenChords') || []);
        const suppressedVoicings = this._ctx.globalState.get('suppressedVoicings') || [];
        const isSuppressed = (name, frets) => suppressedVoicings.some(
            s => s.name === name && s.fretsKey === JSON.stringify(frets)
        );
        // Group variants (A, A_2, A_3 …) under their base name
        const groups = {};
        for (const [name, entries] of Object.entries(chordFiles)) {
            const baseName = name.replace(/_\d+$/, '');
            if (hiddenChords.has(baseName) || hiddenChords.has(name)) continue;
            if (!groups[baseName]) groups[baseName] = [];
            groups[baseName].push({ name, entries });
        }
        const myChords = Object.entries(groups).map(([baseName, nameGroups]) => {
                // Sort variants: base name first (treated as _1), then _2, _3 …
                nameGroups.sort((a, b) => {
                    const nA = parseInt((a.name.match(/_(\d+)$/) || [0, '1'])[1]);
                    const nB = parseInt((b.name.match(/_(\d+)$/) || [0, '1'])[1]);
                    return nA - nB;
                });
                const seen = new Set();
                const voicings = [];
                let totalCount = 0;
                const allFiles = [];
                const addVoicing = (frets, fingers, actualName) => {
                    if (!frets) return;
                    if (isSuppressed(actualName, frets)) return;
                    const k = JSON.stringify(frets);
                    if (seen.has(k)) return;
                    seen.add(k);
                    voicings.push({ frets, fingers: fingers || null, actualName });
                };
                for (const { name, entries } of nameGroups) {
                    const norm = entries.map(e => typeof e === 'string' ? { uri: e, frets: null } : e);
                    totalCount += norm.length;
                    for (const e of norm) { addVoicing(e.frets, null, name); }
                    for (const v of getSavedVoicings(this._ctx, name)) {
                        addVoicing([...v.frets].reverse(), v.fingers ? [...v.fingers].reverse() : null, name);
                    }
                    for (const e of norm) {
                        try { allFiles.push(require('path').basename(vscode.Uri.parse(e.uri).fsPath)); }
                        catch (_) { allFiles.push(e.uri.split('/').pop()); }
                    }
                }
                if (!voicings.length && CHORD_DB[baseName]) {
                    voicings.push({ frets: CHORD_DB[baseName], fingers: null, actualName: baseName });
                }
                return { name: baseName, count: totalCount, voicings, files: allFiles };
            })
            .filter(({ voicings }) => voicings.length > 0)
            .sort((a, b) => b.count - a.count)
            .slice(0, 30);
        this._view.webview.postMessage({ type: 'update', fileChords, myChords });
    }

    _buildHtml() {
        const library = JSON.stringify(
            Object.entries(CHORD_DB).map(([name, frets]) => ({ name, frets }))
        );
        return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
/* Linear Violet palette */
:root {
  --bg: #131215; --surf: #1e1c22; --surf-hi: #262329;
  --text: #e6e8ef; --muted: #8b8fa3; --border: #2e2b36;
  --accent: #7c6af6; --accent-soft: rgba(124,106,246,0.15); --danger: #e5534b;
  --string: #6a7286;
}
body.vscode-light, body.vscode-high-contrast-light {
  --bg: #fafbfc; --surf: #ffffff; --surf-hi: #f0f3f9;
  --text: #0f1117; --muted: #64748b; --border: #dde1eb;
  --accent: #5e4fd8; --accent-soft: rgba(94,79,216,0.10); --danger: #cc3a33;
  --string: #94a3b8;
}

body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11px; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
#tabs { display: flex; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.tab { flex: 1; padding: 7px 4px; text-align: center; cursor: pointer; color: var(--muted); border-bottom: 2px solid transparent; font-size: 11px; transition: all 0.12s ease; }
.tab:hover { color: var(--text); }
.tab.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
#sw { padding: 6px; flex-shrink: 0; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 4px; }
#sw input { flex: 1; background: var(--surf); border: 1px solid var(--border); color: var(--text); padding: 5px 8px; border-radius: 5px; font-size: 11px; outline: none; font-family: inherit; transition: border-color 0.15s, box-shadow 0.15s; }
#sw input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
#grid { flex: 1; overflow-y: auto; padding: 8px; display: grid; grid-template-columns: repeat(auto-fill, minmax(70px, 1fr)); gap: 6px; align-content: start; }
.card { display: flex; flex-direction: column; align-items: center; cursor: pointer; padding: 4px; border-radius: 5px; border: 1px solid transparent; user-select: none; position: relative; transition: all 0.12s ease; background: var(--surf); }
.card:hover { border-color: var(--accent); background: var(--surf-hi); }
.card svg { display: block; }
.cname { margin-top: 3px; font-size: 12px; font-weight: 600; text-align: center; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
.card:hover .cname { color: var(--accent); }
.vnav { display: flex; align-items: center; justify-content: center; gap: 4px; margin-top: 2px; }
.varr { cursor: pointer; padding: 2px 5px; color: var(--accent); font-size: 13px; line-height: 1; border-radius: 3px; transition: background 0.12s; }
.varr:hover { background: var(--accent-soft); }
.vcnt { font-size: 10px; color: var(--muted); min-width: 24px; text-align: center; }
.del { position: absolute; top: 3px; right: 3px; font-size: 11px; color: var(--muted); cursor: pointer; line-height: 1; display: none; padding: 2px 4px; border-radius: 3px; transition: all 0.12s; }
.card:hover .del { display: block; }
.del:hover { color: var(--bg); background: var(--danger); }
#empty { padding: 20px; text-align: center; color: var(--muted); font-size: 11px; }
#ctx-menu { position: fixed; background: var(--surf); border: 1px solid var(--border); border-radius: 5px; padding: 4px 0; z-index: 999; display: none; min-width: 170px; box-shadow: 0 4px 12px rgba(0,0,0,0.4); }
.ctx-item { padding: 6px 14px; cursor: pointer; font-size: 11px; color: var(--text); white-space: nowrap; transition: all 0.12s; }
.ctx-item:hover { background: var(--accent-soft); color: var(--accent); }
#sort-btn { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 11px; padding: 4px 6px; border-radius: 3px; white-space: nowrap; transition: all 0.12s; }
#sort-btn:hover { color: var(--text); background: var(--surf-hi); }
#sort-btn.active { color: var(--accent); }
#hint-bar { flex-shrink: 0; border-top: 1px solid var(--border); padding: 8px 10px; font-size: 11px; color: var(--muted); line-height: 1.8; background: var(--surf); }
#hint-bar kbd { background: var(--surf-hi); border: 1px solid var(--border); border-radius: 3px; padding: 1px 5px; font-family: inherit; font-size: 10px; color: var(--accent); }
/* chord diagram SVG classes */
.cd-nut { fill: var(--text); }
.cd-grid { stroke: var(--border); fill: none; }
.cd-string { stroke: var(--string); fill: none; }
.cd-dot { fill: var(--accent); }
.cd-dot-text { fill: var(--bg); font-size: 7px; text-anchor: middle; }
.cd-x { stroke: var(--danger); fill: none; }
.cd-o { stroke: var(--accent); fill: none; }
.cd-label { fill: var(--muted); }
</style>
</head>
<body>
<div id="tabs">
  <div class="tab active" data-tab="file">File</div>
  <div class="tab" data-tab="saved">My Chords</div>
  <div class="tab" data-tab="library">Library</div>
</div>
<div id="sw">
  <input id="si" type="text" placeholder="Filter…"/>
  <button id="sort-btn" title="Sort: frequency">A↕</button>
</div>
<div id="grid"></div>
<div id="empty" style="display:none">No chords</div>
<div id="hint-bar">Click to insert inline &nbsp;·&nbsp; <kbd>Ctrl</kbd>+click to insert diagram &nbsp;·&nbsp; Right-click for options &nbsp;·&nbsp; Auto-inserts <code>{define:}</code></div>
<div id="ctx-menu">
  <div class="ctx-item" data-action="inline"></div>
  <div class="ctx-item" data-action="diagram"></div>
  <div class="ctx-item" data-action="define">Insert {define:}</div>
  <div class="ctx-item" data-action="openInBuilder">Open in Chord Builder</div>
</div>
<script>
const LIBRARY = ${library};
const vscode = acquireVsCodeApi();
let tab = 'file', fileChords = [], myChords = [], q = '', sortAlpha = false;
const voicingIdx = {}; // name → current index in voicings array

function drawSvg(frets, fingers) {
    var W=64,H=72,NS=6,NF=4,PL=8,PR=15,PT=16,PB=4;
    var SW=(W-PL-PR)/(NS-1), FH=(H-PT-PB)/NF;
    var sx=function(i){return PL+i*SW;};
    var fy=function(i){return PT+i*FH;};
    var cy=function(i){return PT+(i-0.5)*FH;};
    var played=frets.filter(function(f){return f>0;});
    var minF=played.length?Math.min.apply(null,played):1;
    var hasOpen=frets.some(function(f){return f===0;});
    var showNut=hasOpen||minF<=2;
    var startF=showNut?1:minF;
    var fretCounts={};
    frets.forEach(function(f){if(f>0)fretCounts[f]=(fretCounts[f]||0)+1;});
    var barreCandidate=minF&&fretCounts[minF]>=4?minF:0;
    var barreF=0;
    if(barreCandidate){
        var bi=frets.reduce(function(a,f,i){if(f===barreCandidate)a.push(i);return a;},[]);
        if(Math.max.apply(null,bi)-Math.min.apply(null,bi)+1===bi.length) barreF=barreCandidate;
    }
    var s='';
    if(showNut){
        s+='<rect class="cd-nut" x="'+sx(0)+'" y="'+(fy(0)-3)+'" width="'+(sx(NS-1)-sx(0))+'" height="3"/>';
    } else {
        s+='<text class="cd-label" x="'+(W-2)+'" y="'+(cy(1)+3)+'" font-size="10" font-weight="bold" text-anchor="end">'+startF+'</text>';
    }
    for(var i=showNut?1:0;i<=NF;i++){
        s+='<line class="cd-grid" x1="'+sx(0)+'" y1="'+fy(i)+'" x2="'+sx(NS-1)+'" y2="'+fy(i)+'" stroke-width="0.8"/>';
    }
    for(var i=0;i<NS;i++){
        s+='<line class="cd-string" x1="'+sx(i)+'" y1="'+fy(0)+'" x2="'+sx(i)+'" y2="'+fy(NF)+'" stroke-width="0.8"/>';
    }
    for(var i=0;i<NS;i++){
        if(frets[i]===-1){
            var x=sx(i),y=PT-7,d=3;
            s+='<line class="cd-x" x1="'+(x-d)+'" y1="'+(y-d)+'" x2="'+(x+d)+'" y2="'+(y+d)+'" stroke-width="1.2"/>';
            s+='<line class="cd-x" x1="'+(x+d)+'" y1="'+(y-d)+'" x2="'+(x-d)+'" y2="'+(y+d)+'" stroke-width="1.2"/>';
        } else if(frets[i]===0){
            s+='<circle class="cd-o" cx="'+sx(i)+'" cy="'+(PT-7)+'" r="3" fill="none" stroke-width="1"/>';
        }
    }
    if(barreF){
        var slot=barreF-startF+1;
        var bs=frets.reduce(function(a,f,i){if(f===barreF)a.push(i);return a;},[]);
        var bx1=sx(Math.min.apply(null,bs))-5, bx2=sx(Math.max.apply(null,bs))+5;
        s+='<rect class="cd-dot" x="'+bx1+'" y="'+(cy(slot)-5)+'" width="'+(bx2-bx1)+'" height="10" rx="5"/>';
        var bfn=fingers&&fingers[bs[0]]>0?fingers[bs[0]]:0;
        if(bfn) s+='<text class="cd-dot-text" x="'+((sx(Math.min.apply(null,bs))+sx(Math.max.apply(null,bs)))/2)+'" y="'+(cy(slot)+3)+'" font-size="7" text-anchor="middle">'+bfn+'</text>';
    }
    frets.forEach(function(f,i){
        if(f<=0)return;
        if(barreF&&f===barreF)return;
        var slot=f-startF+1;
        if(slot<1||slot>NF)return;
        var fn=fingers&&fingers[i]>0?fingers[i]:0;
        var r=SW*0.38;
        s+='<circle class="cd-dot" cx="'+sx(i)+'" cy="'+cy(slot)+'" r="'+r+'"/>';
        if(fn) s+='<text class="cd-dot-text" x="'+sx(i)+'" y="'+(cy(slot)+3)+'" font-size="7" text-anchor="middle">'+fn+'</text>';
    });
    return '<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'">'+s+'</svg>';
}

var noDataSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="72"><text x="32" y="40" font-size="9" class="cd-label" text-anchor="middle">?</text></svg>';

function fuzzy(label, q) {
    var fi=0, f=q.toLowerCase(), n=label.toLowerCase();
    for(var i=0;i<n.length&&fi<f.length;i++){if(n[i]===f[fi])fi++;}
    return fi===f.length;
}

function cardHtml(c, showDel) {
    var voicings=c.voicings||[{frets:c.frets,fingers:c.fingers||null}];
    var idx=voicingIdx[c.name]||0;
    if(idx>=voicings.length)idx=0;
    var v=voicings[idx];
    var diagram=v&&v.frets?drawSvg(v.frets,v.fingers||null):noDataSvg;
    var nav='';
    if(voicings.length>1){
        nav='<div class="vnav">'
            +'<span class="varr" data-name="'+c.name+'" data-dir="-1">&#9664;</span>'
            +'<span class="vcnt">'+(idx+1)+'/'+voicings.length+'</span>'
            +'<span class="varr" data-name="'+c.name+'" data-dir="1">&#9654;</span>'
            +'</div>';
    }
    var del=showDel?'<span class="del" data-name="'+c.name+'" title="Delete">&#x2715;</span>':'';
    var tooltip='';
    if(c.files&&c.files.length){
        tooltip=' title="'+c.count+' file'+(c.count===1?'':'s')+':\\n'+c.files.join('\\n')+'"';
    }
    return '<div class="card" data-name="'+c.name+'"'+tooltip+'>'+del+diagram+'<div class="cname">'+c.name+'</div>'+nav+'</div>';
}

// Flat list of chords for current tab (normalise Library entries to have voicings array)
function currentList() {
    var raw = tab==='file' ? fileChords : tab==='saved' ? myChords : LIBRARY;
    if(q) raw=raw.filter(function(c){return fuzzy(c.name,q);});
    if(tab==='library') raw=raw.map(function(c){return {name:c.name,voicings:[{frets:c.frets,fingers:null}]};});
    if(tab==='saved' && sortAlpha) raw=raw.slice().sort(function(a,b){return a.name.localeCompare(b.name);});
    return raw;
}

function updateSortBtn() {
    var btn=document.getElementById('sort-btn');
    if(!btn) return;
    var onSaved=(tab==='saved');
    btn.style.display=onSaved?'':'none';
    btn.textContent=sortAlpha?'#↕':'A↕';
    btn.title=sortAlpha?'Sort: alphabetical (click for frequency)':'Sort: frequency (click for A–Z)';
    btn.classList.toggle('active', sortAlpha);
}

function attachCardListeners(el, showDel) {
    var name=el.dataset.name;
    el.addEventListener('click',function(e){
        if(e.target.classList.contains('varr')||e.target.classList.contains('del')) return;
        var voicings=findVoicings(name);
        var idx=voicingIdx[name]||0;
        var v=voicings[idx]||voicings[0];
        var actualName=(v&&v.actualName)?v.actualName:name;
        vscode.postMessage({name:actualName, voicingFrets:v?v.frets:null, voicingFingers:v?v.fingers:null, diagram:e.ctrlKey||e.metaKey});
    });
    el.querySelectorAll('.varr').forEach(function(a){
        a.addEventListener('click',function(e){
            e.stopPropagation();
            var voicings=findVoicings(name);
            if(!voicings||voicings.length<=1) return;
            var idx=(voicingIdx[name]||0)+parseInt(a.dataset.dir);
            if(idx<0) idx=voicings.length-1;
            if(idx>=voicings.length) idx=0;
            voicingIdx[name]=idx;
            render();
        });
    });
    if(showDel){
        var delBtn=el.querySelector('.del');
        if(delBtn) delBtn.addEventListener('click',function(e){
            e.stopPropagation();
            var voicings=findVoicings(name);
            var idx=voicingIdx[name]||0;
            var v=voicings[idx]||voicings[0];
            var actualName=(v&&v.actualName)?v.actualName:name;
            vscode.postMessage({command:'deleteVoicing', name:actualName, voicingFrets:v?v.frets:null, voicingCount:voicings.length});
        });
    }
}

function render() {
    var grid=document.getElementById('grid'), empty=document.getElementById('empty');
    var chords=currentList();
    var showDel=(tab==='saved');
    updateSortBtn();
    if(!chords.length){grid.innerHTML='';empty.style.display='block';return;}
    empty.style.display='none';
    grid.innerHTML=chords.map(function(c){return cardHtml(c,showDel);}).join('');
    grid.querySelectorAll('.card').forEach(function(el){ attachCardListeners(el, showDel); });
}

function findVoicings(name) {
    var list=tab==='file'?fileChords:tab==='saved'?myChords:LIBRARY;
    var c=list.find(function(x){return x.name===name;});
    if(!c) return [{frets:null,fingers:null}];
    if(c.voicings) return c.voicings;
    return [{frets:c.frets,fingers:c.fingers||null}];
}

document.querySelectorAll('.tab').forEach(function(t){
    t.addEventListener('click',function(){
        document.querySelectorAll('.tab').forEach(function(x){x.classList.remove('active');});
        t.classList.add('active');
        tab=t.dataset.tab;
        render();
    });
});

document.getElementById('si').addEventListener('input',function(e){
    q=e.target.value.trim();
    render();
});

document.getElementById('sort-btn').addEventListener('click',function(){
    sortAlpha=!sortAlpha;
    render();
});
updateSortBtn();

// Right-click context menu
var ctxMenu=document.getElementById('ctx-menu');
var ctxCard=null;

document.addEventListener('contextmenu',function(e){
    var card=e.target.closest('.card');
    if(!card){ctxMenu.style.display='none';return;}
    e.preventDefault();
    ctxCard=card;
    var name=card.dataset.name;
    ctxMenu.querySelector('[data-action="inline"]').textContent='Insert ['+name+']';
    ctxMenu.querySelector('[data-action="diagram"]').textContent='Insert {chord: '+name+'}';
    ctxMenu.querySelector('[data-action="define"]').textContent='Insert {define: '+name+'}';
    // Keep menu inside viewport
    var x=e.clientX, y=e.clientY;
    ctxMenu.style.display='block';
    if(x+ctxMenu.offsetWidth>window.innerWidth) x=window.innerWidth-ctxMenu.offsetWidth-4;
    if(y+ctxMenu.offsetHeight>window.innerHeight) y=window.innerHeight-ctxMenu.offsetHeight-4;
    ctxMenu.style.left=x+'px';
    ctxMenu.style.top=y+'px';
});

ctxMenu.querySelectorAll('.ctx-item').forEach(function(item){
    item.addEventListener('click',function(e){
        e.stopPropagation();
        if(!ctxCard) return;
        var name=ctxCard.dataset.name;
        var voicings=findVoicings(name);
        var v=voicings[voicingIdx[name]||0]||voicings[0];
        var action=item.dataset.action;
        if(action==='openInBuilder'){
            vscode.postMessage({command:'openInBuilder', name:name, frets:v?v.frets:null, fingers:v?v.fingers:null});
        } else {
            vscode.postMessage({name:name, voicingFrets:v?v.frets:null, voicingFingers:v?v.fingers:null, diagram:action==='diagram', defineOnly:action==='define'});
        }
        ctxMenu.style.display='none';
        ctxCard=null;
    });
});

document.addEventListener('click',function(){ctxMenu.style.display='none';});
document.addEventListener('keydown',function(e){if(e.key==='Escape')ctxMenu.style.display='none';});

window.addEventListener('message',function(e){
    var msg=e.data;
    if(msg.type==='update'){fileChords=msg.fileChords;myChords=msg.myChords;render();}
});

render();
</script>
</body>
</html>`;
    }
}

// ─────────────────────────────────────────────
// Song Library TreeDataProvider
// ─────────────────────────────────────────────

class SongLibraryProvider {
    constructor(context) {
        this._ctx = context;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this._songs = [];
        this._folder = context.globalState.get('libraryFolder') || null;
        if (this._folder) this._loadSongs();
    }

    setFolder(folder) {
        this._folder = folder;
        this._ctx.globalState.update('libraryFolder', folder);
        this._loadSongs();
        this._onDidChangeTreeData.fire();
    }

    refresh() {
        this._loadSongs();
        this._onDidChangeTreeData.fire();
    }

    _loadSongs() {
        this._songs = [];
        if (!this._folder) return;
        const collect = (dir) => {
            let entries;
            try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch(e) { return; }
            for (const entry of entries) {
                const fpath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    collect(fpath);
                } else if (/\.(cho|chordpro|chopro)$/i.test(entry.name)) {
                    try {
                        const source = fs.readFileSync(fpath, 'utf8');
                        const title  = (source.match(/\{(?:title|t)\s*:\s*([^}]+)\}/) || [])[1] || path.basename(entry.name, path.extname(entry.name));
                        const artist = (source.match(/\{artist\s*:\s*([^}]+)\}/) || [])[1] || '';
                        this._songs.push({ title: title.trim(), artist: artist.trim(), filePath: fpath, source });
                    } catch(e) {
                        this._songs.push({ title: entry.name, artist: '', filePath: fpath, source: '' });
                    }
                }
            }
        };
        collect(this._folder);
        this._songs.sort((a, b) => a.title.localeCompare(b.title));
    }

    getSongs()  { return this._songs; }
    getFolder() { return this._folder; }

    getTreeItem(element) {
        if (element.isPlaceholder) {
            const item = new vscode.TreeItem(element.label);
            if (!this._folder) item.command = { command: 'chordpro.setLibraryFolder', title: 'Set Library Folder', arguments: [] };
            return item;
        }
        const item = new vscode.TreeItem(element.title, vscode.TreeItemCollapsibleState.None);
        item.description = element.artist;
        item.tooltip = element.filePath;
        item.command = { command: 'chordpro.openSong', title: 'Open', arguments: [element] };
        item.contextValue = 'song';
        return item;
    }

    getChildren() {
        if (!this._folder) {
            return [{ isPlaceholder: true, label: 'Click 📂 to set library folder' }];
        }
        if (!this._songs.length) {
            return [{ isPlaceholder: true, label: 'No .cho files found in folder' }];
        }
        return this._songs;
    }
}

// ─────────────────────────────────────────────
// User Config helpers
// ─────────────────────────────────────────────

function getUserConfigsDir(context) {
    const custom = vscode.workspace.getConfiguration('chordpro').get('userConfigsFolder', '').trim();
    const dir = custom || path.join(context.globalStorageUri.fsPath, 'user_configs');
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    return dir;
}

function listUserConfigs(context) {
    const dir = getUserConfigsDir(context);
    return fs.readdirSync(dir)
        .filter(f => f.toLowerCase().endsWith('.json'))
        .map(f => ({ name: path.basename(f, '.json'), fullPath: path.join(dir, f) }));
}

function listBundledConfigs(context) {
    const dir = path.join(context.extensionPath, 'bundled_configs');
    if (!fs.existsSync(dir)) { return []; }
    return fs.readdirSync(dir)
        .filter(f => f.toLowerCase().endsWith('.json'))
        .map(f => ({ name: path.basename(f, '.json').replace(/_/g, ' '), fullPath: path.join(dir, f) }));
}

// ─────────────────────────────────────────────

function activate(context) {
    // Register the renderChordPro command
    const renderOnly = vscode.commands.registerCommand('extension.renderChordPro', function () {
        renderChordProLogic(context);
    });

    // Register the previewChordPro command — renders then opens the PDF beside the editor
    const previewChordPro = vscode.commands.registerCommand('extension.previewChordPro', function () {
        renderChordProLogic(context, (pdfPath) => {
            vscode.commands.executeCommand('vscode.open', vscode.Uri.file(pdfPath), vscode.ViewColumn.Beside);
        });
    });

    // Register the openChordProMinimalTemplate command
    const openChordProMinimalTemplate = vscode.commands.registerCommand('extension.openChordProMinimalTemplate', function () {
        openChordProTemplate(context, 'minimal');
    });

    // Register the openChordProExampleTemplate command
    const openChordProExampleTemplate = vscode.commands.registerCommand('extension.openChordProExampleTemplate', function () {
        openChordProTemplate(context, 'example');
    });

    // Register the openChordProTemplate command
    const openChordProTemplateCommand = vscode.commands.registerCommand('extension.openChordProTemplate', function () {
        openChordProTemplate(context, 'default');
    });

    // Register save event listener
    const onSaveDisposable = vscode.workspace.onDidSaveTextDocument((document) => {
        const config = vscode.workspace.getConfiguration('chordpro');
        const isEnabled = config.get('buildOnSave', false);

        if (isEnabled && document.languageId === 'chordpro') {
            renderChordProLogic(context);
        }
    });

    // Chord builder panel
    const chordBuilderProvider = new ChordBuilderViewProvider(context);
    const chordBuilderView = vscode.window.registerWebviewViewProvider(
        'chordproFretboard.chordBuilderView', chordBuilderProvider
    );

    const openBuilder = vscode.commands.registerCommand('chordproFretboard.openBuilder', () => {
        vscode.commands.executeCommand('chordproFretboard.chordBuilderView.focus');
    });

    // Open a specific chord in the Builder (frets: lowE→highE absolute)
    const openInBuilder = vscode.commands.registerCommand('chordpro.openInBuilder', (name, frets, fingers) => {
        vscode.commands.executeCommand('chordproFretboard.chordBuilderView.focus');
        // Brief delay so the panel has time to resolve before we post
        setTimeout(() => chordBuilderProvider.loadChord(name, frets, fingers || null), 150);
    });

    function doWrapInSection(type) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const sel = editor.selection;
        const startLine = sel.start.line;
        const endLine   = sel.isEmpty ? sel.start.line : (sel.end.character === 0 ? sel.end.line - 1 : sel.end.line);
        const range = new vscode.Range(
            new vscode.Position(startLine, 0),
            new vscode.Position(endLine, editor.document.lineAt(endLine).text.length)
        );
        const body = editor.document.getText(range);
        editor.edit(eb => eb.replace(range, `{start_of_${type}}\n${body}\n{end_of_${type}}`));
    }

    const wrapInSection = vscode.commands.registerCommand('chordpro.wrapInSection', async () => {
        const TYPES = [
            { label: 'Chorus', value: 'chorus' },
            { label: 'Verse',  value: 'verse'  },
            { label: 'Bridge', value: 'bridge' },
            { label: 'Tab',    value: 'tab'    },
            { label: 'Grid',   value: 'grid'   },
        ];
        const pick = await vscode.window.showQuickPick(TYPES, { placeHolder: 'Select section type' });
        if (pick) doWrapInSection(pick.value);
    });

    const wrapSectionSubs = ['chorus', 'verse', 'bridge', 'tab', 'grid'].map(type =>
        vscode.commands.registerCommand(`chordpro.wrapInSection.${type}`, () => doWrapInSection(type))
    );

    function pickChord(context, editor) {
        const docDefineNames = editor ? Object.keys(parseDocumentDefines(editor.document)) : [];
        const inlineChords = [];
        if (editor) {
            const text = editor.document.getText();
            const re = /\[([A-G][^\[\]]*)\]/g;
            let m;
            while ((m = re.exec(text)) !== null) {
                const ch = m[1].trim();
                if (ch && !docDefineNames.includes(ch)) { inlineChords.push(ch); }
            }
        }
        const savedNames = getAllSavedNames(context);
        const allNames = [...new Set([...docDefineNames, ...inlineChords, ...savedNames])];
        const baseItems = allNames.map(name => ({
            label: name,
            description: docDefineNames.includes(name) ? 'defined in file'
                : inlineChords.includes(name) ? 'used in file'
                : 'saved chord'
        }));
        const fuzzy = (label, filter) => {
            let fi = 0;
            const f = filter.toLowerCase(), n = label.toLowerCase();
            for (let i = 0; i < n.length && fi < f.length; i++) { if (n[i] === f[fi]) fi++; }
            return fi === f.length;
        };
        return new Promise(resolve => {
            const qp = vscode.window.createQuickPick();
            qp.placeholder = 'Type a chord name or select from list';
            qp.items = baseItems.map(i => ({ ...i, alwaysShow: true }));
            qp.onDidChangeValue(val => {
                const trimmed = val.trim();
                const filtered = baseItems
                    .filter(i => !trimmed || fuzzy(i.label, trimmed))
                    .map(i => ({ ...i, alwaysShow: true }));
                const newItem = trimmed ? [{ label: trimmed, description: 'new chord', alwaysShow: true }] : [];
                qp.items = [...newItem, ...filtered];
            });
            qp.onDidAccept(() => {
                const active = qp.activeItems[0];
                qp.hide();
                resolve(active ? active.label : null);
            });
            qp.onDidHide(() => resolve(null));
            qp.show();
        });
    }

    const insertTitle = vscode.commands.registerCommand('chordpro.insertTitle', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) { editor.insertSnippet(new vscode.SnippetString('{title: $1}')); }
    });

    const insertChordInline = vscode.commands.registerCommand('chordproFretboard.insertChordInline', async () => {
        const editor = vscode.window.activeTextEditor;
        const chord = await pickChord(context, editor);
        if (!chord) { return; }
        if (editor) { editor.insertSnippet(new vscode.SnippetString(`[${chord}]`)); }
    });

    const insertChordDiagram = vscode.commands.registerCommand('chordproFretboard.insertChordDiagram', async () => {
        const editor = vscode.window.activeTextEditor;
        const chord = await pickChord(context, editor);
        if (!chord) { return; }
        if (editor) { editor.insertSnippet(new vscode.SnippetString(`{chord: ${chord}}`)); }
    });

    // Auto-completion provider for { (directives) and [ (chords)
    const completionProvider = vscode.languages.registerCompletionItemProvider(
        'chordpro',
        {
            provideCompletionItems(document, position) {
                const fullLine = document.lineAt(position).text;
                const linePrefix = fullLine.substring(0, position.character);
                const isCommentLine = /^\s*#/.test(fullLine);
                const braceStart = linePrefix.lastIndexOf('{');

                // Helper: if VSCode auto-closed the bracket, the close char sits right at the cursor
                const charAtCursor = fullLine[position.character];
                const endColBrace   = charAtCursor === '}' ? position.character + 1 : position.character;
                const endColBracket = charAtCursor === ']' ? position.character + 1 : position.character;

                // Render option completions: inside {…} on a comment line
                if (isCommentLine && braceStart !== -1 && !linePrefix.includes('}', braceStart)) {
                    const replaceRange = new vscode.Range(position.line, braceStart + 1, position.line, endColBrace);
                    return Object.entries(RENDER_OPTIONS).map(([key, info]) => {
                        const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property);
                        item.detail = info.placeholder;
                        item.documentation = new vscode.MarkdownString(info.description);
                        if (key === 'config') {
                            const choices = info.presets.join(',');
                            item.insertText = new vscode.SnippetString(`${key} = "\${1|${choices}|}"}`)
                        } else {
                            item.insertText = new vscode.SnippetString(`${key} = "$1"}`);
                        }
                        item.range = replaceRange;
                        return item;
                    });
                }

                // Directive completions: inside {…} not yet closed
                if (braceStart !== -1 && !linePrefix.includes('}', braceStart)) {
                    const replaceRange = new vscode.Range(position.line, braceStart + 1, position.line, endColBrace);
                    return DIRECTIVES.map(d => {
                        const item = new vscode.CompletionItem(d.label, vscode.CompletionItemKind.Keyword);
                        item.insertText = new vscode.SnippetString(d.snippet);
                        item.detail = d.detail;
                        item.range = replaceRange;
                        return item;
                    });
                }

                // Chord completions: inside […] not yet closed
                const bracketStart = linePrefix.lastIndexOf('[');
                if (bracketStart !== -1 && !linePrefix.includes(']', bracketStart)) {
                    const replaceRange = new vscode.Range(position.line, bracketStart + 1, position.line, endColBracket);

                    const savedChordNames = getAllSavedNames(context);

                    const docDefineNames = Object.keys(parseDocumentDefines(document));

                    // Merge: doc-defined first, then builder-saved, deduped
                    const priorityNames = [...new Set([...docDefineNames, ...savedChordNames])];

                    const savedItems = priorityNames.map(chord => {
                        const isDoc = docDefineNames.includes(chord);
                        const item = new vscode.CompletionItem(chord, vscode.CompletionItemKind.Value);
                        item.insertText = new vscode.SnippetString(`${chord}]`);
                        item.detail = isDoc ? 'Defined in file' : 'Saved chord';
                        item.sortText = `0_${chord}`;
                        item.range = replaceRange;
                        return item;
                    });

                    const genericItems = COMPLETION_CHORDS
                        .filter(chord => !priorityNames.includes(chord))
                        .map(chord => {
                            const item = new vscode.CompletionItem(chord, vscode.CompletionItemKind.Value);
                            item.insertText = new vscode.SnippetString(`${chord}]`);
                            item.sortText = `1_${chord}`;
                            item.range = replaceRange;
                            return item;
                        });

                    return [...savedItems, ...genericItems];
                }

                return undefined;
            }
        },
        '{', '['
    );

    // Hover provider — show description when hovering over # {key = value} lines
    const hoverProvider = vscode.languages.registerHoverProvider('chordpro', {
        provideHover(document, position) {
            const line = document.lineAt(position).text;
            const match = line.match(/^\s*#.*\{\s*(config|suffix|output|options)\s*=\s*([^}]*)\}/);
            if (!match) { return undefined; }
            const key = match[1];
            const value = match[2].trim().replace(/^["']|["']$/g, '');
            const info = RENDER_OPTIONS[key];
            const md = new vscode.MarkdownString();
            md.appendMarkdown(`**\`${key}\`** — ${info.description}`);
            if (value) { md.appendMarkdown(`\n\nCurrent value: \`${value}\``); }
            if (info.presets) { md.appendMarkdown(`\n\nValid presets: ${info.presets.map(p => `\`${p}\``).join(', ')}`); }
            if (info.flags) {
                md.appendMarkdown('\n\n**Common flags:**\n\n');
                md.appendMarkdown(info.flags.map(f => `- \`${f.flag}\` — ${f.detail}`).join('\n'));
            }
            return new vscode.Hover(md);
        }
    });

    // CodeLens provider — "⚙ Configure rendering" button at line 0
    const codeLensProvider = vscode.languages.registerCodeLensProvider('chordpro', {
        provideCodeLenses(document) {
            return [new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
                title: '⚙ Configure rendering',
                command: 'extension.configureRendering',
                arguments: [document],
            })];
        }
    });

    // ── User config file management ──────────────────────────────────────────

    const createChordProConfig = vscode.commands.registerCommand('extension.createChordProConfig', async () => {
        const name = await vscode.window.showInputBox({ prompt: 'Config file name (without .json)', placeHolder: 'my_config' });
        if (!name) { return; }
        const dir = getUserConfigsDir(context);
        const filePath = path.join(dir, name.trim() + '.json');
        if (fs.existsSync(filePath)) {
            vscode.window.showWarningMessage(`Config "${name}" already exists. Opening it.`);
        } else {
            fs.writeFileSync(filePath, JSON.stringify({ settings: {} }, null, 2), 'utf8');
        }
        vscode.window.showTextDocument(vscode.Uri.file(filePath));
    });

    const registerChordProConfig = vscode.commands.registerCommand('extension.registerChordProConfig', async () => {
        const uris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: { 'JSON config': ['json'] },
            openLabel: 'Import config',
        });
        if (!uris || !uris.length) { return; }
        const src = uris[0].fsPath;
        const defaultName = path.basename(src, '.json');
        const name = await vscode.window.showInputBox({ prompt: 'Save as (name without .json)', value: defaultName });
        if (!name) { return; }
        const dir = getUserConfigsDir(context);
        const dest = path.join(dir, name.trim() + '.json');
        fs.copyFileSync(src, dest);
        vscode.window.showInformationMessage(`Config "${name}" saved to user configs.`);
    });

    const editChordProConfig = vscode.commands.registerCommand('extension.editChordProConfig', async () => {
        const configs = listUserConfigs(context);
        if (!configs.length) {
            vscode.window.showInformationMessage('No user configs yet. Use "Create ChordPro Config" to add one.');
            return;
        }
        const items = configs.map(c => ({ label: c.name, description: c.fullPath, fullPath: c.fullPath }));
        const choice = await vscode.window.showQuickPick(items, { placeHolder: 'Select a config to edit' });
        if (!choice) { return; }
        vscode.window.showTextDocument(vscode.Uri.file(choice.fullPath));
    });

    const setUserConfigsFolder = vscode.commands.registerCommand('extension.setUserConfigsFolder', async () => {
        const current = vscode.workspace.getConfiguration('chordpro').get('userConfigsFolder', '').trim();
        const uris = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            defaultUri: current ? vscode.Uri.file(current) : undefined,
            openLabel: 'Select user configs folder',
        });
        if (!uris || !uris.length) { return; }
        const chosen = uris[0].fsPath;
        await vscode.workspace.getConfiguration('chordpro').update('userConfigsFolder', chosen, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`User configs folder set to: ${chosen}`);
    });

    // Configure rendering command — QuickPick UI to insert/update # {key = value} lines
    const configureRendering = vscode.commands.registerCommand('extension.configureRendering', async (document) => {
        const doc = document ?? vscode.window.activeTextEditor?.document;
        if (!doc) { return; }

        const optionItems = Object.entries(RENDER_OPTIONS).map(([key, info]) => ({
            label: key,
            description: info.placeholder,
            detail: info.description,
        }));
        const picked = await vscode.window.showQuickPick(optionItems, { placeHolder: 'Select a rendering option to configure' });
        if (!picked) { return; }

        const key = picked.label;
        const info = RENDER_OPTIONS[key];
        let value;

        if (key === 'config') {
            const userConfigs = listUserConfigs(context);
            const bundledConfigs = listBundledConfigs(context);
            const userItems = userConfigs.map(c => ({
                label: '$(account) ' + c.name,
                description: 'user',
                userPath: c.fullPath,
            }));
            const bundledItems = bundledConfigs.map(c => ({
                label: '$(package) ' + c.name,
                description: 'bundled',
                userPath: c.fullPath,
            }));
            const presetItems = [
                ...(userItems.length    ? [{ label: 'My configs',      kind: vscode.QuickPickItemKind.Separator }, ...userItems]    : []),
                ...(bundledItems.length ? [{ label: 'Extension presets', kind: vscode.QuickPickItemKind.Separator }, ...bundledItems] : []),
                { label: 'ChordPro built-in presets', kind: vscode.QuickPickItemKind.Separator },
                ...info.presets.map(p => ({ label: p })),
                { label: '$(edit) Enter custom path...', custom: true },
            ];
            const choice = await vscode.window.showQuickPick(presetItems, { placeHolder: 'Select a config or enter a custom JSON path' });
            if (!choice) { return; }
            if (choice.custom) {
                value = await vscode.window.showInputBox({ prompt: 'Path to config JSON file', placeHolder: info.placeholder });
            } else if (choice.userPath) {
                value = choice.userPath;
            } else {
                value = choice.label;
            }
        } else if (key === 'options' && info.flags) {
            const flagItems = [
                ...info.flags.map(f => ({ label: f.flag, description: f.detail })),
                { label: '$(edit) Enter custom flags...', custom: true },
            ];
            const choice = await vscode.window.showQuickPick(flagItems, { placeHolder: 'Select a flag or enter custom flags' });
            if (!choice) { return; }
            if (choice.custom) {
                value = await vscode.window.showInputBox({ prompt: 'CLI flags to pass to chordpro', placeHolder: info.placeholder });
            } else {
                value = choice.label;
            }
        } else {
            value = await vscode.window.showInputBox({ prompt: `Value for ${key}`, placeHolder: info.placeholder });
        }
        if (value === undefined) { return; }

        const newLine = `# {${key} = "${value}"}`;
        const lineCount = Math.min(25, doc.lineCount);
        const keyRegex = new RegExp(`^\\s*#.*\\{\\s*${key}\\s*=`);
        let existingLineIndex = -1;
        for (let i = 0; i < lineCount; i++) {
            if (keyRegex.test(doc.lineAt(i).text)) { existingLineIndex = i; break; }
        }

        const edit = new vscode.WorkspaceEdit();
        if (existingLineIndex >= 0) {
            edit.replace(doc.uri, doc.lineAt(existingLineIndex).range, newLine);
        } else {
            edit.insert(doc.uri, new vscode.Position(0, 0), newLine + '\n');
        }
        await vscode.workspace.applyEdit(edit);
    });

    // ─────────────────────────────────────────────
    // Auto-scroll HTML Preview
    // ─────────────────────────────────────────────

    let scrollPanel = null;
    let scrollDocUri = null;

    // Merge CHORD_DB + Chord Builder saves + document {define:} into one fingering map
    function buildChordData(document) {
        const data = Object.assign({}, CHORD_DB);
        const allVoicings = context.globalState.get('savedVoicings') || [];
        // Use the first saved voicing per name (primary); doc defines will override below
        for (const chord of allVoicings) {
            if (!data[chord.name] && chord.frets) {
                data[chord.name] = [...chord.frets].reverse();
            }
        }
        Object.assign(data, parseDocumentDefines(document)); // doc defines win
        return data;
    }

    // Pre-render SVG strings for every chord token that appears in the source
    function buildChordSvgMap(source, chordData) {
        const map = {};
        for (const [name, frets] of Object.entries(chordData)) {
            map[name] = generateChordSvg(frets, name);
        }
        return map;
    }

    // All standard CHORD_DB SVGs — built once and shared across setlist songs
    function buildSharedSvgMap() {
        const map = {};
        for (const [name, frets] of Object.entries(CHORD_DB)) {
            map[name] = generateChordSvg(frets, name);
        }
        return map;
    }

    // Only {define:} / {chord:} SVGs from a single source file (for setlist per-song data)
    function buildCustomSvgMap(source) {
        const defines = parseDocumentDefines({ getText: () => source });
        const map = {};
        for (const [name, frets] of Object.entries(defines)) {
            map[name] = generateChordSvg(frets, name);
        }
        return map;
    }

    const autoScrollPreview = vscode.commands.registerCommand('extension.autoScrollPreview', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { vscode.window.showErrorMessage('No active editor found'); return; }

        const source   = editor.document.getText();
        const title    = path.basename(editor.document.uri.fsPath, path.extname(editor.document.uri.fsPath));
        const chordData = buildChordData(editor.document);
        const chordSvgs = buildChordSvgMap(source, chordData);

        if (scrollPanel) {
            scrollDocUri = editor.document.uri.toString(); // keep uri in sync for save-reload
            scrollPanel.reveal(scrollPanel.viewColumn ?? vscode.ViewColumn.Two, true);
            scrollPanel.webview.postMessage({ command: 'reload', source, chordSvgs });
            return;
        }

        scrollDocUri = editor.document.uri.toString();
        const savedSettings = context.globalState.get('perfSettings:' + scrollDocUri) || {};
        scrollPanel  = vscode.window.createWebviewPanel(
            'chordproScrollPreview',
            title + ' — Preview',
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
            { enableScripts: true, retainContextWhenHidden: true }
        );
        scrollPanel.webview.html = getScrollWebviewContent(source, chordSvgs, savedSettings);
        scrollPanel.webview.onDidReceiveMessage(msg => {
            if (msg.command === 'saveSettings') {
                context.globalState.update('perfSettings:' + scrollDocUri, msg.settings);
            } else if (msg.command === 'saveHtml') {
                const srcPath = editor.document.uri.fsPath;
                const outPath = srcPath.replace(/\.[^.]+$/, '') + '_preview.html';
                const standalone = getScrollWebviewContent(
                    editor.document.getText(),
                    buildChordSvgMap(editor.document.getText(), buildChordData(editor.document))
                )
                    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n?/, '')
                    .replace('const vscodeApi = acquireVsCodeApi();',
                             'const vscodeApi = { postMessage: function() {} };');
                fs.writeFile(outPath, standalone, err => {
                    if (err) vscode.window.showErrorMessage('Failed to save HTML: ' + err.message);
                    else vscode.window.showInformationMessage('Saved: ' + path.basename(outPath));
                });
            } else if (msg.command === 'enterFullscreen') {
                vscode.commands.executeCommand('workbench.action.maximizeEditorHideSidebar');
            } else if (msg.command === 'exitFullscreen') {
                vscode.commands.executeCommand('workbench.action.evenEditorWidths');
                vscode.commands.executeCommand('workbench.action.toggleSidebarVisibility');
            }
        });
        scrollPanel.onDidDispose(() => { scrollPanel = null; scrollDocUri = null; });
    });

    function getScrollWebviewContent(source, chordSvgs, savedSettings) {
        const safeSource = JSON.stringify(source);
        const safeChordSvgs = JSON.stringify(chordSvgs || {});
        const safeSavedSettings = JSON.stringify(savedSettings || {});
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;">
<style>
:root {
  --bg: #fafaf8; --fg: #1a1a1a; --fg-dim: #555; --fg-muted: #888;
  --border: #ddd; --chord: #1a5fb4;
  --sec-chorus-bg: #e8f0fe; --sec-chorus-fg: #2a5bbf;
  --sec-verse-bg: #f0f0f0;  --sec-verse-fg: #555;
  --sec-bridge-bg: #fef0d0; --sec-bridge-fg: #a05000;
  --sec-tab-bg: #f0f4e8;    --sec-tab-fg: #4a6a20;
  --sec-xsec-bg: #e0f4f4;   --sec-xsec-fg: #1a7a7a;
  --tab-bg: #f4f4f0; --tab-border: #bbb;
  --tip-bg: #fff; --tip-border: #ccc; --tip-fg: #333;
  --capo-bg: #ffe8b0; --capo-fg: #7a4000;
  --panel-bg: rgba(245,245,243,0.97); --panel-border: #ccc;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1e1e1e; --fg: #d4d4d4; --fg-dim: #999; --fg-muted: #666;
    --border: #444; --chord: #79b8ff;
    --sec-chorus-bg: #1e2a4a; --sec-chorus-fg: #79b8ff;
    --sec-verse-bg: #2a2a2a;  --sec-verse-fg: #aaa;
    --sec-bridge-bg: #3a2a10; --sec-bridge-fg: #e8a050;
    --sec-tab-bg: #1e2a14;    --sec-tab-fg: #90c040;
    --sec-xsec-bg: #0e2a2a;   --sec-xsec-fg: #5cc8c8;
    --tab-bg: #252525; --tab-border: #555;
    --tip-bg: #2d2d2d; --tip-border: #555; --tip-fg: #ccc;
    --capo-bg: #4a3010; --capo-fg: #ffcc60;
    --panel-bg: rgba(20,20,20,0.93); --panel-border: #444;
  }
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: Georgia, serif; font-size: 17px; line-height: 1.6;
  background: var(--bg); color: var(--fg);
  padding: 40px clamp(16px, 4vw, 56px) 160px;
}
.song-header { text-align: center; margin-bottom: 36px; padding-bottom: 20px; border-bottom: 2px solid var(--border); }
.song-title  { font-size: 2em; font-weight: bold; }
.song-subtitle { font-size: 1.1em; color: var(--fg-dim); margin-top: 4px; }
.song-meta   { font-size: 0.88em; color: var(--fg-muted); margin-top: 8px; }
.capo-badge  {
  display: inline-block; background: var(--capo-bg); color: var(--capo-fg);
  font-size: 0.78em; font-weight: bold; font-family: sans-serif;
  padding: 2px 10px; border-radius: 12px; margin-left: 6px; vertical-align: middle;
}
.section     { margin-bottom: var(--section-gap, 22px); position: relative; padding-left: 28px; }
.section-label {
  position: absolute; left: 0; top: 0; bottom: 0;
  width: 20px;
  display: flex; align-items: center; justify-content: center;
  writing-mode: vertical-rl; transform: rotate(180deg);
  font-size: 0.65em; font-weight: bold;
  text-transform: uppercase; letter-spacing: 1px;
  border-radius: 3px; padding: 4px 0;
}
.section-chorus  .section-label { background: var(--sec-chorus-bg); color: var(--sec-chorus-fg); }
.section-verse   .section-label { background: var(--sec-verse-bg);  color: var(--sec-verse-fg); }
.section-bridge  .section-label { background: var(--sec-bridge-bg); color: var(--sec-bridge-fg); }
.section-tab     .section-label { background: var(--sec-tab-bg);    color: var(--sec-tab-fg); }
.section-x-section .section-label { background: var(--sec-xsec-bg); color: var(--sec-xsec-fg); }
.chord-line  { display: flex; flex-wrap: wrap; line-height: 1; margin-bottom: 4px; }
.pair        { display: inline-flex; flex-direction: column; align-items: flex-start; margin-right: 6px; }
.pair.tight  { margin-right: 0; }
.chord       { color: var(--chord); font-weight: bold; font-size: 0.82em; min-height: 1.3em; font-family: sans-serif; white-space: pre; cursor: default; }
.chord[data-chord] { cursor: help; }
#chord-tip {
  display: none; position: fixed; z-index: 9998; pointer-events: none;
  background: var(--tip-bg); border: 1px solid var(--tip-border); border-radius: 7px;
  padding: 6px 8px 4px; box-shadow: 0 4px 18px rgba(0,0,0,0.18);
  text-align: center; font-family: sans-serif; font-size: 11px; color: var(--tip-fg);
}
#chord-tip svg { display: block; margin: 0 auto 3px; }
.lyric       { white-space: pre; }
.lyric-line  { white-space: pre-wrap; margin-bottom: 2px; }
.empty-line  { height: 0.75em; }
.comment     { color: var(--fg-muted); font-style: italic; font-size: 0.9em; margin: 3px 0; }
.comment-box { border: 1px solid var(--border); padding: 1px 8px; border-radius: 3px; display: inline-block; }
.chorus-ref  { color: var(--sec-chorus-fg); font-style: italic; font-size: 0.9em; margin: 3px 0; }
.chord-diagrams { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 6px 0; }
.chord-diagram-cell { display: inline-flex; flex-direction: column; align-items: center; }
.chord-diagram-cell svg { display: block; }
.chord-diagram-cell .cd-label { font-size: 0.78em; font-weight: bold; color: var(--chord); margin-top: 2px; }
.tab-block, .grid-block {
  font-family: 'Courier New', monospace; font-size: 0.88em;
  background: var(--tab-bg); padding: 12px 16px; border-radius: 4px;
  border-left: 3px solid var(--tab-border); white-space: pre; overflow-x: auto;
}
.grid-block .chord { color: var(--chord); font-family: inherit; font-size: inherit; font-weight: inherit; cursor: pointer; }
.page-break  { border: none; border-top: 2px dashed var(--border); margin: 28px 0; }
/* ── Progress bar ─────────────────────────────────────────────────────────── */
#progress-bar {
  position: fixed; top: 0; left: 0; height: 4px; width: 0%;
  background: var(--chord); z-index: 10000; transition: width 0.15s linear;
  pointer-events: none;
}
/* ── Control bar ──────────────────────────────────────────────────────────── */
#scroll-bar {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: flex-end; gap: 10px;
  background: rgba(20,20,20,0.92); border: 1px solid #555; border-radius: 18px;
  padding: 0 18px 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  font-family: sans-serif; color: #eee; user-select: none; z-index: 9999;
}
#scroll-bar button {
  background: #3a3a3a; border: 1px solid #666; color: #eee;
  border-radius: 50%; width: 30px; height: 30px; font-size: 15px;
  cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;
  flex-shrink: 0;
}
#scroll-bar button:hover { background: #555; }
/* Labeled groups */
.ctrl-group {
  display: flex; flex-direction: column; align-items: center; gap: 5px;
  padding: 5px 8px 0; border-top: 1px solid #3d3d3d;
  border-left: 1px solid #3d3d3d; border-right: 1px solid #3d3d3d;
  border-radius: 6px 6px 0 0;
}
.ctrl-label {
  font-size: 8px; color: #555; text-transform: uppercase; letter-spacing: 0.1em;
  white-space: nowrap;
}
.ctrl-btns { display: flex; align-items: center; gap: 5px; padding-bottom: 2px; }
.ctrl-sep-inner { width: 1px; height: 18px; background: #3d3d3d; margin: 0 1px; flex-shrink: 0; }
/* Ungrouped buttons sit at the bottom (align-items: flex-end on parent) */
#scroll-bar > button { margin-bottom: 0; }
/* Play button */
#play-btn    { width: 38px; height: 38px; font-size: 18px; }
#speed-label { min-width: 52px; text-align: center; font-size: 12px; color: #aaa; }
/* BPM input */
#bpm-input {
  width: 50px; background: rgba(255,255,255,0.07); border: 1px solid #555;
  border-radius: 6px; color: #eee; font-size: 12px; text-align: center;
  padding: 4px 2px; font-family: sans-serif; height: 30px; box-sizing: border-box;
}
#bpm-input::-webkit-inner-spin-button, #bpm-input::-webkit-outer-spin-button { -webkit-appearance: none; }
#bpm-input::placeholder { color: #444; font-size: 10px; }
#bpm-input:focus { outline: 1px solid #7c6df0; outline-offset: 0; }
/* Tempo/metro buttons */
#tempo-btn { opacity: 0.35; }
#tempo-btn:not(:disabled):hover { opacity: 1; }
#tempo-btn.active { opacity: 1; color: #7c6df0; border-color: #7c6df0; }
#metro-btn { opacity: 0.35; }
#metro-btn:not(:disabled):hover { opacity: 1; }
#metro-btn.active { opacity: 1; color: #ffd700; border-color: #ffd700; }
#font-smaller, #font-larger { font-size: 11px; font-family: sans-serif; letter-spacing: -0.5px; border-radius: 6px !important; width: auto !important; padding: 0 7px !important; }
/* ── Theme manual override (takes precedence over prefers-color-scheme) ───── */
:root[data-theme="light"] {
  --bg: #fafaf8; --fg: #1a1a1a; --fg-dim: #555; --fg-muted: #888;
  --border: #ddd; --chord: #1a5fb4;
  --sec-chorus-bg: #e8f0fe; --sec-chorus-fg: #2a5bbf;
  --sec-verse-bg: #f0f0f0;  --sec-verse-fg: #555;
  --sec-bridge-bg: #fef0d0; --sec-bridge-fg: #a05000;
  --sec-tab-bg: #f0f4e8;    --sec-tab-fg: #4a6a20;
  --tab-bg: #f4f4f0; --tab-border: #bbb;
  --tip-bg: #fff; --tip-border: #ccc; --tip-fg: #333;
  --capo-bg: #ffe8b0; --capo-fg: #7a4000;
  --panel-bg: rgba(245,245,243,0.97); --panel-border: #ccc;
}
:root[data-theme="dark"] {
  --bg: #1e1e1e; --fg: #d4d4d4; --fg-dim: #999; --fg-muted: #666;
  --border: #444; --chord: #79b8ff;
  --sec-chorus-bg: #1e2a4a; --sec-chorus-fg: #79b8ff;
  --sec-verse-bg: #2a2a2a;  --sec-verse-fg: #aaa;
  --sec-bridge-bg: #3a2a10; --sec-bridge-fg: #e8a050;
  --sec-tab-bg: #1e2a14;    --sec-tab-fg: #90c040;
  --tab-bg: #252525; --tab-border: #555;
  --tip-bg: #2d2d2d; --tip-border: #555; --tip-fg: #ccc;
  --capo-bg: #4a3010; --capo-fg: #ffcc60;
  --panel-bg: rgba(20,20,20,0.93); --panel-border: #444;
}
/* ── Multi-column layout ──────────────────────────────────────────────────── */
#song.multi-col { column-count: var(--col-count,2); column-gap: 2em; column-rule: 1px solid var(--border); }
#song.multi-col .section { break-inside: avoid-column; }
#song.multi-col .song-header { column-span: all; }
/* Column zones: when {x_columns_on}/{x_columns_off} are used, only the marked zone gets columns */
#song.has-col-zones.multi-col { column-count: 1; column-rule: none; }
#song.has-col-zones.multi-col .col-zone { column-count: var(--col-count,2); column-gap: 2em; column-rule: 1px solid var(--border); }
#song.has-col-zones.multi-col .col-zone .section { break-inside: avoid-column; }
/* ── Additional button styles ────────────────────────────────────────────── */
#settings-btn { font-size: 20px; opacity: 0.7; }
#settings-btn:hover, #settings-btn.open { opacity: 1; }
#trans-down, #trans-up { font-size: 13px; }
#trans-label { min-width: 28px; text-align: center; font-size: 12px; color: #aaa; padding: 0 2px; }
#trans-label.active { color: #ffd700; }
#tap-btn    { font-size: 11px; font-family: sans-serif; border-radius: 6px !important; width: auto !important; padding: 0 7px !important; }
#lyrics-btn { font-size: 11px; font-family: sans-serif; border-radius: 6px !important; width: auto !important; padding: 0 7px !important; }
#lyrics-btn.active { color: #ffd700; border-color: #ffd700; }
#fs-btn     { font-size: 14px; }
/* ── Lyrics-only mode ────────────────────────────────────────────────────── */
.chord { transition: opacity 0.2s, height 0.2s, min-height 0.2s; }
#song.lyrics-only .chord { opacity: 0; height: 0; min-height: 0; overflow: hidden; }
#song.lyrics-only .chord-line { margin-bottom: 2px; line-height: inherit; }
/* ── Export popup ────────────────────────────────────────────────────────── */
#export-popup {
  display: none; position: fixed; bottom: 100px; right: 24px;
  background: rgba(20,20,20,0.96); border: 1px solid #555; border-radius: 10px;
  padding: 4px; z-index: 9998; min-width: 160px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
}
#export-popup.open { display: block; }
.exp-item {
  display: block; width: 100%; text-align: left; padding: 8px 14px;
  background: none; border: none; color: #eee; cursor: pointer; border-radius: 6px;
  font-family: sans-serif; font-size: 13px; white-space: nowrap;
}
.exp-item:hover { background: #3a3a3a; }
#export-btn { font-size: 14px; opacity: 0.7; }
#export-btn:hover { opacity: 1; }
/* ── Chord Legend ─────────────────────────────────────────────────────────── */
#legend-end { display: none; margin-top: 48px; padding-top: 24px; border-top: 2px solid var(--border); }
#legend-end.active { display: block; }
#legend-side {
  display: none; position: fixed; right: 0; top: 0; bottom: 0; width: var(--panel-w, 200px);
  overflow-y: auto; padding: 16px 12px 80px; z-index: 9990;
  background: var(--panel-bg); border-left: 1px solid var(--panel-border);
  font-family: sans-serif;
}
#legend-side.active { display: flex; flex-direction: column; }
body.legend-side-on { padding-right: calc(var(--panel-w, 200px) + 10px); }
/* ── Custom side panel ──────────────────────────────────────────────────────── */
#custom-side-panel {
  display: none; position: fixed; right: 0; top: 0; bottom: 0; width: var(--panel-w, 200px);
  overflow-y: auto; padding: 16px 12px 80px; z-index: 9989;
  background: var(--panel-bg); border-left: 1px solid var(--panel-border);
  font-family: sans-serif; color: var(--fg);
}
#custom-side-panel.active { display: flex; flex-direction: column; gap: 16px; }
body.csp-side-on { padding-right: calc(var(--panel-w, 200px) + 10px); }
body.csp-side-on .section-side-panel { display: none; }
.csp-group { display: flex; flex-direction: column; gap: 8px; }
.csp-section-badge {
  font-size: 11px; font-weight: bold; color: #9d8ef5; text-transform: uppercase;
  letter-spacing: 0.8px; padding: 3px 10px; background: rgba(124,109,240,0.18);
  border-radius: 5px; align-self: flex-start; border: 1px solid rgba(124,109,240,0.35);
}
.csp-chord-grid { display: flex; flex-wrap: wrap; gap: 8px 6px; }
.section-side-panel {
  background: rgba(128,128,128,0.1); border: 1px solid var(--border);
  border-radius: 8px; padding: 12px 14px; margin-bottom: 10px;
}
.section-side-panel .csp-group {
  flex-direction: row; flex-wrap: wrap; align-items: flex-start; gap: 6px 12px;
}
.section-side-panel .csp-section-badge {
  writing-mode: vertical-rl; transform: rotate(180deg); margin-right: 6px;
  align-self: stretch; display: flex; align-items: center; justify-content: center;
  border-radius: 4px; padding: 6px 4px; letter-spacing: 1px;
}
.section-side-panel .csp-chord-grid { flex: 1; }
.legend-title { font-size: 11px; font-weight: bold; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
.legend-grid { display: flex; flex-wrap: wrap; gap: 10px 8px; }
/* ── Settings popup ───────────────────────────────────────────────────────── */
#settings-popup {
  display: none; position: fixed; bottom: 100px; right: 24px;
  background: rgba(20,20,20,0.97); border: 1px solid #555; border-radius: 10px;
  padding: 14px 16px; z-index: 9997; min-width: 260px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5); font-family: sans-serif;
}
#settings-popup.open { display: block; }
.set-title { font-size: 11px; font-weight: bold; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
.set-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.set-row:last-child { margin-bottom: 0; }
.set-label { font-size: 12px; color: #aaa; flex-shrink: 0; width: 118px; }
.set-radios { display: flex; gap: 10px; flex-wrap: wrap; }
.set-radios label { font-size: 12px; color: #eee; display: flex; align-items: center; gap: 4px; cursor: pointer; white-space: nowrap; }
.set-radios input[type="radio"] { cursor: pointer; accent-color: #7c6df0; }
.set-slider { flex: 1; accent-color: #7c6df0; cursor: pointer; min-width: 80px; }
.set-val { font-size: 11px; color: #888; min-width: 34px; text-align: right; }
/* Diagram size CSS variables */
#legend-end .legend-grid svg, #legend-side .legend-grid svg,
#custom-side-panel .chord-diagram-cell svg,
.section-side-panel .chord-diagram-cell svg { width: var(--legend-svg-w, 80px); height: auto; }
#song .chord-diagram-cell svg { width: var(--song-svg-w, 110px); height: auto; }
/* ── Print ────────────────────────────────────────────────────────────────── */
@media print {
  #scroll-bar, #progress-bar, #legend-side, #settings-popup { display: none !important; }
  body { background: #fff !important; color: #000 !important; padding: 20px !important; max-width: 100% !important; font-size: 13px !important; padding-right: 20px !important; }
  .song-header { border-bottom-color: #ccc !important; }
  .chord { color: #1a5fb4 !important; }
  .tab-block { background: #f8f8f8 !important; border-left-color: #aaa !important; }
  .section-chorus .section-label { background: #e8f0fe !important; color: #2a5bbf !important; }
  .section-verse  .section-label { background: #f0f0f0 !important; color: #555 !important; }
  .section-bridge .section-label { background: #fef0d0 !important; color: #a05000 !important; }
  .section-tab    .section-label { background: #f0f4e8 !important; color: #4a6a20 !important; }
  .capo-badge { background: #ffe8b0 !important; color: #7a4000 !important; }
  #legend-end.active { display: block !important; border-top: 1px solid #ccc !important; }
  .legend-title { color: #666 !important; }
}
</style>
</head>
<body>
<div id="progress-bar"></div>
<div id="song"></div>
<div id="legend-end"><div class="legend-title">Chords used</div><div class="legend-grid"></div></div>
<div id="legend-side"><div class="legend-title">Chords</div><div class="legend-grid"></div></div>
<div id="custom-side-panel"></div>
<div id="export-popup">
  <button class="exp-item" id="exp-html">💾 Save as HTML</button>
  <button class="exp-item" id="exp-pdf">🖨 Print / PDF</button>
</div>
<div id="settings-popup">
  <div class="set-title">⚙ Settings</div>
  <div class="set-row">
    <span class="set-label">Chord legend</span>
    <div class="set-radios">
      <label><input type="radio" name="legend-mode" value="0" checked> Off</label>
      <label><input type="radio" name="legend-mode" value="1"> End of page</label>
      <label><input type="radio" name="legend-mode" value="2"> Side panel</label>
    </div>
  </div>
  <div class="set-row">
    <span class="set-label">Legend diagram size</span>
    <input type="range" class="set-slider" id="legend-sz" min="40" max="200" step="10" value="80">
    <span class="set-val" id="legend-sz-val">80px</span>
  </div>
  <div class="set-row">
    <span class="set-label">Song diagram size</span>
    <input type="range" class="set-slider" id="song-sz" min="40" max="200" step="10" value="110">
    <span class="set-val" id="song-sz-val">110px</span>
  </div>
  <div class="set-row">
    <span class="set-label">Theme</span>
    <div class="set-radios" id="theme-radios">
      <label><input type="radio" name="theme-mode" value="dark"> Dark</label>
      <label><input type="radio" name="theme-mode" value="light"> Light</label>
    </div>
  </div>
  <div class="set-row">
    <span class="set-label">Columns</span>
    <input type="range" class="set-slider" id="col-slider" min="1" max="6" step="1" value="1">
    <span class="set-val" id="col-val">1</span>
  </div>
  <div class="set-row" id="panel-mode-row" style="display:none">
    <span class="set-label">Side panel</span>
    <div class="set-radios">
      <label><input type="radio" name="panel-mode" value="side" checked> Side</label>
      <label><input type="radio" name="panel-mode" value="inline"> Inline</label>
    </div>
  </div>
  <div class="set-row">
    <span class="set-label">Panel width</span>
    <input type="range" class="set-slider" id="panel-w-slider" min="120" max="600" step="10" value="200">
    <span class="set-val" id="panel-w-val">200px</span>
  </div>
</div>
<div id="scroll-bar">
  <div class="ctrl-group">
    <span class="ctrl-label">Tempo</span>
    <div class="ctrl-btns">
      <button id="tap-btn"   title="Tap tempo (T)">Tap</button>
      <input  type="number"  id="bpm-input" min="20" max="300" placeholder="BPM" title="Type BPM or use Tap">
      <button id="metro-btn" title="Metronome click track (M)" disabled style="opacity:0.35"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M7 22L11 2h2l4 20z" opacity="0.45"/><line x1="12" y1="15" x2="18" y2="6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="15" r="1.8"/></svg></button>
    </div>
  </div>
  <div class="ctrl-group">
    <span class="ctrl-label">Scroll</span>
    <div class="ctrl-btns">
      <button id="slower-btn" title="Slower (↓)">−</button>
      <button id="play-btn"   title="Play / Pause (Space)">▶</button>
      <button id="faster-btn" title="Faster (↑)">+</button>
      <span   id="speed-label">30 px/s</span>
      <div class="ctrl-sep-inner"></div>
      <button id="tempo-btn" title="Sync scroll speed to BPM" disabled style="font-size:12px">↓♩</button>
    </div>
  </div>
  <div class="ctrl-group">
    <span class="ctrl-label">Transpose</span>
    <div class="ctrl-btns">
      <button id="trans-down" title="Transpose down (♭)">♭</button>
      <span   id="trans-label">0</span>
      <button id="trans-up"   title="Transpose up (♯)">♯</button>
    </div>
  </div>
  <button id="font-smaller" title="Smaller text (A−)">A−</button>
  <button id="font-larger"  title="Larger text (A+)">A+</button>
  <button id="lyrics-btn"   title="Lyrics only — hide chords (L)">Ly</button>
  <button id="fs-btn"       title="Full screen (F)"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 5V1h4M9 1h4v4M1 9v4h4M9 13h4V9"/></svg></button>
  <button id="export-btn"   title="Save / Export">💾</button>
  <button id="settings-btn" title="Settings">⚙</button>
</div>
<script>
// ── Browser transpose helpers ─────────────────────────────────────────────
var _SH = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
var _FL = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
function _tn(root, n) {
  var fi = _FL.indexOf(root), si = _SH.indexOf(root);
  var pf = fi !== -1 && si === -1;
  var idx = si !== -1 ? si : fi;
  if (idx < 0) return root;
  return (pf ? _FL : _SH)[((idx + n) % 12 + 12) % 12];
}
function transposeChordName(chord, n) {
  if (!n) return chord;
  var sl = chord.indexOf('/');
  var main = sl >= 0 ? chord.slice(0, sl) : chord;
  var bass = sl >= 0 ? chord.slice(sl + 1) : null;
  var rm   = main.match(/^([A-G][b#]?)(.*)/);
  if (!rm) return chord;
  return _tn(rm[1], n) + rm[2] + (bass ? '/' + _tn(bass, n) : '');
}
var previewTranspose = 0;

// ── ChordPro parser ──────────────────────────────────────────────────────────
function parseChordLine(line) {
  const segs = [], re = /\\[([^\\]]*)\\]/g;
  let last = 0, pending = null, m;
  while ((m = re.exec(line)) !== null) {
    const before = line.slice(last, m.index);
    if (pending !== null || before) segs.push({ chord: pending || '', lyric: before });
    pending = m[1]; last = m.index + m[0].length;
  }
  const tail = line.slice(last);
  if (pending !== null || tail) segs.push({ chord: pending || '', lyric: tail });
  return segs;
}

function parse(text) {
  const meta = { title: '', subtitle: '', artist: '', key: '', capo: '', tempo: '' };
  const sections = [];
  let cur = { type: 'verse', label: '', lines: [], nav: false };
  let inSidePanel = null; // points to the active side-panel section while inside the block

  function flush() { if (cur.lines.length) { sections.push(cur); } }
  function next(type, label, nav) { flush(); cur = { type, label, lines: [], nav: !!nav }; }

  for (const raw of text.split(/\\r?\\n/)) {
    const line = raw.trimEnd();
    if (/^\\s*#/.test(line)) continue;                          // comment/param line

    const dir = line.trim().match(/^\\{([^}]+)\\}$/);
    if (dir) {
      const ci = dir[1].indexOf(':');
      const k = (ci >= 0 ? dir[1].slice(0, ci) : dir[1]).trim().toLowerCase();
      const v = ci >= 0 ? dir[1].slice(ci + 1).trim() : '';
      if (k === 'title'  || k === 't')   { meta.title    = v; continue; }
      if (k === 'subtitle'||k === 'st')  { meta.subtitle = v; continue; }
      if (k === 'artist')                { meta.artist   = v; continue; }
      if (k === 'key')                   { meta.key      = v; continue; }
      if (k === 'capo')                  { meta.capo     = v; continue; }
      if (k === 'tempo')                 { meta.tempo    = v; continue; }
      if (k === 'start_of_chorus'||k==='soc') { next('chorus',     v||'Chorus',  true);  continue; }
      if (k === 'end_of_chorus'  ||k==='eoc') { next('verse',      '',           false); continue; }
      if (k === 'start_of_verse' ||k==='sov') { next('verse',      v||'Verse',   true);  continue; }
      if (k === 'end_of_verse'   ||k==='eov') { next('verse',      '',           false); continue; }
      if (k === 'start_of_bridge'||k==='sob') { next('bridge',     v||'Bridge',  true);  continue; }
      if (k === 'end_of_bridge'  ||k==='eob') { next('verse',      '',           false); continue; }
      if (k === 'start_of_tab'   ||k==='sot') { next('tab',        v||'Tab',     true);  continue; }
      if (k === 'end_of_tab'     ||k==='eot') { next('verse',      '',           false); continue; }
      if (k === 'start_of_grid'  ||k==='sog') { next('grid',       v||'Grid',    true);  continue; }
      if (k === 'end_of_grid'    ||k==='eog') { next('verse',      '',           false); continue; }
      if (k === 'x_start_section')                  { next('x-section',  v||'Section', true);  continue; }
      if (k === 'x_end_section')              { next('verse',      '',           false); continue; }
      if (k === 'x_columns_on')  { flush(); sections.push({ type: 'col-zone-start', lines: [], label: '', nav: false }); cur = { type: 'verse', label: '', lines: [], nav: false }; continue; }
      if (k === 'x_columns_off') { flush(); sections.push({ type: 'col-zone-end',   lines: [], label: '', nav: false }); cur = { type: 'verse', label: '', lines: [], nav: false }; continue; }
      if (k === 'x_start_side_panel') { flush(); const _sp = { type: 'side-panel', items: [], label: '', nav: false, lines: [] }; sections.push(_sp); inSidePanel = _sp; cur = { type: 'verse', label: '', lines: [], nav: false }; continue; }
      if (k === 'x_end_side_panel')   { inSidePanel = null; cur = { type: 'verse', label: '', lines: [], nav: false }; continue; }
      if (k === 'x_panel_section_title') { if (inSidePanel) inSidePanel.items.push({ type: 'title', label: v }); continue; }
      if (k === 'comment'||k==='c'||k==='highlight') { if (!inSidePanel) cur.lines.push({ type:'comment',     text:v }); continue; }
      if (k === 'comment_italic' ||k==='ci')          { if (!inSidePanel) cur.lines.push({ type:'comment',     text:v }); continue; }
      if (k === 'comment_box'    ||k==='cb')          { if (!inSidePanel) cur.lines.push({ type:'comment-box', text:v }); continue; }
      if (k === 'chorus')                             { if (!inSidePanel) cur.lines.push({ type:'chorus-ref'         }); continue; }
      if (k === 'new_page'||k==='np'||k==='new_physical_page'||k==='npp') { if (!inSidePanel) cur.lines.push({ type:'page-break' }); continue; }
      if (k === 'chord' && v && !v.includes('frets')) {
        if (inSidePanel) { inSidePanel.items.push({ type: 'chord', name: v.trim() }); continue; }
        cur.lines.push({ type:'chord-diagram', name:v.trim() }); continue;
      }
      continue;   // define, column_break, image, …
    }

    if (inSidePanel) continue; // skip non-directive lines inside side panel block
    if (cur.type === 'tab')  { cur.lines.push({ type:'tab',       text:line }); continue; }
    if (cur.type === 'grid') { cur.lines.push({ type:'grid-line', text:line }); continue; }
    if (!line.trim())        { cur.lines.push({ type:'empty' });                continue; }
    if (line.includes('['))  { cur.lines.push({ type:'chord-line', segs: parseChordLine(line) }); }
    else                     { cur.lines.push({ type:'lyric', text:line }); }
  }
  flush();
  return { meta, sections };
}

// ── HTML renderer ────────────────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function safeFmt(s) {
  return esc(s).replace(new RegExp('&lt;(\\/?(b|i|em|strong|u|s))&gt;', 'gi'), '\x3c$1\x3e');
}
function _spGroupsHtml(items, transpose) {
  var groups = [];
  var grp = { label: '', chords: [] };
  (items || []).forEach(function(item) {
    if (item.type === 'title') {
      if (grp.chords.length || grp.label) groups.push(grp);
      grp = { label: item.label, chords: [] };
    } else if (item.type === 'chord') {
      grp.chords.push(item.name);
    }
  });
  if (grp.chords.length || grp.label) groups.push(grp);
  return groups.map(function(g) {
    var cells = g.chords.map(function(n) {
      var tn = transposeChordName(n, transpose || 0);
      return '<div class="chord-diagram-cell" data-chord="' + esc(tn) + '"></div>';
    }).join('');
    var badge = g.label ? '<div class="csp-section-badge">' + esc(g.label) + '</div>' : '';
    return '<div class="csp-group">' + badge + '<div class="csp-chord-grid">' + cells + '</div></div>';
  }).join('');
}
function renderGridLine(text, transpose) {
  return text.split(' ').map(function(tok) {
    if (tok && /^[A-G][b#]?[^|.]*$/.test(tok) && tok !== '.') {
      var dc = transposeChordName(tok, transpose || 0);
      return '\x3cspan class="chord" data-chord="' + esc(dc) + '"\x3e' + esc(dc) + '\x3c/span\x3e';
    }
    return esc(tok);
  }).join(' ');
}

function render({ meta, sections }, transpose) {
  const out = ['<div class="song-header">'];
  if (meta.title)    out.push('<div class="song-title">'    + esc(meta.title)    + '</div>');
  if (meta.subtitle) out.push('<div class="song-subtitle">' + esc(meta.subtitle) + '</div>');
  const mp = [];
  if (meta.artist) mp.push(esc(meta.artist));
  if (meta.key)    mp.push('Key: ' + esc(meta.key));
  if (meta.tempo)  mp.push(esc(meta.tempo) + ' BPM');
  const metaLine = mp.join(' &nbsp;·&nbsp; ');
  const capoBadge = meta.capo ? '<span class="capo-badge">Capo ' + esc(meta.capo) + '</span>' : '';
  if (metaLine || capoBadge) out.push('<div class="song-meta">' + metaLine + capoBadge + '</div>');
  out.push('</div>');

  // Balance col-zones: {x_columns_off} alone → implicit zone from start of song
  var _hasCZS = sections.some(function(s) { return s.type === 'col-zone-start'; });
  var _hasCZE = sections.some(function(s) { return s.type === 'col-zone-end'; });
  var effSections = (_hasCZE && !_hasCZS)
    ? [{ type: 'col-zone-start', lines: [], label: '', nav: false }].concat(sections)
    : sections;

  var secIdx = 0;
  var inColZone = false;
  for (const sec of effSections) {
    if (sec.type === 'col-zone-start') { out.push('<div class="col-zone">'); inColZone = true; continue; }
    if (sec.type === 'col-zone-end')   { out.push('</div>'); inColZone = false; continue; }
    if (sec.type === 'side-panel') {
      out.push('<div class="section section-side-panel">');
      out.push(_spGroupsHtml(sec.items || [], transpose));
      out.push('</div>');
      continue;
    }
    out.push('<div class="section section-' + sec.type + '" id="sec-' + (secIdx++) + '"' + (sec.nav ? ' data-nav="1"' : '') + '>');
    if (sec.label) out.push('<div class="section-label">' + esc(sec.label) + '</div>');

    if (sec.type === 'tab') {
      out.push('<pre class="tab-block">');
      for (const l of sec.lines) if (l.type === 'tab') out.push(esc(l.text));
      out.push('</pre>');
    } else if (sec.type === 'grid') {
      out.push('<pre class="grid-block">');
      for (const l of sec.lines) if (l.type === 'grid-line') out.push(renderGridLine(l.text, transpose));
      out.push('</pre>');
    } else {
      for (const l of sec.lines) {
        if (l.type === 'chord-line') {
          out.push('<div class="chord-line">');
          for (const s of l.segs) {
            var dc = transposeChordName(s.chord || '', transpose || 0);
            var tight = s.lyric && s.lyric.length > 0 && s.lyric[s.lyric.length - 1] !== ' ';
            out.push('<span class="pair' + (tight ? ' tight' : '') + '">'
              + '<span class="chord"' + (dc ? ' data-chord="' + esc(dc) + '"' : '') + '>'
              + (dc ? esc(dc) : '&nbsp;') + '</span>'
              + '<span class="lyric">'  + esc(s.lyric || ' ') + '</span>'
              + '</span>');
          }
          out.push('</div>');
        } else if (l.type === 'lyric')        out.push('<div class="lyric-line">'  + safeFmt(l.text) + '</div>');
        else if   (l.type === 'comment')      out.push('<div class="comment">'      + safeFmt(l.text) + '</div>');
        else if   (l.type === 'comment-box')  out.push('<div class="comment comment-box">' + safeFmt(l.text) + '</div>');
        else if   (l.type === 'chorus-ref')   out.push('<div class="chorus-ref">[ Chorus ]</div>');
        else if   (l.type === 'empty')        out.push('<div class="empty-line"></div>');
        else if   (l.type === 'page-break')   out.push('<hr class="page-break">');
        else if   (l.type === 'chord-diagram')out.push('<div class="chord-diagram-cell" data-chord="' + esc(transposeChordName(l.name, transpose || 0)) + '"></div>');
      }
    }
    out.push('</div>');
  }
  if (inColZone) out.push('</div>');
  return out.join('\\n');
}

// ── Chord diagram tooltips ────────────────────────────────────────────────────
var CHORD_SVGS = ${safeChordSvgs};

var tip = document.createElement('div');
tip.id = 'chord-tip';
document.body.appendChild(tip);

function showTip(el, e) {
  var name = el.dataset.chord;
  var svg  = CHORD_SVGS[name];
  if (!svg) {
    // Try enharmonic equivalent (C# ↔ Db, D# ↔ Eb, etc.)
    var rm = name && name.match(/^([A-G][b#]?)(.*)/);
    if (rm) {
      var si = _SH.indexOf(rm[1]), fi = _FL.indexOf(rm[1]);
      if (si >= 0) svg = CHORD_SVGS[_FL[si] + rm[2]];
      if (!svg && fi >= 0) svg = CHORD_SVGS[_SH[fi] + rm[2]];
    }
  }
  if (!svg) return;
  tip.innerHTML = svg + '<div>' + name + '</div>';
  tip.style.display = 'block';
  positionTip(e);
}
function positionTip(e) {
  var x = e.clientX + 12, y = e.clientY + 16;
  if (x + 130 > window.innerWidth)  x = e.clientX - 130;
  if (y + 160 > window.innerHeight) y = e.clientY - 160;
  tip.style.left = x + 'px';
  tip.style.top  = y + 'px';
}
function hideTip() { tip.style.display = 'none'; }

function bindTooltips() {
  document.querySelectorAll('.chord[data-chord]').forEach(function(el) {
    el.addEventListener('mouseenter', function(e) { showTip(el, e); });
    el.addEventListener('mousemove',  function(e) { positionTip(e); });
    el.addEventListener('mouseleave', hideTip);
  });
}

function populateChordDiagrams() {
  document.querySelectorAll('.chord-diagram-cell[data-chord]').forEach(function(cell) {
    var name = cell.dataset.chord;
    var svg = CHORD_SVGS[name];
    if (!svg) {
      var rm = name && name.match(/^([A-G][b#]?)(.*)/);
      if (rm) {
        var si = _SH.indexOf(rm[1]), fi = _FL.indexOf(rm[1]);
        if (si >= 0) svg = CHORD_SVGS[_FL[si] + rm[2]];
        if (!svg && fi >= 0) svg = CHORD_SVGS[_SH[fi] + rm[2]];
      }
    }
    if (svg) cell.innerHTML = svg + '<div class="cd-label">' + name + '</div>';
  });
}

// ── Progress bar ─────────────────────────────────────────────────────────────
var progressBar = document.getElementById('progress-bar');
function updateProgress() {
  var scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  progressBar.style.width = Math.min(100, (window.scrollY / scrollable) * 100) + '%';
}
window.addEventListener('scroll', updateProgress, { passive: true });

// ── Font size ─────────────────────────────────────────────────────────────────
var fontSize = 17;
function changeFontSize(delta) {
  fontSize = Math.max(11, Math.min(28, fontSize + delta));
  document.body.style.fontSize = fontSize + 'px';
  document.body.style.setProperty('--section-gap', Math.round(22 * fontSize / 17) + 'px');
  if (tempoSpeed) setTimeout(function() { applyTempoSpeed(PARSED.meta, false, true); }, 100);
  savePerfSettings();
}
document.getElementById('font-smaller').addEventListener('click', function() { changeFontSize(-1); });
document.getElementById('font-larger').addEventListener('click',  function() { changeFontSize(+1); });

// ── Col-zone class sync ───────────────────────────────────────────────────
function applyColZones() {
  var hasCZ = PARSED.sections.some(function(s) { return s.type === 'col-zone-start' || s.type === 'col-zone-end'; });
  document.getElementById('song').classList.toggle('has-col-zones', hasCZ);
}

// ── Chord Legend ──────────────────────────────────────────────────────────
var legendMode = 0; // 0=none 1=end 2=side
var legendEndEl  = document.getElementById('legend-end');
var legendSideEl = document.getElementById('legend-side');
function _getChordSvg(name) {
  var svg = CHORD_SVGS[name];
  if (!svg) {
    var rm = name && name.match(/^([A-G][b#]?)(.*)/);
    if (rm) {
      var si = _SH.indexOf(rm[1]), fi = _FL.indexOf(rm[1]);
      if (si >= 0) svg = CHORD_SVGS[_FL[si] + rm[2]];
      if (!svg && fi >= 0) svg = CHORD_SVGS[_SH[fi] + rm[2]];
    }
  }
  return svg || '';
}
function updateLegend() {
  var seen = {}, names = [];
  document.querySelectorAll('.chord[data-chord]').forEach(function(el) {
    if (!seen[el.dataset.chord]) { seen[el.dataset.chord] = true; names.push(el.dataset.chord); }
  });
  document.querySelectorAll('.chord-diagram-cell[data-chord]').forEach(function(el) {
    if (!seen[el.dataset.chord]) { seen[el.dataset.chord] = true; names.push(el.dataset.chord); }
  });
  names.sort();
  var html = names.map(function(n) {
    var svg = _getChordSvg(n);
    return svg ? '<div class="chord-diagram-cell">' + svg + '<div class="cd-label">' + esc(n) + '</div></div>' : '';
  }).join('');
  legendEndEl.querySelector('.legend-grid').innerHTML  = html;
  legendSideEl.querySelector('.legend-grid').innerHTML = html;
  legendEndEl.classList.toggle('active', legendMode === 1);
  legendSideEl.classList.toggle('active', legendMode === 2);
  document.body.classList.toggle('legend-side-on', legendMode === 2);
}
// ── Custom side panel ─────────────────────────────────────────────────────────
var customPanelEl = document.getElementById('custom-side-panel');
var panelMode = 'side';

function renderCustomPanel() {
  var sp = PARSED.sections.find(function(s) { return s.type === 'side-panel'; });
  if (!sp) { customPanelEl.innerHTML = ''; return; }
  customPanelEl.innerHTML = _spGroupsHtml(sp.items || [], previewTranspose);
  customPanelEl.querySelectorAll('.chord-diagram-cell[data-chord]').forEach(function(cell) {
    var svg = _getChordSvg(cell.dataset.chord);
    if (svg) cell.innerHTML = svg + '<div class="cd-label">' + esc(cell.dataset.chord) + '</div>';
  });
}

function applyCustomPanel() {
  var hasSP = PARSED.sections.some(function(s) { return s.type === 'side-panel'; });
  var pmRow = document.getElementById('panel-mode-row');
  if (pmRow) pmRow.style.display = hasSP ? '' : 'none';
  var legendSideRadio = document.querySelector('input[name="legend-mode"][value="2"]');
  if (legendSideRadio) {
    legendSideRadio.disabled = hasSP;
    var lsLabel = legendSideRadio.closest('label');
    if (lsLabel) lsLabel.title = hasSP ? 'Disabled: custom side panel is active' : '';
    if (hasSP && legendMode === 2) { legendMode = 0; updateLegend(); }
  }
  if (!hasSP) {
    customPanelEl.classList.remove('active');
    document.body.classList.remove('csp-side-on');
    return;
  }
  var isSide = panelMode === 'side';
  customPanelEl.classList.toggle('active', isSide);
  document.body.classList.toggle('csp-side-on', isSide);
  if (isSide) renderCustomPanel();
}

// ── Rerender (called when transpose or any display param changes) ─────────
function rerender() {
  document.getElementById('song').innerHTML = render(PARSED, previewTranspose);
  applyColZones();
  bindTooltips();
  populateChordDiagrams();
  updateLegend();
  applyCustomPanel();
  if (tempoSpeed) setTimeout(function() { applyTempoSpeed(PARSED.meta, false, true); }, 100);
}

// ── Settings panel ────────────────────────────────────────────────────────
var _sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
var settingsPopup = document.getElementById('settings-popup');
var settingsBtn   = document.getElementById('settings-btn');

settingsBtn.addEventListener('click', function(e) {
  e.stopPropagation();
  exportPopup.classList.remove('open');
  var open = settingsPopup.classList.toggle('open');
  settingsBtn.classList.toggle('open', open);
});
document.addEventListener('click', function(e) {
  if (!settingsBtn.contains(e.target) && !settingsPopup.contains(e.target)) {
    settingsPopup.classList.remove('open');
    settingsBtn.classList.remove('open');
  }
});

// Legend mode radios
document.querySelectorAll('input[name="legend-mode"]').forEach(function(r) {
  r.addEventListener('change', function() {
    legendMode = parseInt(this.value, 10);
    updateLegend();
    savePerfSettings();
  });
});

// Legend diagram size slider
var legendSzSlider = document.getElementById('legend-sz');
var legendSzVal    = document.getElementById('legend-sz-val');
legendSzSlider.addEventListener('input', function() {
  document.body.style.setProperty('--legend-svg-w', this.value + 'px');
  legendSzVal.textContent = this.value + 'px';
  savePerfSettings();
});
document.body.style.setProperty('--legend-svg-w', legendSzSlider.value + 'px');

// Song diagram size slider
var songSzSlider = document.getElementById('song-sz');
var songSzVal    = document.getElementById('song-sz-val');
songSzSlider.addEventListener('input', function() {
  document.body.style.setProperty('--song-svg-w', this.value + 'px');
  songSzVal.textContent = this.value + 'px';
  savePerfSettings();
});
document.body.style.setProperty('--song-svg-w', songSzSlider.value + 'px');

// Theme radios
(function() {
  var cur = _sysDark ? 'dark' : 'light';
  var radios = document.querySelectorAll('input[name="theme-mode"]');
  radios.forEach(function(r) { if (r.value === cur) r.checked = true; });
  radios.forEach(function(r) {
    r.addEventListener('change', function() {
      document.documentElement.dataset.theme = this.value;
      savePerfSettings();
    });
  });
})();

// Columns slider
var colSlider = document.getElementById('col-slider');
var colVal    = document.getElementById('col-val');
function applyColCount(n) {
  var song = document.getElementById('song');
  song.classList.remove('multi-col');
  song.style.removeProperty('--col-count');
  if (n >= 2) { song.style.setProperty('--col-count', n); song.classList.add('multi-col'); }
}
colSlider.addEventListener('input', function() {
  var n = parseInt(this.value, 10);
  colVal.textContent = n;
  applyColCount(n);
  savePerfSettings();
});

// Panel mode radios
document.querySelectorAll('input[name="panel-mode"]').forEach(function(r) {
  r.addEventListener('change', function() {
    panelMode = this.value;
    applyCustomPanel();
    savePerfSettings();
  });
});

// Panel width slider
var panelWSlider = document.getElementById('panel-w-slider');
var panelWVal    = document.getElementById('panel-w-val');
panelWSlider.addEventListener('input', function() {
  document.body.style.setProperty('--panel-w', this.value + 'px');
  panelWVal.textContent = this.value + 'px';
  savePerfSettings();
});
document.body.style.setProperty('--panel-w', panelWSlider.value + 'px');

// ── Live transpose ────────────────────────────────────────────────────────
var transLabel = document.getElementById('trans-label');
function _updateTransLabel() {
  transLabel.textContent = previewTranspose > 0 ? '+' + previewTranspose
                         : previewTranspose < 0 ? String(previewTranspose) : '0';
  transLabel.classList.toggle('active', previewTranspose !== 0);
}
document.getElementById('trans-down').addEventListener('click', function() {
  previewTranspose--; _updateTransLabel(); rerender();
});
document.getElementById('trans-up').addEventListener('click', function() {
  previewTranspose++; _updateTransLabel(); rerender();
});

// ── Boot ─────────────────────────────────────────────────────────────────────
const vscodeApi = acquireVsCodeApi();
const SOURCE = ${safeSource};
const SAVED_SETTINGS = ${safeSavedSettings};
var PARSED = parse(SOURCE);
document.getElementById('song').innerHTML = render(PARSED);
applyColZones();
bindTooltips();
populateChordDiagrams();
updateLegend();

// ── Saved settings ───────────────────────────────────────────────────────────
function savePerfSettings() {
  vscodeApi.postMessage({ command: 'saveSettings', settings: {
    theme:      document.documentElement.dataset.theme || (_sysDark ? 'dark' : 'light'),
    cols:       colSlider.value,
    fontSize:   fontSize,
    legendMode: legendMode,
    legendSz:   parseInt(legendSzSlider.value, 10),
    songSz:     parseInt(songSzSlider.value, 10),
    bpm:        (activeBpm > 0 && !PARSED.meta.tempo) ? activeBpm : null,
    panelMode:  panelMode,
    panelW:     parseInt(panelWSlider.value, 10)
  }});
}
(function applyPerfSettings() {
  var s = SAVED_SETTINGS;
  if (!s || !Object.keys(s).length) return;
  if (s.theme) {
    document.documentElement.dataset.theme = s.theme;
    document.querySelectorAll('input[name="theme-mode"]').forEach(function(r) { r.checked = r.value === s.theme; });
  }
  if (s.cols) {
    var n = parseInt(s.cols, 10) || 1;
    colSlider.value = n; colVal.textContent = n; applyColCount(n);
  }
  if (s.fontSize) {
    fontSize = s.fontSize;
    document.body.style.fontSize = fontSize + 'px';
    document.body.style.setProperty('--section-gap', Math.round(22 * fontSize / 17) + 'px');
  }
  if (s.legendMode) {
    legendMode = s.legendMode;
    document.querySelectorAll('input[name="legend-mode"]').forEach(function(r) { r.checked = parseInt(r.value, 10) === legendMode; });
    updateLegend();
  }
  if (s.legendSz) {
    legendSzSlider.value = s.legendSz;
    legendSzVal.textContent = s.legendSz + 'px';
    document.body.style.setProperty('--legend-svg-w', s.legendSz + 'px');
  }
  if (s.songSz) {
    songSzSlider.value = s.songSz;
    songSzVal.textContent = s.songSz + 'px';
    document.body.style.setProperty('--song-svg-w', s.songSz + 'px');
  }
  if (s.panelMode) {
    panelMode = s.panelMode;
    document.querySelectorAll('input[name="panel-mode"]').forEach(function(r) { r.checked = r.value === panelMode; });
  }
  if (s.panelW) {
    panelWSlider.value = s.panelW;
    panelWVal.textContent = s.panelW + 'px';
    document.body.style.setProperty('--panel-w', s.panelW + 'px');
  }
})();
applyCustomPanel();

// ── Auto-scroll ──────────────────────────────────────────────────────────────
let speed = 30, playing = false, lastTs = null, accum = 0;
const playBtn      = document.getElementById('play-btn');
const speedLabel   = document.getElementById('speed-label');

var tempoSpeed = 0; // non-zero when a {tempo:} is known
var activeBpm  = 0; // current BPM (from directive, tap, or typed)
const tempoBtn = document.getElementById('tempo-btn');
const bpmInput = document.getElementById('bpm-input');

function _updateTempoBtns() {
  var hasBpm = activeBpm > 0;
  tempoBtn.disabled = !hasBpm;
  tempoBtn.style.opacity = hasBpm ? '' : '0.35';
  tempoBtn.classList.toggle('active', hasBpm && speed === tempoSpeed);
}

function updateUI() {
  playBtn.textContent = playing ? '⏸' : '▶';
  speedLabel.textContent = speed + ' px/s';
  _updateTempoBtns();
}

// Central BPM setter — used by tap tempo and manual input (not directive)
function setBpm(bpm) {
  if (!bpm || bpm < 20 || bpm > 300) return;
  activeBpm = bpm;
  bpmInput.value = bpm;
  if (_metroActive) startMetronome();
  _updateMetroBtn();
  var computed = computeScrollSpeed(bpm);
  if (computed > 0) { tempoSpeed = computed; speed = tempoSpeed; updateUI(); }
  else { _updateTempoBtns(); }
  savePerfSettings();
}

// Returns computed px/s for a given BPM, or 0 if layout isn't ready
function computeScrollSpeed(bpm) {
  var lines = document.querySelectorAll('.chord-line').length;
  if (!lines) return 0;
  var scrollable = Math.max(
    document.body.scrollHeight - window.innerHeight,
    document.documentElement.scrollHeight - document.documentElement.clientHeight
  );
  if (scrollable <= 0) return 0;
  return Math.max(5, Math.min(300, Math.round(scrollable / (lines * 4 * 60 / bpm))));
}

// Set scroll speed from {tempo:} — 1 chord-line ≈ 1 bar (4 beats)
// keepManual=true: update tempoSpeed but don't override a manually-set speed
function applyTempoSpeed(meta, _retry, keepManual) {
  var bpm = parseInt(meta.tempo || '0');
  if (!bpm) return;
  var newTempo = computeScrollSpeed(bpm);
  if (!newTempo) {
    if (_retry) return;
    setTimeout(function() { applyTempoSpeed(meta, true, keepManual); }, 400);
    return;
  }
  var wasOnTempo = (tempoSpeed > 0 && speed === tempoSpeed);
  tempoSpeed = newTempo;
  if (!keepManual || wasOnTempo) speed = tempoSpeed;
  activeBpm = bpm;
  bpmInput.value = bpm;
  if (_metroActive) startMetronome();
  _updateMetroBtn();
  updateUI();
}

function step(ts) {
  if (!playing) { lastTs = null; accum = 0; return; }
  if (lastTs !== null) {
    accum += speed * (ts - lastTs) / 1000;
    const px = Math.floor(accum);
    if (px >= 1) { window.scrollBy(0, px); accum -= px; }
    if (window.scrollY + window.innerHeight >= document.body.scrollHeight - 2) {
      playing = false; updateUI(); return;
    }
  }
  lastTs = ts;
  requestAnimationFrame(step);
}

playBtn.addEventListener('click', () => {
  playing = !playing; updateUI();
  if (playing) requestAnimationFrame(step);
});
document.getElementById('faster-btn').addEventListener('click', function() { speed = Math.min(speed + 5, 300); updateUI(); });
document.getElementById('slower-btn').addEventListener('click', function() { speed = Math.max(speed - 5, 5);   updateUI(); });
tempoBtn.addEventListener('click', function() { if (tempoSpeed) { speed = tempoSpeed; updateUI(); } });

// BPM input — manual entry
bpmInput.addEventListener('keydown', function(e) {
  e.stopPropagation(); // prevent global shortcuts while typing
  if (e.key === 'Enter') { this.blur(); }
});
bpmInput.addEventListener('change', function() {
  setBpm(parseInt(this.value, 10));
});

// ── Export popup ──────────────────────────────────────────────────────────
var exportPopup = document.getElementById('export-popup');
var exportBtn   = document.getElementById('export-btn');
exportBtn.addEventListener('click', function(e) {
  e.stopPropagation();
  settingsPopup.classList.remove('open');
  settingsBtn.classList.remove('open');
  exportPopup.classList.toggle('open');
});
document.getElementById('exp-html').addEventListener('click', function() {
  exportPopup.classList.remove('open');
  vscodeApi.postMessage({ command: 'saveHtml' });
});
document.getElementById('exp-pdf').addEventListener('click', function() {
  exportPopup.classList.remove('open');
  window.print();
});
document.addEventListener('click', function(e) {
  if (!exportBtn.contains(e.target) && !exportPopup.contains(e.target)) exportPopup.classList.remove('open');
});
// ── Tap tempo ─────────────────────────────────────────────────────────────
var tapTimes = [];
document.getElementById('tap-btn').addEventListener('click', function() {
  var now = Date.now();
  if (tapTimes.length && now - tapTimes[tapTimes.length - 1] > 3000) tapTimes = [];
  tapTimes.push(now);
  if (tapTimes.length < 2) { bpmInput.placeholder = '…'; return; }
  if (tapTimes.length > 8) tapTimes.shift();
  var intervals = [];
  for (var i = 1; i < tapTimes.length; i++) intervals.push(tapTimes[i] - tapTimes[i - 1]);
  var bpm = Math.round(60000 / (intervals.reduce(function(a,b){return a+b;},0) / intervals.length));
  setBpm(bpm);
});


// ── Lyrics-only toggle ────────────────────────────────────────────────────
var lyricsBtn = document.getElementById('lyrics-btn');
lyricsBtn.addEventListener('click', function() {
  var on = document.getElementById('song').classList.toggle('lyrics-only');
  lyricsBtn.classList.toggle('active', on);
  lyricsBtn.title = on ? 'Show chords (L)' : 'Lyrics only — hide chords (L)';
});

// ── Full-screen (VSCode: maximise editor + hide sidebar) ──────────────────
var fsBtn = document.getElementById('fs-btn');
var _fsActive = false;
var _svgEnterFs = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 5V1h4M9 1h4v4M1 9v4h4M9 13h4V9"/></svg>';
var _svgExitFs  = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 1v4H1M13 5h-4V1M5 13v-4H1M13 9h-4v4"/></svg>';
fsBtn.addEventListener('click', function() {
  _fsActive = !_fsActive;
  fsBtn.innerHTML = _fsActive ? _svgExitFs : _svgEnterFs;
  fsBtn.title = _fsActive ? 'Exit full screen (F)' : 'Full screen (F)';
  vscodeApi.postMessage({ command: _fsActive ? 'enterFullscreen' : 'exitFullscreen' });
});

// ── Metronome ─────────────────────────────────────────────────────────────
var _metroActive = false;
var _metroTimer  = null;
var _metroBeat   = 0;
var _audioCtx    = null;
var metroBtn     = document.getElementById('metro-btn');

function _playClick(isDownbeat) {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    var osc = _audioCtx.createOscillator();
    var gain = _audioCtx.createGain();
    osc.connect(gain); gain.connect(_audioCtx.destination);
    osc.frequency.value = isDownbeat ? 1320 : 880;
    gain.gain.setValueAtTime(0.6, _audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.05);
    osc.start(_audioCtx.currentTime);
    osc.stop(_audioCtx.currentTime + 0.06);
  } catch(e) {}
}

function _metroTick() {
  if (!_metroActive || !activeBpm) { _metroActive = false; _updateMetroBtn(); return; }
  _playClick(_metroBeat === 0);
  _metroBeat = (_metroBeat + 1) % 4;
  _metroTimer = setTimeout(_metroTick, Math.round(60000 / activeBpm));
}

function startMetronome() {
  if (!activeBpm) return;
  _metroActive = true; _metroBeat = 0;
  clearTimeout(_metroTimer);
  _metroTick();
  _updateMetroBtn();
}

function stopMetronome() {
  _metroActive = false;
  clearTimeout(_metroTimer);
  _updateMetroBtn();
}

function _updateMetroBtn() {
  var hasBpm = activeBpm > 0;
  metroBtn.disabled = !hasBpm;
  metroBtn.style.opacity = hasBpm ? '' : '0.35';
  metroBtn.classList.toggle('active', _metroActive);
}

metroBtn.addEventListener('click', function() {
  if (_metroActive) stopMetronome(); else startMetronome();
});

document.addEventListener('keydown', e => {
  if (document.activeElement === bpmInput) return; // let the input handle its own keys
  if (e.code === 'Space')     { playBtn.click(); e.preventDefault(); }
  if (e.code === 'ArrowUp')   { document.getElementById('faster-btn').click(); e.preventDefault(); }
  if (e.code === 'ArrowDown') { document.getElementById('slower-btn').click(); e.preventDefault(); }
  if (e.key  === 't' || e.key === 'T') { document.getElementById('tap-btn').click(); e.preventDefault(); }
  if (e.key  === 'l' || e.key === 'L') { lyricsBtn.click(); e.preventDefault(); }
  if (e.key  === 'f' || e.key === 'F') { fsBtn.click(); e.preventDefault(); }
  if (e.key  === 'm' || e.key === 'M') { metroBtn.click(); e.preventDefault(); }
});

// Reload when file changes (triggered by save or re-running the command)
window.addEventListener('message', function(e) {
  if (e.data.command === 'reload') {
    var savedY = e.data.preserveScroll ? window.scrollY : 0;
    if (e.data.chordSvgs) CHORD_SVGS = e.data.chordSvgs;
    PARSED = parse(e.data.source);
    document.getElementById('song').innerHTML = render(PARSED, previewTranspose);
    applyColZones();
    bindTooltips();
    populateChordDiagrams();
    updateLegend();
    applyCustomPanel();
    window.scrollTo(0, savedY);
    setTimeout(function() { applyTempoSpeed(PARSED.meta); }, 200);
  }
});

updateUI();
setTimeout(function() {
  applyTempoSpeed(PARSED.meta);
  if (SAVED_SETTINGS.bpm && !PARSED.meta.tempo) setBpm(SAVED_SETTINGS.bpm);
}, 250);
</script>
</body>
</html>`;
    }

    // ─────────────────────────────────────────────
    // Setlist Webview
    // ─────────────────────────────────────────────
    function getSetlistWebviewContent(songs, sharedSvgs) {
        const safeSongs = JSON.stringify(songs.map(s => ({
            title: s.title, artist: s.artist, source: s.source, customSvgs: s.customSvgs
        })));
        const safeSharedSvgs = JSON.stringify(sharedSvgs);

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<meta name="color-scheme" content="dark light">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #1e1e1e; --fg: #d4d4d4; --fg-dim: #999; --fg-muted: #666;
  --border: #444; --chord: #79b8ff;
  --sec-chorus-bg: #1e2a4a; --sec-chorus-fg: #79b8ff;
  --sec-verse-bg: #2a2a2a;  --sec-verse-fg: #aaa;
  --sec-bridge-bg: #3a2a10; --sec-bridge-fg: #e8a050;
  --sec-tab-bg: #1e2a14;    --sec-tab-fg: #90c040;
  --tab-bg: #252525; --tab-border: #555;
  --tip-bg: #2d2d2d; --tip-border: #555; --tip-fg: #ccc;
  --capo-bg: #4a3010; --capo-fg: #ffcc60;
  --panel-bg: rgba(20,20,20,0.93); --panel-border: #444;
}
@media (prefers-color-scheme: light) {
  :root {
    --bg: #fafaf8; --fg: #1a1a1a; --fg-dim: #555; --fg-muted: #888;
    --border: #ddd; --chord: #1a5fb4;
    --sec-chorus-bg: #e8f0fe; --sec-chorus-fg: #2a5bbf;
    --sec-verse-bg: #f0f0f0;  --sec-verse-fg: #555;
    --sec-bridge-bg: #fef0d0; --sec-bridge-fg: #a05000;
    --sec-tab-bg: #f0f4e8;    --sec-tab-fg: #4a6a20;
    --tab-bg: #f4f4f0; --tab-border: #bbb;
    --tip-bg: #fff; --tip-border: #ccc; --tip-fg: #333;
    --capo-bg: #ffe8b0; --capo-fg: #7a4000;
    --panel-bg: rgba(245,245,243,0.97); --panel-border: #ccc;
  }
}
:root[data-theme="light"] {
  --bg: #fafaf8; --fg: #1a1a1a; --fg-dim: #555; --fg-muted: #888;
  --border: #ddd; --chord: #1a5fb4;
  --sec-chorus-bg: #e8f0fe; --sec-chorus-fg: #2a5bbf;
  --sec-verse-bg: #f0f0f0;  --sec-verse-fg: #555;
  --sec-bridge-bg: #fef0d0; --sec-bridge-fg: #a05000;
  --sec-tab-bg: #f0f4e8;    --sec-tab-fg: #4a6a20;
  --sec-xsec-bg: #e0f4f4;   --sec-xsec-fg: #1a7a7a;
  --tab-bg: #f4f4f0; --tab-border: #bbb;
  --tip-bg: #fff; --tip-border: #ccc; --tip-fg: #333;
  --capo-bg: #ffe8b0; --capo-fg: #7a4000;
  --panel-bg: rgba(245,245,243,0.97); --panel-border: #ccc;
}
:root[data-theme="dark"] {
  --bg: #1e1e1e; --fg: #d4d4d4; --fg-dim: #999; --fg-muted: #666;
  --border: #444; --chord: #79b8ff;
  --sec-chorus-bg: #1e2a4a; --sec-chorus-fg: #79b8ff;
  --sec-verse-bg: #2a2a2a;  --sec-verse-fg: #aaa;
  --sec-bridge-bg: #3a2a10; --sec-bridge-fg: #e8a050;
  --sec-tab-bg: #1e2a14;    --sec-tab-fg: #90c040;
  --sec-xsec-bg: #0e2a2a;   --sec-xsec-fg: #5cc8c8;
  --tab-bg: #252525; --tab-border: #555;
  --tip-bg: #2d2d2d; --tip-border: #555; --tip-fg: #ccc;
  --capo-bg: #4a3010; --capo-fg: #ffcc60;
  --panel-bg: rgba(20,20,20,0.93); --panel-border: #444;
}
html, body { background: var(--bg); color: var(--fg); font-family: Georgia, serif; font-size: 17px; }
body { padding-top: 52px; padding-bottom: 80px; }
#nav-bar {
  position: fixed; top: 0; left: 0; right: 0; z-index: 9998;
  background: rgba(20,20,20,0.95); border-bottom: 1px solid #555;
  display: flex; align-items: center; gap: 8px;
  padding: 6px 14px; font-family: sans-serif; color: #eee; user-select: none;
}
#nav-bar button {
  background: #3a3a3a; border: 1px solid #666; color: #eee;
  border-radius: 50%; width: 30px; height: 30px; font-size: 15px;
  cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;
}
#nav-bar button:hover { background: #555; }
#nav-bar button:disabled { opacity: 0.3; cursor: default; }
#song-counter { font-size: 12px; color: #aaa; min-width: 40px; text-align: center; }
#song-nav-title { flex: 1; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#nav-bar button.active { color: #ffd700; border-color: #ffd700; }
#progress-bar { position: fixed; top: 50px; left: 0; height: 3px; background: #79b8ff; width: 0%; z-index: 9999; transition: width 0.1s; }
#song { padding: 24px clamp(10px, 4vw, 40px) 40px; }
.song-header { margin-bottom: 18px; }
.song-title    { font-size: 2em; font-weight: bold; color: var(--fg); }
.song-subtitle { font-size: 1.1em; color: var(--fg-dim); margin-top: 2px; }
.song-meta     { font-size: 0.85em; color: var(--fg-muted); margin-top: 6px; }
.capo-badge { display: inline-block; margin-left: 8px; background: var(--capo-bg); color: var(--capo-fg); padding: 1px 7px; border-radius: 10px; font-size: 0.85em; }
.section { margin-bottom: 18px; padding: 10px 14px 10px 42px; border-radius: 6px; position: relative; }
.section-label { position: absolute; left: 14px; top: 10px; bottom: 10px; width: 20px; display: flex; align-items: center; justify-content: center; writing-mode: vertical-rl; transform: rotate(180deg); font-size: 0.65em; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08em; border-radius: 3px; padding: 4px 0; }
.section-chorus    .section-label { background: var(--sec-chorus-bg); color: var(--sec-chorus-fg); }
.section-chorus .chord { color: var(--sec-chorus-fg); }
.section-verse     .section-label { background: var(--sec-verse-bg);  color: var(--sec-verse-fg); }
.section-bridge    .section-label { background: var(--sec-bridge-bg); color: var(--sec-bridge-fg); }
.section-tab       { background: var(--sec-tab-bg); color: var(--sec-tab-fg); }
.section-x-section .section-label { background: var(--sec-xsec-bg); color: var(--sec-xsec-fg); }
.chord-line { display: flex; flex-wrap: wrap; margin-bottom: 2px; }
.pair { display: inline-flex; flex-direction: column; margin-right: 6px; }
.pair.tight { margin-right: 0; }
.chord { font-weight: bold; font-size: 0.85em; color: var(--chord); min-height: 1.2em; white-space: pre; cursor: default; }
.lyric { white-space: pre; }
.lyric-line { margin-bottom: 2px; }
.comment { font-style: italic; color: var(--fg-dim); margin: 4px 0; }
.comment-box { border: 1px solid var(--border); padding: 4px 8px; border-radius: 4px; }
.chorus-ref { color: var(--fg-muted); font-style: italic; }
.empty-line { height: 0.6em; }
.tab-block, .grid-block { font-family: monospace; font-size: 0.9em; background: var(--tab-bg); border: 1px solid var(--tab-border); padding: 8px 12px; border-radius: 4px; overflow-x: auto; white-space: pre; line-height: 1.5; }
.grid-block .chord { color: var(--chord); font-family: inherit; font-size: inherit; font-weight: inherit; cursor: pointer; }
.page-break { border: none; border-top: 1px dashed var(--border); margin: 16px 0; }
.chord-diagrams { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 6px 0; }
.chord-diagram-cell { display: inline-flex; flex-direction: column; align-items: center; }
.chord-diagram-cell svg { display: block; }
.chord-diagram-cell .cd-label { font-size: 0.78em; font-weight: bold; color: var(--chord); margin-top: 2px; }
#song.lyrics-only .chord { opacity: 0; height: 0; min-height: 0; overflow: hidden; }
#song.two-col { column-count: 2; column-gap: 3em; column-rule: 1px solid var(--border); }
#song.two-col .section { break-inside: avoid-column; }
#song.two-col .song-header { column-span: all; }
#song.has-col-zones.two-col { column-count: 1; column-rule: none; }
#song.has-col-zones.two-col .col-zone { column-count: 2; column-gap: 3em; column-rule: 1px solid var(--border); }
#song.has-col-zones.two-col .col-zone .section { break-inside: avoid-column; }
#chord-tip { position: fixed; display: none; background: var(--tip-bg); border: 1px solid var(--tip-border); border-radius: 8px; padding: 8px; z-index: 99999; pointer-events: none; text-align: center; color: var(--tip-fg); font-family: sans-serif; font-size: 12px; }
#scroll-bar {
  position: fixed; bottom: 14px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 6px;
  background: rgba(20,20,20,0.92); border: 1px solid #555; border-radius: 28px;
  padding: 8px 18px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  font-family: sans-serif; color: #eee; user-select: none; z-index: 9999;
}
#scroll-bar button {
  background: #3a3a3a; border: 1px solid #666; color: #eee;
  border-radius: 50%; width: 30px; height: 30px; font-size: 15px;
  cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;
}
#scroll-bar button:hover { background: #555; }
#play-btn    { width: 38px; height: 38px; font-size: 18px; }
#speed-label { min-width: 52px; text-align: center; font-size: 12px; color: #aaa; }
#tempo-btn   { font-size: 15px; opacity: 0.7; }
#tempo-btn:hover { opacity: 1; }
#tempo-btn.active { opacity: 1; color: #ffd700; border-color: #ffd700; }
#metro-btn   { font-size: 15px; opacity: 0.7; }
#metro-btn:hover { opacity: 1; }
#metro-btn.active { opacity: 1; color: #ffd700; border-color: #ffd700; }
#font-smaller, #font-larger { font-size: 11px; font-family: sans-serif; letter-spacing: -0.5px; border-radius: 6px !important; width: auto !important; padding: 0 7px !important; }
#theme-btn  { font-size: 14px; }
#trans-down, #trans-up { font-size: 13px; }
#trans-label { min-width: 28px; text-align: center; font-size: 12px; color: #aaa; padding: 0 2px; }
#trans-label.active { color: #ffd700; }
#save-btn    { font-size: 14px; opacity: 0.7; }
#save-btn:hover { opacity: 1; }
#lyrics-btn { font-size: 11px; font-family: sans-serif; border-radius: 6px !important; width: auto !important; padding: 0 7px !important; }
#lyrics-btn.active { color: #ffd700; border-color: #ffd700; }
#twocol-btn { font-size: 14px; }
#twocol-btn.active { color: #ffd700; border-color: #ffd700; }
#auto-btn.active { color: #ffd700; border-color: #ffd700; }
/* ── Custom side panel (inline mode only in setlist) ─────────────────────── */
.csp-group { display: flex; flex-direction: column; gap: 8px; }
.csp-section-badge {
  font-size: 11px; font-weight: bold; color: #9d8ef5; text-transform: uppercase;
  letter-spacing: 0.8px; padding: 3px 10px; background: rgba(124,109,240,0.18);
  border-radius: 5px; align-self: flex-start; border: 1px solid rgba(124,109,240,0.35);
}
.csp-chord-grid { display: flex; flex-wrap: wrap; gap: 8px 6px; }
.section-side-panel {
  background: rgba(128,128,128,0.1); border: 1px solid var(--border);
  border-radius: 8px; padding: 12px 14px; margin-bottom: 10px;
}
.section-side-panel .csp-group {
  flex-direction: row; flex-wrap: wrap; align-items: flex-start; gap: 6px 12px;
}
.section-side-panel .csp-section-badge {
  writing-mode: vertical-rl; transform: rotate(180deg); margin-right: 6px;
  align-self: stretch; display: flex; align-items: center; justify-content: center;
  border-radius: 4px; padding: 6px 4px; letter-spacing: 1px;
}
.section-side-panel .csp-chord-grid { flex: 1; }
</style>
</head>
<body>
<div id="nav-bar">
  <button id="prev-btn" title="Previous song (PageUp)">◀</button>
  <span id="song-counter">1/1</span>
  <span id="song-nav-title"></span>
  <button id="next-btn" title="Next song (PageDown)">▶</button>
  <button id="auto-btn" title="Auto-advance to next song at end">Auto</button>
  <button id="theme-nav-btn" title="Toggle theme">🌙</button>
  <button id="save-btn" title="Save setlist as HTML">💾</button>
</div>
<div id="progress-bar"></div>
<div id="song"></div>
<div id="chord-tip"></div>
<div id="scroll-bar">
  <button id="trans-down"   title="Transpose down (♭)">♭</button>
  <span   id="trans-label">0</span>
  <button id="trans-up"     title="Transpose up (♯)">♯</button>
  <button id="slower-btn"   title="Slower">−</button>
  <button id="play-btn"     title="Play / Pause (Space)">▶</button>
  <button id="faster-btn"   title="Faster">+</button>
  <span   id="speed-label">30 px/s</span>
  <button id="tempo-btn"    title="Snap to tempo speed" style="display:none">♩</button>
  <button id="metro-btn"    title="Metronome (M)" disabled style="opacity:0.3">♪</button>
  <button id="font-smaller" title="Smaller text">A−</button>
  <button id="font-larger"  title="Larger text">A+</button>
  <button id="lyrics-btn"   title="Lyrics only">Ly</button>
  <button id="twocol-btn"   title="Toggle two-column layout">⊞</button>
</div>
<script>
const vscodeApi = acquireVsCodeApi();
var SHARED_SVGS = ${safeSharedSvgs};
var SONGS = ${safeSongs};
var SONG_IDX = 0;
var CHORD_SVGS = {};
var PARSED = null;
var previewTranspose = 0;
var autoAdvance = false;
var fontSize = 17;

// ── Helpers (same as scroll preview) ────────────────────────────────────────
var _SH = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
var _FL = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
function _tn(root, n) {
  var fi = _FL.indexOf(root), si = _SH.indexOf(root);
  var pf = fi !== -1 && si === -1;
  var idx = si !== -1 ? si : fi;
  if (idx < 0) return root;
  return (pf ? _FL : _SH)[((idx + n) % 12 + 12) % 12];
}
function transposeChordName(chord, n) {
  if (!n) return chord;
  var sl = chord.indexOf('/');
  var main = sl >= 0 ? chord.slice(0, sl) : chord;
  var bass = sl >= 0 ? chord.slice(sl + 1) : null;
  var rm   = main.match(/^([A-G][b#]?)(.*)/);
  if (!rm) return chord;
  return _tn(rm[1], n) + rm[2] + (bass ? '/' + _tn(bass, n) : '');
}

function parseChordLine(line) {
  var segs = [], re = /\\[([^\\]]*)\\]/g, last = 0, pending = null, m;
  while ((m = re.exec(line)) !== null) {
    var before = line.slice(last, m.index);
    if (pending !== null || before) segs.push({ chord: pending || '', lyric: before });
    pending = m[1]; last = m.index + m[0].length;
  }
  var tail = line.slice(last);
  if (pending !== null || tail) segs.push({ chord: pending || '', lyric: tail });
  return segs;
}

function parse(text) {
  var meta = { title: '', subtitle: '', artist: '', key: '', capo: '', tempo: '' };
  var sections = [];
  var cur = { type: 'verse', label: '', lines: [], nav: false };
  var inSidePanel = null;
  function flush() { if (cur.lines.length) sections.push(cur); }
  function next(type, label, nav) { flush(); cur = { type, label, lines: [], nav: !!nav }; }
  for (var raw of text.split(/\\r?\\n/)) {
    var line = raw.trimEnd();
    if (/^\\s*#/.test(line)) continue;
    var dir = line.trim().match(/^\\{([^}]+)\\}$/);
    if (dir) {
      var ci = dir[1].indexOf(':');
      var k = (ci >= 0 ? dir[1].slice(0, ci) : dir[1]).trim().toLowerCase();
      var v = ci >= 0 ? dir[1].slice(ci + 1).trim() : '';
      if (k==='title'||k==='t')   { meta.title=v; continue; }
      if (k==='subtitle'||k==='st'){ meta.subtitle=v; continue; }
      if (k==='artist')           { meta.artist=v; continue; }
      if (k==='key')              { meta.key=v; continue; }
      if (k==='capo')             { meta.capo=v; continue; }
      if (k==='tempo')            { meta.tempo=v; continue; }
      if (k==='start_of_chorus'||k==='soc') { next('chorus',v||'Chorus',true); continue; }
      if (k==='end_of_chorus'||k==='eoc')   { next('verse','',false); continue; }
      if (k==='start_of_verse'||k==='sov')  { next('verse',v||'Verse',true); continue; }
      if (k==='end_of_verse'||k==='eov')    { next('verse','',false); continue; }
      if (k==='start_of_bridge'||k==='sob') { next('bridge',v||'Bridge',true); continue; }
      if (k==='end_of_bridge'||k==='eob')   { next('verse','',false); continue; }
      if (k==='start_of_tab'||k==='sot')    { next('tab',v||'Tab',true); continue; }
      if (k==='end_of_tab'||k==='eot')      { next('verse','',false); continue; }
      if (k==='start_of_grid'||k==='sog')   { next('grid',v||'Grid',true); continue; }
      if (k==='end_of_grid'||k==='eog')     { next('verse','',false); continue; }
      if (k==='x_start_section')                  { next('x-section',v||'Section',true); continue; }
      if (k==='x_end_section')              { next('verse','',false); continue; }
      if (k==='x_columns_on')  { flush(); sections.push({type:'col-zone-start',lines:[],label:'',nav:false}); cur={type:'verse',label:'',lines:[],nav:false}; continue; }
      if (k==='x_columns_off') { flush(); sections.push({type:'col-zone-end',  lines:[],label:'',nav:false}); cur={type:'verse',label:'',lines:[],nav:false}; continue; }
      if (k==='x_start_side_panel') { flush(); var _sp2={type:'side-panel',items:[],label:'',nav:false,lines:[]}; sections.push(_sp2); inSidePanel=_sp2; cur={type:'verse',label:'',lines:[],nav:false}; continue; }
      if (k==='x_end_side_panel')   { inSidePanel=null; cur={type:'verse',label:'',lines:[],nav:false}; continue; }
      if (k==='x_panel_section_title') { if (inSidePanel) inSidePanel.items.push({type:'title',label:v}); continue; }
      if (k==='comment'||k==='c'||k==='highlight') { if (!inSidePanel) cur.lines.push({type:'comment',text:v}); continue; }
      if (k==='comment_italic'||k==='ci')           { if (!inSidePanel) cur.lines.push({type:'comment',text:v}); continue; }
      if (k==='comment_box'||k==='cb')              { if (!inSidePanel) cur.lines.push({type:'comment-box',text:v}); continue; }
      if (k==='chorus')                             { if (!inSidePanel) cur.lines.push({type:'chorus-ref'}); continue; }
      if (k==='new_page'||k==='np')                 { if (!inSidePanel) cur.lines.push({type:'page-break'}); continue; }
      if (k==='chord' && v && !v.includes('frets')) {
        if (inSidePanel) { inSidePanel.items.push({type:'chord',name:v.trim()}); continue; }
        cur.lines.push({type:'chord-diagram',name:v.trim()}); continue;
      }
      continue;
    }
    if (inSidePanel) continue; // skip non-directive lines inside side panel block
    if (cur.type==='tab')  { cur.lines.push({type:'tab',       text:line}); continue; }
    if (cur.type==='grid') { cur.lines.push({type:'grid-line', text:line}); continue; }
    if (!line.trim())      { cur.lines.push({type:'empty'}); continue; }
    if (line.includes('[')) cur.lines.push({type:'chord-line',segs:parseChordLine(line)});
    else                    cur.lines.push({type:'lyric',text:line});
  }
  flush();
  return { meta, sections };
}

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function safeFmt(s) { return esc(s).replace(new RegExp('&lt;(\\/?(b|i|em|strong|u|s))&gt;', 'gi'), '\x3c$1\x3e'); }
function _spGroupsHtml(items, transpose) {
  var groups = [], grp = { label: '', chords: [] };
  (items || []).forEach(function(item) {
    if (item.type === 'title') { if (grp.chords.length || grp.label) groups.push(grp); grp = { label: item.label, chords: [] }; }
    else if (item.type === 'chord') grp.chords.push(item.name);
  });
  if (grp.chords.length || grp.label) groups.push(grp);
  return groups.map(function(g) {
    var cells = g.chords.map(function(n) {
      var tn = transposeChordName(n, transpose || 0);
      return '<div class="chord-diagram-cell" data-chord="' + esc(tn) + '"></div>';
    }).join('');
    var badge = g.label ? '<div class="csp-section-badge">' + esc(g.label) + '</div>' : '';
    return '<div class="csp-group">' + badge + '<div class="csp-chord-grid">' + cells + '</div></div>';
  }).join('');
}
function renderGridLine(text, transpose) {
  return text.split(' ').map(function(tok) {
    if (tok && /^[A-G][b#]?[^|.]*$/.test(tok) && tok !== '.') {
      var dc = transposeChordName(tok, transpose || 0);
      return '\x3cspan class="chord" data-chord="' + esc(dc) + '"\x3e' + esc(dc) + '\x3c/span\x3e';
    }
    return esc(tok);
  }).join(' ');
}

function render({ meta, sections }, transpose) {
  var out = ['<div class="song-header">'];
  if (meta.title)    out.push('<div class="song-title">'    + esc(meta.title)    + '</div>');
  if (meta.subtitle) out.push('<div class="song-subtitle">' + esc(meta.subtitle) + '</div>');
  var mp = [];
  if (meta.artist) mp.push(esc(meta.artist));
  if (meta.key)    mp.push('Key: ' + esc(meta.key));
  if (meta.tempo)  mp.push(esc(meta.tempo) + ' BPM');
  var capoBadge = meta.capo ? '<span class="capo-badge">Capo ' + esc(meta.capo) + '</span>' : '';
  if (mp.length || capoBadge) out.push('<div class="song-meta">' + mp.join(' &nbsp;·&nbsp; ') + capoBadge + '</div>');
  out.push('</div>');
  var _hasCZS2=sections.some(function(s){return s.type==='col-zone-start';});
  var _hasCZE2=sections.some(function(s){return s.type==='col-zone-end';});
  var effSections2=(_hasCZE2&&!_hasCZS2)?[{type:'col-zone-start',lines:[],label:'',nav:false}].concat(sections):sections;
  var _inColZone = false;
  for (var sec of effSections2) {
    if (sec.type === 'col-zone-start') { out.push('<div class="col-zone">'); _inColZone = true; continue; }
    if (sec.type === 'col-zone-end')   { out.push('</div>'); _inColZone = false; continue; }
    if (sec.type === 'side-panel') {
      out.push('<div class="section section-side-panel">');
      out.push(_spGroupsHtml(sec.items || [], transpose));
      out.push('</div>');
      continue;
    }
    out.push('<div class="section section-' + sec.type + '">');
    if (sec.label) out.push('<div class="section-label">' + esc(sec.label) + '</div>');
    if (sec.type === 'tab') {
      out.push('<pre class="tab-block">');
      for (var l of sec.lines) if (l.type==='tab') out.push(esc(l.text));
      out.push('</pre>');
    } else if (sec.type === 'grid') {
      out.push('<pre class="grid-block">');
      for (var l of sec.lines) if (l.type==='grid-line') out.push(renderGridLine(l.text, transpose));
      out.push('</pre>');
    } else {
      for (var l of sec.lines) {
        if (l.type==='chord-line') {
          out.push('<div class="chord-line">');
          for (var s of l.segs) {
            var dc = transposeChordName(s.chord||'', transpose||0);
            var tight = s.lyric && s.lyric.length > 0 && s.lyric[s.lyric.length - 1] !== ' ';
            out.push('<span class="pair' + (tight?' tight':'') + '"><span class="chord"' + (dc?' data-chord="'+esc(dc)+'"':'') + '>' + (dc?esc(dc):'&nbsp;') + '</span><span class="lyric">' + esc(s.lyric||' ') + '</span></span>');
          }
          out.push('</div>');
        } else if (l.type==='lyric')        out.push('<div class="lyric-line">'  + safeFmt(l.text) + '</div>');
        else if   (l.type==='comment')      out.push('<div class="comment">'      + safeFmt(l.text) + '</div>');
        else if   (l.type==='comment-box')  out.push('<div class="comment comment-box">' + safeFmt(l.text) + '</div>');
        else if   (l.type==='chorus-ref')   out.push('<div class="chorus-ref">[ Chorus ]</div>');
        else if   (l.type==='empty')        out.push('<div class="empty-line"></div>');
        else if   (l.type==='page-break')   out.push('<hr class="page-break">');
        else if   (l.type==='chord-diagram')out.push('<div class="chord-diagram-cell" data-chord="' + esc(transposeChordName(l.name, transpose||0)) + '"></div>');
      }
    }
    out.push('</div>');
  }
  if (_inColZone) out.push('</div>');
  return out.join('\\n');
}

// Chord tooltips
var tip = document.createElement('div');
tip.id = 'chord-tip'; document.body.appendChild(tip);
function showTip(el, e) {
  var name = el.dataset.chord;
  var svg = CHORD_SVGS[name];
  if (!svg) {
    var rm = name && name.match(/^([A-G][b#]?)(.*)/);
    if (rm) {
      var si = _SH.indexOf(rm[1]), fi = _FL.indexOf(rm[1]);
      if (si >= 0) svg = CHORD_SVGS[_FL[si] + rm[2]];
      if (!svg && fi >= 0) svg = CHORD_SVGS[_SH[fi] + rm[2]];
    }
  }
  if (!svg) return;
  tip.innerHTML = svg + '<div>' + name + '</div>';
  tip.style.display = 'block'; positionTip(e);
}
function positionTip(e) {
  var x = e.clientX+12, y = e.clientY+16;
  if (x+130>window.innerWidth) x=e.clientX-130;
  if (y+160>window.innerHeight) y=e.clientY-160;
  tip.style.left=x+'px'; tip.style.top=y+'px';
}
function hideTip() { tip.style.display='none'; }
function bindTooltips() {
  document.querySelectorAll('.chord[data-chord]').forEach(function(el) {
    el.addEventListener('mouseenter', function(e) { showTip(el,e); });
    el.addEventListener('mousemove',  function(e) { positionTip(e); });
    el.addEventListener('mouseleave', hideTip);
  });
}
function populateChordDiagrams() {
  document.querySelectorAll('.chord-diagram-cell[data-chord]').forEach(function(cell) {
    var name = cell.dataset.chord;
    var svg = CHORD_SVGS[name];
    if (!svg) {
      var rm = name && name.match(/^([A-G][b#]?)(.*)/);
      if (rm) {
        var si=_SH.indexOf(rm[1]), fi=_FL.indexOf(rm[1]);
        if (si>=0) svg=CHORD_SVGS[_FL[si]+rm[2]];
        if (!svg && fi>=0) svg=CHORD_SVGS[_SH[fi]+rm[2]];
      }
    }
    if (svg) cell.innerHTML=svg+'<div class="cd-label">'+name+'</div>';
  });
}

// Progress bar
var progressBar = document.getElementById('progress-bar');
function updateProgress() {
  var scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  progressBar.style.width = Math.min(100, (window.scrollY/scrollable)*100) + '%';
}
window.addEventListener('scroll', updateProgress, { passive: true });

// Auto-scroll
var speed = 30, playing = false, lastTs = null, accum = 0;
var tempoSpeed = 0, activeBpm = 0;
var playBtn   = document.getElementById('play-btn');
var speedLabel = document.getElementById('speed-label');
var tempoBtn  = document.getElementById('tempo-btn');

function computeScrollSpeed(bpm) {
  var lines = document.querySelectorAll('.chord-line').length;
  if (!lines) return 0;
  var scrollable = Math.max(document.body.scrollHeight-window.innerHeight, document.documentElement.scrollHeight-document.documentElement.clientHeight);
  if (scrollable<=0) return 0;
  return Math.max(5, Math.min(300, Math.round(scrollable/(lines*4*60/bpm))));
}

function updateUI() {
  playBtn.textContent = playing ? '⏸' : '▶';
  speedLabel.textContent = speed + ' px/s';
  if (tempoSpeed) { tempoBtn.style.display='flex'; tempoBtn.classList.toggle('active', speed===tempoSpeed); }
}

function applyTempoSpeed(meta, _retry) {
  var bpm = parseInt(meta.tempo||'0'); if (!bpm) return;
  var s = computeScrollSpeed(bpm);
  if (!s) { if (!_retry) setTimeout(function(){applyTempoSpeed(meta,true);},400); return; }
  tempoSpeed = s; speed = s; activeBpm = bpm;
  if (_metroActive) startMetronome();
  _updateMetroBtn();
  updateUI();
}

function step(ts) {
  if (!playing) { lastTs=null; accum=0; return; }
  if (lastTs!==null) {
    accum += speed*(ts-lastTs)/1000;
    var px = Math.floor(accum);
    if (px>=1) { window.scrollBy(0,px); accum-=px; }
    if (window.scrollY+window.innerHeight >= document.body.scrollHeight-2) {
      playing = false; updateUI();
      if (autoAdvance && SONG_IDX < SONGS.length-1) setTimeout(function(){loadSong(SONG_IDX+1);},800);
      return;
    }
  }
  lastTs=ts; requestAnimationFrame(step);
}

playBtn.addEventListener('click', function(){ playing=!playing; updateUI(); if(playing) requestAnimationFrame(step); });
document.getElementById('faster-btn').addEventListener('click', function(){ speed=Math.min(speed+5,300); updateUI(); });
document.getElementById('slower-btn').addEventListener('click', function(){ speed=Math.max(speed-5,5);  updateUI(); });
tempoBtn.addEventListener('click', function(){ if(tempoSpeed){speed=tempoSpeed;updateUI();} });

// Metronome (same as scroll preview)
var _metroActive=false, _metroTimer=null, _metroBeat=0, _audioCtx=null;
var metroBtn = document.getElementById('metro-btn');
function _playClick(isDownbeat) {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    var osc=_audioCtx.createOscillator(), gain=_audioCtx.createGain();
    osc.connect(gain); gain.connect(_audioCtx.destination);
    osc.frequency.value=isDownbeat?1320:880;
    gain.gain.setValueAtTime(0.6,_audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001,_audioCtx.currentTime+0.05);
    osc.start(_audioCtx.currentTime); osc.stop(_audioCtx.currentTime+0.06);
  } catch(e){}
}
function _metroTick() {
  if (!_metroActive||!activeBpm){_metroActive=false;_updateMetroBtn();return;}
  _playClick(_metroBeat===0); _metroBeat=(_metroBeat+1)%4;
  _metroTimer=setTimeout(_metroTick,Math.round(60000/activeBpm));
}
function startMetronome(){if(!activeBpm)return;_metroActive=true;_metroBeat=0;clearTimeout(_metroTimer);_metroTick();_updateMetroBtn();}
function stopMetronome(){_metroActive=false;clearTimeout(_metroTimer);_updateMetroBtn();}
function _updateMetroBtn(){metroBtn.disabled=activeBpm===0;metroBtn.style.opacity=activeBpm===0?'0.3':'';metroBtn.classList.toggle('active',_metroActive);}
metroBtn.addEventListener('click',function(){if(_metroActive)stopMetronome();else startMetronome();});

// Font size
document.getElementById('font-smaller').addEventListener('click',function(){fontSize=Math.max(11,fontSize-1);document.body.style.fontSize=fontSize+'px';});
document.getElementById('font-larger').addEventListener('click', function(){fontSize=Math.min(28,fontSize+1);document.body.style.fontSize=fontSize+'px';});

// Lyrics toggle
var lyricsBtn = document.getElementById('lyrics-btn');
lyricsBtn.addEventListener('click',function(){
  var on=document.getElementById('song').classList.toggle('lyrics-only');
  lyricsBtn.classList.toggle('active',on);
});

// Two-column toggle
var twoColBtn = document.getElementById('twocol-btn');
twoColBtn.addEventListener('click',function(){
  var on=document.getElementById('song').classList.toggle('two-col');
  twoColBtn.classList.toggle('active',on);
});

// Transpose
var transLabel = document.getElementById('trans-label');
function _updateTransLabel(){
  transLabel.textContent = previewTranspose>0?'+'+previewTranspose:previewTranspose<0?String(previewTranspose):'0';
  transLabel.classList.toggle('active',previewTranspose!==0);
}
document.getElementById('trans-down').addEventListener('click',function(){previewTranspose--;_updateTransLabel();rerender();});
document.getElementById('trans-up').addEventListener('click',  function(){previewTranspose++;_updateTransLabel();rerender();});
function applyColZones(){var hasCZ=PARSED.sections.some(function(s){return s.type==='col-zone-start'||s.type==='col-zone-end';});document.getElementById('song').classList.toggle('has-col-zones',hasCZ);}
function rerender(){document.getElementById('song').innerHTML=render(PARSED,previewTranspose);applyColZones();bindTooltips();populateChordDiagrams();}

// Theme
var _sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
var themeNavBtn = document.getElementById('theme-nav-btn');
function _updateThemeNavBtn(){
  var cur = document.documentElement.dataset.theme||(_sysDark?'dark':'light');
  themeNavBtn.textContent = cur==='dark'?'☀️':'🌙';
}
themeNavBtn.addEventListener('click',function(){
  var cur=document.documentElement.dataset.theme||(_sysDark?'dark':'light');
  document.documentElement.dataset.theme=cur==='dark'?'light':'dark';
  _updateThemeNavBtn();
});

// Auto advance
var autoBtn = document.getElementById('auto-btn');
autoBtn.addEventListener('click',function(){autoAdvance=!autoAdvance;autoBtn.classList.toggle('active',autoAdvance);});

// Save
document.getElementById('save-btn').addEventListener('click',function(){vscodeApi.postMessage({command:'saveSetlistHtml'});});

// Navigation
function updateSongNav(){
  var s=SONGS[SONG_IDX];
  document.getElementById('song-counter').textContent=(SONG_IDX+1)+'/'+SONGS.length;
  document.getElementById('song-nav-title').textContent=s.title+(s.artist?' — '+s.artist:'');
  document.getElementById('prev-btn').disabled=SONG_IDX===0;
  document.getElementById('next-btn').disabled=SONG_IDX===SONGS.length-1;
}

function loadSong(idx){
  SONG_IDX=idx;
  var s=SONGS[idx];
  CHORD_SVGS=Object.assign({},SHARED_SVGS,s.customSvgs||{});
  previewTranspose=0; _updateTransLabel();
  PARSED=parse(s.source);
  document.getElementById('song').innerHTML=render(PARSED,0);
  applyColZones();
  bindTooltips();
  populateChordDiagrams();
  window.scrollTo(0,0);
  playing=false; updateUI();
  updateSongNav();
  tempoSpeed=0; activeBpm=0;
  if(_metroActive)stopMetronome(); else _updateMetroBtn();
  setTimeout(function(){applyTempoSpeed(PARSED.meta);},200);
}

document.getElementById('prev-btn').addEventListener('click',function(){if(SONG_IDX>0)loadSong(SONG_IDX-1);});
document.getElementById('next-btn').addEventListener('click',function(){if(SONG_IDX<SONGS.length-1)loadSong(SONG_IDX+1);});

document.addEventListener('keydown',function(e){
  if(e.code==='Space')    {playBtn.click();e.preventDefault();}
  if(e.code==='ArrowUp')  {document.getElementById('faster-btn').click();e.preventDefault();}
  if(e.code==='ArrowDown'){document.getElementById('slower-btn').click();e.preventDefault();}
  if(e.code==='PageUp')   {if(SONG_IDX>0)loadSong(SONG_IDX-1);e.preventDefault();}
  if(e.code==='PageDown') {if(SONG_IDX<SONGS.length-1)loadSong(SONG_IDX+1);e.preventDefault();}
  if(e.key==='m'||e.key==='M'){metroBtn.click();e.preventDefault();}
  if(e.key==='l'||e.key==='L'){lyricsBtn.click();e.preventDefault();}
});

// Boot
_updateThemeNavBtn();
if(SONGS.length) loadSong(0);
</script>
</body>
</html>`;
    }

    // ─────────────────────────────────────────────
    // Transpose Chords
    // ─────────────────────────────────────────────

    const TRANSPOSE_ITEMS = [
        { label: '+1',  description: 'up a half step',             n:  1 },
        { label: '+2',  description: 'up a whole step',            n:  2 },
        { label: '+3',  description: 'up a minor third',           n:  3 },
        { label: '+4',  description: 'up a major third',           n:  4 },
        { label: '+5',  description: 'up a fourth',                n:  5 },
        { label: '+6',  description: 'up a tritone',               n:  6 },
        { label: '-1',  description: 'down a half step',           n: -1 },
        { label: '-2',  description: 'down a whole step',          n: -2 },
        { label: '-3',  description: 'down a minor third',         n: -3 },
        { label: '-4',  description: 'down a major third',         n: -4 },
        { label: '-5',  description: 'down a fourth / up a fifth', n: -5 },
        { label: '-6',  description: 'down a tritone',             n: -6 },
        { label: '$(edit) Custom…', description: 'enter any number of semitones', custom: true },
    ];

    const transposeChords = vscode.commands.registerCommand('extension.transposeChords', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { vscode.window.showErrorMessage('No active editor'); return; }

        const picked = await vscode.window.showQuickPick(TRANSPOSE_ITEMS, {
            placeHolder: 'Transpose by how many semitones?'
        });
        if (!picked) return;

        let n;
        if (picked.custom) {
            const input = await vscode.window.showInputBox({
                prompt: 'Semitones to transpose (positive = up, negative = down)',
                placeHolder: 'e.g. 2 or -3',
                validateInput: v => (isNaN(parseInt(v, 10)) ? 'Enter a whole number' : null)
            });
            if (!input) return;
            n = parseInt(input, 10);
        } else {
            n = picked.n;
        }

        const doc = editor.document;
        const hasSelection = !editor.selection.isEmpty;
        const range = hasSelection
            ? editor.selection
            : new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
        const text = doc.getText(hasSelection ? editor.selection : undefined);

        const result = text
            .replace(/\[([A-G][b#]?[^\]]*)\]/g, (_, chord) => '[' + transposeChordToken(chord, n) + ']')
            .replace(/(\{key\s*:\s*)([A-G][b#]?)([^}]*)(\})/gi, (_, pre, root, rest, close) =>
                pre + transposeNote(root, n) + rest + close
            );

        const edit = new vscode.WorkspaceEdit();
        edit.replace(doc.uri, range, result);
        await vscode.workspace.applyEdit(edit);

        const label = n > 0 ? `+${n}` : `${n}`;
        vscode.window.showInformationMessage(`Transposed ${label} semitone${Math.abs(n) !== 1 ? 's' : ''}`);
    });

    // ─────────────────────────────────────────────
    // Oolimo Chord Analyzer
    // ─────────────────────────────────────────────

    let oolimoPanel = null;

    const openChordAnalyzer = vscode.commands.registerCommand('extension.openChordAnalyzer', () => {
        if (oolimoPanel) {
            oolimoPanel.reveal(vscode.ViewColumn.Beside);
            return;
        }

        oolimoPanel = vscode.window.createWebviewPanel(
            'oolimoChordAnalyzer',
            'Chord Analyzer',
            vscode.ViewColumn.Beside,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        oolimoPanel.webview.html = getOolimoWebviewContent();

        oolimoPanel.webview.onDidReceiveMessage(msg => {
            if (msg.command === 'openExternal') {
                vscode.env.openExternal(vscode.Uri.parse(msg.url));
            }
        });

        oolimoPanel.onDidDispose(() => { oolimoPanel = null; });
    });

    function getOolimoWebviewContent() {
        const url = 'https://www.oolimo.com/en/guitar-chords/analyze';
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src https://www.oolimo.com; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
<title>Chord Analyzer</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { height: 100vh; overflow: hidden; background: #1e1e1e; }
  iframe { width: 100%; height: 100%; border: none; display: block; }
  #blocked-msg {
    display: none; position: fixed; inset: 0;
    flex-direction: column; align-items: center; justify-content: center; gap: 12px;
    background: #1e1e1e; text-align: center; padding: 20px; color: #aaa; font-family: sans-serif;
  }
  #blocked-msg p { font-size: 14px; line-height: 1.6; }
  #blocked-open-btn {
    padding: 8px 20px; background: #0e639c; border: none; color: #fff;
    border-radius: 4px; cursor: pointer; font-size: 14px;
  }
  #blocked-open-btn:hover { background: #1177bb; }
</style>
</head>
<body>
<iframe id="frame" src="${url}" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>
<div id="blocked-msg">
  <p>Oolimo cannot be embedded here (the site blocks iframes).<br>Click below to open it in your browser.</p>
  <button id="blocked-open-btn">Open Oolimo in browser</button>
</div>
<script>
  const vscode = acquireVsCodeApi();
  let loaded = false;
  document.getElementById('frame').addEventListener('load', () => { loaded = true; });
  setTimeout(() => {
    if (!loaded) { document.getElementById('blocked-msg').style.display = 'flex'; }
  }, 6000);
  document.getElementById('blocked-open-btn').addEventListener('click', () => {
    vscode.postMessage({ command: 'openExternal', url: '${url}' });
  });
</script>
</body>
</html>`;
    }

    // Chord diagram hover — fires when hovering over [chord] tokens
    const chordHoverProvider = vscode.languages.registerHoverProvider('chordpro', {
        provideHover(document, position) {
            const line = document.lineAt(position).text;

            // Helper: build hover for a chord name with given token range
            function hoverForChord(chordName, start, end) {
                const docDefines = parseDocumentDefines(document);
                const saved = getPrimaryVoicing(context, chordName);
                let frets = docDefines[chordName]
                    ?? (saved ? [...saved.frets].reverse() : null)
                    ?? CHORD_DB[chordName];
                const usageRe = new RegExp('\\[' + escapeRegex(chordName) + '\\]', 'g');
                const usageCount = (document.getText().match(usageRe) || []).length;
                const md = new vscode.MarkdownString();
                md.isTrusted = true;
                md.supportHtml = true;
                if (frets) {
                    const svg = generateChordSvg(frets, chordName);
                    const b64 = Buffer.from(svg).toString('base64');
                    md.appendMarkdown(`**${chordName}**\n\n![${chordName}](data:image/svg+xml;base64,${b64})`);
                    const args = encodeURIComponent(JSON.stringify([chordName, frets, null]));
                    md.appendMarkdown(`\n\n[Open in Chord Builder](command:chordpro.openInBuilder?${args})`);
                } else {
                    md.appendMarkdown(`**${chordName}**`);
                }
                md.appendMarkdown(`\n\n*Used ${usageCount}× in this file*`);
                return new vscode.Hover(md, new vscode.Range(position.line, start, position.line, end));
            }

            // {define: NAME ...} lines — show diagram + Open in Builder
            const defineMatch = line.match(/^\s*\{(?:define|chord):?\s+([^\s}]+)/i);
            if (defineMatch) {
                const chordName = defineMatch[1];
                const docDefines = parseDocumentDefines(document);
                const frets = docDefines[chordName];
                if (frets) {
                    const md = new vscode.MarkdownString();
                    md.isTrusted = true;
                    const svg = generateChordSvg(frets, chordName);
                    const b64 = Buffer.from(svg).toString('base64');
                    md.appendMarkdown(`**${chordName}**\n\n![${chordName}](data:image/svg+xml;base64,${b64})`);
                    const args = encodeURIComponent(JSON.stringify([chordName, frets, null]));
                    md.appendMarkdown(`\n\n[Open in Chord Builder](command:chordpro.openInBuilder?${args})`);
                    return new vscode.Hover(md);
                }
            }

            // Standard [chord] tokens
            const re = /\[([A-G][b#]?[^\]]*)\]/g;
            let m;
            while ((m = re.exec(line)) !== null) {
                const start = m.index, end = m.index + m[0].length;
                if (position.character >= start && position.character <= end) {
                    return hoverForChord(m[1], start, end);
                }
            }

            // Grid chord tokens: bare chord names on lines inside {start_of_grid} blocks
            const lineNo = position.line;
            const docText = document.getText();
            const docLines = docText.split('\n');
            let inGrid = false;
            for (let i = 0; i < lineNo; i++) {
                if (/\{start_of_grid\b/i.test(docLines[i])) inGrid = true;
                else if (/\{end_of_grid\b/i.test(docLines[i])) inGrid = false;
            }
            if (inGrid && !/^\s*\{/.test(line)) {
                const gridRe = /(?<![^\s|])([A-G][b#]?\S*)/g;
                while ((m = gridRe.exec(line)) !== null) {
                    const start = m.index, end = m.index + m[1].length;
                    if (position.character >= start && position.character <= end) {
                        return hoverForChord(m[1], start, end);
                    }
                }
            }
        }
    });

    // ── Editing & Navigation ──────────────────────────────────────────────

    // Section type → display name
    const SECTION_NAMES = {
        start_of_chorus: 'Chorus', soc: 'Chorus',
        start_of_verse:  'Verse',  sov: 'Verse',
        start_of_bridge: 'Bridge', sob: 'Bridge',
        start_of_tab:    'Tab',    sot: 'Tab',
        start_of_grid:   'Grid',   sog: 'Grid',
        start_of_abc:    'ABC Notation',
        start_of_ly:     'LilyPond',
        start_of_svg:    'SVG',
    };
    const SECTION_START_RE = /\{(start_of_chorus|start_of_verse|start_of_bridge|start_of_tab|start_of_grid|start_of_abc|start_of_ly|start_of_svg|soc|sov|sob|sot|sog)([^}]*)\}/i;
    const SECTION_END_RE   = /\{(end_of_chorus|end_of_verse|end_of_bridge|end_of_tab|end_of_grid|end_of_abc|end_of_ly|end_of_svg|eoc|eov|eob|eot|eog)\}/i;

    // Document Symbol Provider — Outline panel lists song title + all sections
    const symbolProvider = vscode.languages.registerDocumentSymbolProvider('chordpro', {
        provideDocumentSymbols(document) {
            const symbols = [];
            const lc = document.lineCount;

            // First pass: count per section type (to decide whether to number them)
            const typeCounts = {};
            for (let i = 0; i < lc; i++) {
                const m = document.lineAt(i).text.match(SECTION_START_RE);
                if (m) {
                    const key = SECTION_NAMES[m[1].toLowerCase()] || m[1];
                    typeCounts[key] = (typeCounts[key] || 0) + 1;
                }
            }

            // Second pass: build symbols
            const typeIndex = {}, stack = [];
            for (let i = 0; i < lc; i++) {
                const lineText = document.lineAt(i).text;
                const startM = lineText.match(SECTION_START_RE);
                if (startM) {
                    const directive = startM[1].toLowerCase();
                    const baseName  = SECTION_NAMES[directive] || directive;
                    // Extract optional label from e.g. {start_of_verse: Verse 2} or label="..."
                    const labelM = startM[2].match(/(?:label\s*=\s*["']?([^"'}\n]+)["']?|:\s*([^}\n]+))/i);
                    let label = labelM ? (labelM[1] || labelM[2]).trim() : null;
                    if (!label) {
                        typeIndex[baseName] = (typeIndex[baseName] || 0) + 1;
                        label = typeCounts[baseName] > 1
                            ? `${baseName} ${typeIndex[baseName]}`
                            : baseName;
                    }
                    stack.push({ label, startLine: i });
                    continue;
                }
                const endM = lineText.match(SECTION_END_RE);
                if (endM && stack.length > 0) {
                    const { label, startLine } = stack.pop();
                    const range    = new vscode.Range(startLine, 0, i, lineText.length);
                    const selRange = new vscode.Range(startLine, 0, startLine, document.lineAt(startLine).text.length);
                    symbols.push(new vscode.DocumentSymbol(label, '', vscode.SymbolKind.Module, range, selRange));
                }
            }

            // Prepend song title (scan first 20 lines)
            for (let i = 0; i < Math.min(lc, 20); i++) {
                const line = document.lineAt(i).text;
                const m = line.match(/\{(?:title|t):\s*([^}]+)\}/i);
                if (m) {
                    const range = new vscode.Range(i, 0, i, line.length);
                    symbols.unshift(new vscode.DocumentSymbol(`♪ ${m[1].trim()}`, '', vscode.SymbolKind.String, range, range));
                    break;
                }
            }
            return symbols;
        }
    });

    // Definition Provider — Ctrl+click [chord] → jump to its {define:} block
    const definitionProvider = vscode.languages.registerDefinitionProvider('chordpro', {
        provideDefinition(document, position) {
            const token = chordTokenAtPosition(document, position);
            if (!token) return null;
            const lines = document.getText().split('\n');
            const re = new RegExp(`\\{(?:define|chord):?\\s+${escapeRegex(token.name)}\\b`, 'i');
            for (let i = 0; i < lines.length; i++) {
                if (re.test(lines[i]))
                    return new vscode.Location(document.uri, new vscode.Position(i, lines[i].search(re)));
            }
            return null;
        }
    });

    // Rename Provider — rename a chord everywhere (all [tokens] + {define:} block)
    const renameProvider = vscode.languages.registerRenameProvider('chordpro', {
        prepareRename(document, position) {
            const token = chordTokenAtPosition(document, position);
            if (!token) throw new Error('Place cursor inside a [chord] token to rename');
            return { range: token.nameRange, placeholder: token.name };
        },
        provideRenameEdits(document, position, newName) {
            const token = chordTokenAtPosition(document, position);
            if (!token) return null;
            const edit = new vscode.WorkspaceEdit();
            const text = document.getText();

            // All [chordName] occurrences — replace only the name, keep brackets
            const chordRe = new RegExp(`\\[${escapeRegex(token.name)}\\]`, 'g');
            let m;
            while ((m = chordRe.exec(text)) !== null) {
                edit.replace(document.uri,
                    new vscode.Range(document.positionAt(m.index + 1),
                                     document.positionAt(m.index + 1 + token.name.length)),
                    newName);
            }
            // {define: chordName ...} — replace only the name
            const defineRe = new RegExp(`(\\{(?:define|chord):?\\s+)${escapeRegex(token.name)}(?=\\s)`, 'gi');
            while ((m = defineRe.exec(text)) !== null) {
                const ns = m.index + m[1].length;
                edit.replace(document.uri,
                    new vscode.Range(document.positionAt(ns),
                                     document.positionAt(ns + token.name.length)),
                    newName);
            }
            return edit;
        }
    });

    // Folding Range Provider — fold {start_of_X} … {end_of_X} blocks
    const foldingProvider = vscode.languages.registerFoldingRangeProvider('chordpro', {
        provideFoldingRanges(document) {
            const ranges = [], stack = [];
            for (let i = 0; i < document.lineCount; i++) {
                const line = document.lineAt(i).text;
                if (SECTION_START_RE.test(line))      stack.push(i);
                else if (SECTION_END_RE.test(line) && stack.length > 0)
                    ranges.push(new vscode.FoldingRange(stack.pop(), i));
            }
            return ranges;
        }
    });

    // ── Diagnostics ───────────────────────────────────────────────────────

    const diagnosticCollection = vscode.languages.createDiagnosticCollection('chordpro');

    function updateDiagnostics(document) {
        if (document.languageId !== 'chordpro') return;
        const diags = [];
        const lines = document.getText().split('\n');

        const docDefines = parseDocumentDefines(document);
        const savedNames = new Set(getAllSavedNames(context));

        const usedChords = new Set();

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // {chord: NAME} counts as usage even though it's not an inline [chord]
            const chordDirRe = /\{chord:\s+([^\s}]+)/gi;
            let cdm;
            while ((cdm = chordDirRe.exec(line)) !== null) usedChords.add(cdm[1]);

            if (/\{(?:define|chord):?\s/i.test(line)) continue; // skip define/chord-dir lines for inline scan

            const re = /\[([A-G][b#]?[^\]]*)\]/g;
            let m;
            while ((m = re.exec(line)) !== null) {
                const name = m[1];
                usedChords.add(name);
                if (!docDefines[name] && !savedNames.has(name) && !CHORD_DB[name]) {
                    diags.push(new vscode.Diagnostic(
                        new vscode.Range(i, m.index + 1, i, m.index + 1 + name.length),
                        `No fingering known for "${name}" — add a {define:} block or use the Chord Builder`,
                        vscode.DiagnosticSeverity.Information
                    ));
                }
            }
        }

        // Warn about {define:} blocks whose chord never appears as [chord]
        const defineLineRe = /\{(?:define|chord):?\s+(\S+)/gi;
        for (let i = 0; i < lines.length; i++) {
            defineLineRe.lastIndex = 0;
            let dm;
            while ((dm = defineLineRe.exec(lines[i])) !== null) {
                const name = dm[1];
                if (!usedChords.has(name)) {
                    const col = dm.index + dm[0].length - name.length;
                    diags.push(new vscode.Diagnostic(
                        new vscode.Range(i, col, i, col + name.length),
                        `"${name}" is defined but never used in the song`,
                        vscode.DiagnosticSeverity.Hint
                    ));
                }
            }
        }

        // Warn about {x_columns_off} with no {x_columns_on} anywhere in the file
        const colDirRe = /^\s*\{(x_columns_on|x_columns_off)\}\s*$/i;
        const hasColsOn = lines.some(l => colDirRe.test(l) && l.match(colDirRe)?.[1]?.toLowerCase() === 'x_columns_on');
        if (!hasColsOn) {
            for (let i = 0; i < lines.length; i++) {
                const m = colDirRe.exec(lines[i]);
                if (!m || m[1].toLowerCase() !== 'x_columns_off') continue;
                const col = lines[i].indexOf('{');
                diags.push(new vscode.Diagnostic(
                    new vscode.Range(i, col, i, lines[i].trimEnd().length),
                    '{x_columns_off} has no matching {x_columns_on} — columns will start implicitly from the beginning of the song',
                    vscode.DiagnosticSeverity.Warning
                ));
            }
        }

        diagnosticCollection.set(document.uri, diags);
    }

    // Auto-reload preview on save
    const onSaveScrollReload = vscode.workspace.onDidSaveTextDocument(doc => {
        if (!scrollPanel || doc.uri.toString() !== scrollDocUri) return;
        const source    = doc.getText();
        const chordSvgs = buildChordSvgMap(source, buildChordData(doc));
        scrollPanel.webview.postMessage({ command: 'reload', source, chordSvgs, preserveScroll: true });
    });

    let diagDebounce;
    const onOpenDiag   = vscode.workspace.onDidOpenTextDocument(doc => updateDiagnostics(doc));
    const onChangeDiag = vscode.workspace.onDidChangeTextDocument(e => {
        clearTimeout(diagDebounce);
        diagDebounce = setTimeout(() => updateDiagnostics(e.document), 500);
    });
    const onCloseDiag  = vscode.workspace.onDidCloseTextDocument(doc => diagnosticCollection.delete(doc.uri));
    vscode.workspace.textDocuments.forEach(doc => updateDiagnostics(doc));

    // ── Capo Helper ───────────────────────────────────────────────────────
    const capoHelper = vscode.commands.registerCommand('extension.capoHelper', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'chordpro') {
            vscode.window.showInformationMessage('Open a .cho file first.');
            return;
        }
        const text = editor.document.getText();
        const capoMatch = text.match(/\{capo:?\s*(\d+)\}/i);
        if (!capoMatch) {
            vscode.window.showInformationMessage('No {capo:} directive found in this file.');
            return;
        }
        const capo = parseInt(capoMatch[1]);
        const chordRe = /\[([A-G][b#]?[^\]]*)\]/g;
        const seen = new Set();
        let cm;
        while ((cm = chordRe.exec(text)) !== null) seen.add(cm[1]);
        const mappings = [...seen].sort().map(c => `${c} → ${transposeChordToken(c, capo)}`);
        vscode.window.showInformationMessage(`Capo ${capo} — concert pitch: ${mappings.join(', ')}`);
    });

    // ── Key Detection ─────────────────────────────────────────────────────────
    const detectKey = vscode.commands.registerCommand('extension.detectKey', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'chordpro') {
            vscode.window.showInformationMessage('Open a .cho file first.');
            return;
        }
        const text = editor.document.getText();
        const chordRe = /\[([A-G][b#]?[^\]]*)\]/g;
        const chords = [];
        let km;
        while ((km = chordRe.exec(text)) !== null) chords.push(km[1]);
        if (!chords.length) {
            vscode.window.showInformationMessage('No chords found in this file.');
            return;
        }
        const { major, minor } = detectKeyFromChords(chords);
        const label = minor ? `${major} major  /  ${minor}` : `${major} major`;
        const hasKey = /\{key:/i.test(text);
        if (!hasKey) {
            vscode.window.showInformationMessage(`Detected key: ${label}`, 'Insert {key:}').then(sel => {
                if (sel !== 'Insert {key:}') return;
                const lines = text.split(/\r?\n/);
                let insertLine = 0;
                for (let i = 0; i < lines.length; i++) {
                    if (/^\s*#/.test(lines[i]) || !lines[i].trim()) insertLine = i + 1;
                    else break;
                }
                const edit = new vscode.WorkspaceEdit();
                edit.insert(editor.document.uri, new vscode.Position(insertLine, 0), `{key: ${major}}\n`);
                vscode.workspace.applyEdit(edit);
            });
        } else {
            vscode.window.showInformationMessage(`Detected key: ${label}`);
        }
    });

    // ─────────────────────────────────────────────
    // Chord Reference Panel
    // ─────────────────────────────────────────────
    const chordRefProvider = new ChordReferenceViewProvider(context);
    const chordRefView = vscode.window.registerWebviewViewProvider('chordproChordReference', chordRefProvider);
    const onEditorChangeRef = vscode.window.onDidChangeActiveTextEditor(() => chordRefProvider.nudge());
    const onDocChangeRef = vscode.workspace.onDidChangeTextDocument(e => {
        if (vscode.window.activeTextEditor && e.document === vscode.window.activeTextEditor.document)
            chordRefProvider.nudge();
    });
    // One-time migration: move old chord_NAME keys → savedVoicings array
    migrateSavedChords(context);

    const onOpenTrack = vscode.workspace.onDidOpenTextDocument(doc =>
        trackChordUsage(doc, context, chordRefProvider)
    );
    const onSaveTrack = vscode.workspace.onDidSaveTextDocument(doc =>
        trackChordUsage(doc, context, chordRefProvider, true)
    );
    // Track already-open documents at activation — force update to backfill any missing frets
    vscode.workspace.textDocuments.forEach(doc => trackChordUsage(doc, context, chordRefProvider, true));
    // Async scan: read any tracked files not currently open to recover their frets
    backfillChordFileFrets(context, chordRefProvider);

    // Song Library Panel
    // ─────────────────────────────────────────────
    const songLibraryProvider = new SongLibraryProvider(context);
    const libraryTreeView = vscode.window.createTreeView('chordproLibraryView', {
        treeDataProvider: songLibraryProvider, showCollapseAll: false, canSelectMany: true
    });

    const setLibraryFolder = vscode.commands.registerCommand('chordpro.setLibraryFolder', async () => {
        const picked = await vscode.window.showOpenDialog({
            canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
            openLabel: 'Select Song Library Folder'
        });
        if (picked && picked[0]) {
            songLibraryProvider.setFolder(picked[0].fsPath);
            vscode.window.showInformationMessage('Song library: ' + picked[0].fsPath);
        }
    });

    const refreshLibrary = vscode.commands.registerCommand('chordpro.refreshLibrary', () => {
        songLibraryProvider.refresh();
    });

    const openLibrarySong = vscode.commands.registerCommand('chordpro.openSong', async (element) => {
        if (!element || !element.filePath) return;
        const doc = await vscode.workspace.openTextDocument(element.filePath);
        await vscode.window.showTextDocument(doc);
    });

    const previewLibrarySong = vscode.commands.registerCommand('chordpro.previewSongFromLibrary', (element) => {
        if (!element || !element.filePath) return;
        const source = fs.readFileSync(element.filePath, 'utf8');
        const chordSvgs = buildChordSvgMap(source, buildChordData({ getText: () => source, getWordRangeAtPosition: () => null }));
        const title = element.title || path.basename(element.filePath);
        const panel = vscode.window.createWebviewPanel(
            'chordproScrollPreview', title + ' — Preview',
            vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true }
        );
        panel.webview.html = getScrollWebviewContent(source, chordSvgs);
        panel.webview.onDidReceiveMessage(msg => {
            if (msg.command === 'saveHtml') {
                const outPath = element.filePath.replace(/\.[^.]+$/, '') + '_preview.html';
                const standalone = getScrollWebviewContent(source, buildChordSvgMap(source, buildChordData({ getText: () => source, getWordRangeAtPosition: () => null })))
                    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n?/, '')
                    .replace('const vscodeApi = acquireVsCodeApi();', 'const vscodeApi = { postMessage: function() {} };');
                fs.writeFileSync(outPath, standalone, 'utf8');
                vscode.window.showInformationMessage('Saved: ' + outPath);
            }
        });
    });

    const openSetlistPreview = vscode.commands.registerCommand('chordpro.openSetlistPreview', () => {
        const selected = libraryTreeView.selection.filter(s => !s.isPlaceholder);
        const songs = selected.length > 0 ? selected : songLibraryProvider.getSongs();
        if (!songs.length) { vscode.window.showErrorMessage('No songs in library. Set a folder first.'); return; }
        const sharedSvgs = buildSharedSvgMap();
        const songData = songs.map(s => ({
            title: s.title, artist: s.artist, source: s.source,
            customSvgs: buildCustomSvgMap(s.source)
        }));
        const panel = vscode.window.createWebviewPanel(
            'chordproSetlist', 'Setlist Preview',
            vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true }
        );
        panel.webview.html = getSetlistWebviewContent(songData, sharedSvgs);
        panel.webview.onDidReceiveMessage(msg => {
            if (msg.command === 'saveSetlistHtml') {
                const folder = songLibraryProvider.getFolder();
                const outPath = path.join(folder || require('os').homedir(), 'setlist_preview.html');
                const standalone = getSetlistWebviewContent(songData, sharedSvgs)
                    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n?/, '')
                    .replace('const vscodeApi = acquireVsCodeApi();', 'const vscodeApi = { postMessage: function() {} };');
                fs.writeFileSync(outPath, standalone, 'utf8');
                vscode.window.showInformationMessage('Setlist saved: ' + outPath);
            }
        });
    });

    // Add disposables to context.subscriptions
    context.subscriptions.push(
        renderOnly,
        previewChordPro,
        completionProvider,
        hoverProvider,
        chordHoverProvider,
        codeLensProvider,
        configureRendering,
        openChordProMinimalTemplate,
        openChordProExampleTemplate,
        openChordProTemplateCommand,
        onSaveDisposable,
        chordBuilderView,
        openBuilder,
        openInBuilder,
        insertTitle,
        insertChordInline,
        insertChordDiagram,
        openChordAnalyzer,
        autoScrollPreview,
        registerTabEditor(context),
        transposeChords,
        symbolProvider,
        definitionProvider,
        renameProvider,
        foldingProvider,
        diagnosticCollection,
        onSaveScrollReload,
        capoHelper,
        detectKey,
        onOpenDiag,
        onChangeDiag,
        onCloseDiag,
        chordRefView,
        onEditorChangeRef,
        onDocChangeRef,
        onOpenTrack,
        onSaveTrack,
        libraryTreeView,
        setLibraryFolder,
        refreshLibrary,
        openLibrarySong,
        previewLibrarySong,
        openSetlistPreview,
        createChordProConfig,
        registerChordProConfig,
        editChordProConfig,
        setUserConfigsFolder,
        registerGridEditor(context),
        wrapInSection,
        ...wrapSectionSubs
    );
}

// ─────────────────────────────────────────────
// Tab Editor (outside activate — pure webview HTML)
// ─────────────────────────────────────────────
function registerTabEditor(context) {
    return vscode.commands.registerCommand('extension.openTabEditor', () => {
        const targetEditor = vscode.window.activeTextEditor;
        const panel = vscode.window.createWebviewPanel(
            'chordproTabEditor',
            'Tab Editor',
            vscode.ViewColumn.Beside,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        panel.webview.html = getTabEditorContent();
        panel.webview.onDidReceiveMessage(msg => {
            if (msg.command === 'insertTab') {
                const editor = targetEditor || vscode.window.activeTextEditor;
                if (!editor) { vscode.window.showErrorMessage('No active editor'); return; }
                const text = '{start_of_tab}\n' + msg.tab + '\n{end_of_tab}';
                editor.insertSnippet(new vscode.SnippetString(text));
            }
        });
    });
}

function getTabEditorContent() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: #111118; color: #d4c5a0; font-family: sans-serif;
  padding: 12px; display: flex; flex-direction: column; height: 100vh; gap: 10px;
}
#toolbar { display: flex; gap: 6px; flex-wrap: wrap; flex-shrink: 0; }
.btn {
  padding: 4px 14px; background: #2a2a3a; border: 1px solid #4a4a6a;
  color: #d4c5a0; border-radius: 3px; cursor: pointer; font-size: 12px;
}
.btn:hover { background: #3a3a50; }
.btn-insert { background: #2a5a28; border-color: #4a8a38; color: #b8e890; }
.btn-insert:hover { background: #3a6a38; }

#grid-wrap { overflow-x: auto; flex-shrink: 0; }

table { border-collapse: collapse; }
.str-label {
  width: 18px; text-align: right; padding-right: 8px;
  font-size: 13px; color: #888; font-family: monospace;
  vertical-align: middle;
}
.open-bar, .close-bar {
  width: 6px; vertical-align: middle; position: relative;
}
.open-bar  { border-right: 2px solid #aaa; }
.close-bar { border-left:  2px solid #aaa; }
.open-bar::after, .close-bar::after {
  content: ''; position: absolute; top: 50%; left: 0; right: 0;
  height: 1.5px; background: #666;
}

.cell {
  width: 32px; min-width: 32px; height: 28px;
  text-align: center; vertical-align: middle;
  cursor: pointer; font-size: 13px; font-family: monospace;
  color: #ccc; position: relative; user-select: none;
}
.cell::after {
  content: ''; position: absolute;
  top: 50%; left: 0; right: 0; height: 1.5px;
  background: #555; z-index: 0;
}
.cell span {
  position: relative; z-index: 1;
  background: #111118; padding: 0 3px; min-width: 14px; display: inline-block;
}
.cell.selected span {
  background: #2255aa; color: #fff; border-radius: 2px; outline: 1px solid #4488ee;
}
.cell.has-value span { color: #e8e8b0; }

.bar-col {
  width: 12px; min-width: 12px; height: 28px;
  position: relative; vertical-align: middle; cursor: default;
}
.bar-col::after {
  content: ''; position: absolute;
  top: 50%; left: 0; right: 0; height: 1.5px; background: #555; z-index: 0;
}
.bar-col::before {
  content: ''; position: absolute;
  top: 0; bottom: 0; left: 50%;
  width: 2px; background: #aaa; z-index: 1; transform: translateX(-50%);
}

#preview-wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 4px; }
#preview-label { font-size: 11px; color: #666; }
#preview {
  font-family: 'Courier New', monospace; font-size: 13px;
  background: #1a1a28; padding: 10px 14px; border-radius: 4px;
  border: 1px solid #2a2a45; color: #99aacc; white-space: pre;
  overflow: auto; flex: 1;
}
</style>
</head>
<body>
<div id="toolbar">
  <button class="btn" id="btn-col">+ Column</button>
  <button class="btn" id="btn-bar">| Bar</button>
  <button class="btn" id="btn-del">Delete last</button>
  <button class="btn" id="btn-clear">Clear</button>
  <button class="btn btn-insert" id="btn-insert">Insert tab</button>
</div>
<div id="grid-wrap"><table id="grid"></table></div>
<div id="preview-wrap">
  <div id="preview-label">Preview</div>
  <div id="preview"></div>
</div>
<script>
const vscode = acquireVsCodeApi();
const STRINGS = ['e','B','G','D','A','E'];
const NS = 6;

let cols = [];    // { type: 'notes', values: string[NS] } | { type: 'bar' }
let selC = -1, selS = -1, inputBuf = '';
let tabUndoStack = [];
let tabRedoStack = [];
function tabPushUndo() { tabUndoStack.push(JSON.parse(JSON.stringify(cols))); if (tabUndoStack.length > 50) tabUndoStack.shift(); tabRedoStack = []; }

// Start with 8 columns, bar, 8 columns
for (let i = 0; i < 8; i++) addNote();
addBar();
for (let i = 0; i < 8; i++) addNote();

function addNote() { cols.push({ type: 'notes', values: Array(NS).fill('') }); }
function addBar()  { cols.push({ type: 'bar' }); }

function colWidth(c) {
  if (cols[c].type === 'bar') return 0;
  return Math.max(1, ...cols[c].values.map(v => v.length));
}

function generateTab() {
  return STRINGS.map((name, s) => {
    let line = name + '|';
    for (let c = 0; c < cols.length; c++) {
      if (cols[c].type === 'bar') {
        line += '|';
      } else {
        const w = colWidth(c);
        const v = cols[c].values[s];
        line += '--' + (v ? v.padEnd(w, '-') : '-'.repeat(w));
      }
    }
    return line + '--|';
  }).join('\\n');
}

function render() {
  const rows = STRINGS.map((name, s) => {
    let row = '<tr><td class="str-label">' + name + '</td><td class="open-bar"></td>';
    for (let c = 0; c < cols.length; c++) {
      if (cols[c].type === 'bar') {
        row += '<td class="bar-col"></td>';
      } else {
        const v = cols[c].values[s];
        const isSel = (c === selC && s === selS);
        const display = isSel && inputBuf ? inputBuf : v;
        const cls = 'cell' + (isSel ? ' selected' : '') + (v && !isSel ? ' has-value' : '');
        row += '<td class="' + cls + '" data-c="' + c + '" data-s="' + s + '">'
             + '<span>' + (display || '') + '</span></td>';
      }
    }
    row += '<td class="close-bar"></td></tr>';
    return row;
  });
  document.getElementById('grid').innerHTML = rows.join('');
  document.getElementById('preview').textContent = generateTab();
}

function commit() {
  if (selC >= 0 && selS >= 0 && cols[selC] && cols[selC].type === 'notes' && inputBuf) {
    cols[selC].values[selS] = inputBuf;
  }
  inputBuf = '';
}

function moveSel(dc, ds) {
  commit();
  let c = selC + dc, s = selStr_clamped(selS + ds);
  if (dc !== 0) {
    const dir = dc > 0 ? 1 : -1;
    while (c >= 0 && c < cols.length && cols[c].type === 'bar') c += dir;
  }
  c = Math.max(0, Math.min(cols.length - 1, c));
  if (cols[c] && cols[c].type === 'notes') { selC = c; selS = s; }
  render();
}

function selStr_clamped(s) { return Math.max(0, Math.min(NS - 1, s)); }

document.getElementById('grid').addEventListener('click', e => {
  const td = e.target.closest('td[data-c]');
  if (!td) return;
  const c = +td.dataset.c, s = +td.dataset.s;
  commit();
  selC = c; selS = s; inputBuf = '';
  render();
});

document.addEventListener('keydown', e => {
  if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
    if (tabUndoStack.length) { tabRedoStack.push(JSON.parse(JSON.stringify(cols))); cols = tabUndoStack.pop(); selC = -1; selS = -1; inputBuf = ''; render(); }
    e.preventDefault(); return;
  }
  if (e.ctrlKey && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
    if (tabRedoStack.length) { tabUndoStack.push(JSON.parse(JSON.stringify(cols))); cols = tabRedoStack.pop(); selC = -1; selS = -1; inputBuf = ''; render(); }
    e.preventDefault(); return;
  }
  if (selC < 0) return;
  if (e.key >= '0' && e.key <= '9') {
    if (!inputBuf) tabPushUndo();
    const next = inputBuf + e.key;
    inputBuf = (+next <= 24 && next.length <= 2) ? next : e.key;
    render(); e.preventDefault();
  } else if (e.key === 'Backspace') {
    tabPushUndo();
    inputBuf = '';
    if (cols[selC]) cols[selC].values[selS] = '';
    render(); e.preventDefault();
  } else if (e.key === 'ArrowRight' || e.key === 'Tab') {
    moveSel(1, 0); e.preventDefault();
  } else if (e.key === 'ArrowLeft') {
    moveSel(-1, 0); e.preventDefault();
  } else if (e.key === 'ArrowUp') {
    moveSel(0, -1); e.preventDefault();
  } else if (e.key === 'ArrowDown') {
    moveSel(0, 1); e.preventDefault();
  } else if (e.key === 'Enter') {
    commit(); moveSel(1, 0); e.preventDefault();
  } else if (e.key === 'Escape') {
    commit(); selC = -1; selS = -1; render();
  }
});

document.getElementById('btn-col').addEventListener('click', () => {
  tabPushUndo(); commit();
  if (selC >= 0) cols.splice(selC + 1, 0, { type: 'notes', values: Array(NS).fill('') });
  else addNote();
  selC = -1; selS = -1; render();
});
document.getElementById('btn-bar').addEventListener('click',    () => {
  tabPushUndo(); commit();
  if (selC >= 0) cols.splice(selC + 1, 0, { type: 'bar' });
  else addBar();
  selC = -1; selS = -1; render();
});
document.getElementById('btn-del').addEventListener('click',    () => {
  if (!cols.length) return;
  tabPushUndo();
  if (selC === cols.length - 1) { selC = -1; selS = -1; }
  cols.pop(); render();
});
document.getElementById('btn-clear').addEventListener('click',  () => {
  tabPushUndo();
  cols.forEach(col => { if (col.type === 'notes') col.values = Array(NS).fill(''); });
  selC = -1; selS = -1; inputBuf = ''; render();
});
document.getElementById('btn-insert').addEventListener('click', () => {
  commit(); render();
  vscode.postMessage({ command: 'insertTab', tab: generateTab() });
});

render();
</script>
</body>
</html>`;
}


// ─────────────────────────────────────────────
// Grid Editor
// ─────────────────────────────────────────────
function registerGridEditor(context) {
    return vscode.commands.registerCommand('extension.openGridEditor', () => {
        const targetEditor = vscode.window.activeTextEditor;
        const songChords = [];
        if (targetEditor) {
            const text = targetEditor.document.getText();
            const seen = new Set();
            const addChord = ch => { ch = ch.trim(); if (ch && !seen.has(ch)) { seen.add(ch); songChords.push(ch); } };
            let m;
            const reDefine = /\{define:\s*([A-G][^\s}]*)/gi;
            while ((m = reDefine.exec(text)) !== null) addChord(m[1]);
            const reInline = /\[([A-G][^\[\]]*)\]/g;
            while ((m = reInline.exec(text)) !== null) addChord(m[1]);
        }
        const panel = vscode.window.createWebviewPanel(
            'chordproGridEditor',
            'Grid Editor',
            vscode.ViewColumn.Beside,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        panel.webview.html = getGridEditorContent(songChords);
        panel.webview.onDidReceiveMessage(msg => {
            if (msg.command === 'insertGrid') {
                const editor = targetEditor || vscode.window.activeTextEditor;
                if (!editor) { vscode.window.showErrorMessage('No active editor'); return; }
                const text = '{start_of_grid}\n' + msg.grid + '\n{end_of_grid}';
                editor.insertSnippet(new vscode.SnippetString(text));
            }
        });
    });
}

function getGridEditorContent(songChords) {
    const chordsJson = JSON.stringify(songChords);
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: #111118; color: #d4c5a0; font-family: sans-serif;
  padding: 12px; display: flex; flex-direction: column; height: 100vh; gap: 10px;
}
#toolbar { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; flex-shrink: 0; }
.btn {
  padding: 4px 14px; background: #2a2a3a; border: 1px solid #4a4a6a;
  color: #d4c5a0; border-radius: 3px; cursor: pointer; font-size: 12px;
}
.btn:hover { background: #3a3a50; }
.btn-insert { background: #2a5a28; border-color: #4a8a38; color: #b8e890; }
.btn-insert:hover { background: #3a6a38; }
.tsep { color: #444; font-size: 14px; }
label { font-size: 12px; color: #999; }
select {
  background: #2a2a3a; border: 1px solid #4a4a6a; color: #d4c5a0;
  border-radius: 3px; padding: 3px 6px; font-size: 12px; cursor: pointer;
}
#grid-wrap { overflow-x: auto; flex-shrink: 0; }
table { border-collapse: collapse; }
td { padding: 1px 1px; vertical-align: middle; }
.row-marker, .row-end {
  font-family: monospace; font-size: 15px; font-weight: bold; color: #777;
  white-space: nowrap; padding: 0 5px;
}
.bar-sep { width: 6px; }
.bar-sep-inner { width: 2px; height: 28px; background: #555; margin: 0 auto; }
.beat-gap { width: 3px; }
.beat-input {
  width: 54px; background: #1a1a28; border: 1px solid #2e2e44;
  color: #e8e8b0; border-radius: 2px; padding: 4px 4px;
  font-family: monospace; font-size: 13px; text-align: center; outline: none;
}
.beat-input.secondary {
  background: #141420; border-color: #22223a; color: #888870; width: 44px;
}
.beat-input::placeholder { color: #333350; font-size: 11px; }
.beat-input.secondary::placeholder { color: #252535; }
.beat-input:focus { border-color: #4488ee; background: #1c2238; color: #fff; }
.beat-input.secondary:focus { border-color: #2255aa; background: #161e2e; color: #ccddff; }
#palette-section { flex-shrink: 0; }
#palette-label { font-size: 11px; color: #555; margin-bottom: 5px; }
#chord-buttons { display: flex; flex-wrap: wrap; gap: 4px; }
.chord-btn {
  padding: 3px 11px; background: #222232; border: 1px solid #3a3a5a;
  color: #b8b0d0; border-radius: 3px; cursor: pointer;
  font-size: 12px; font-family: monospace;
}
.chord-btn:hover { background: #2e2e50; border-color: #6060a0; color: #e0d8ff; }
#preview-wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 4px; }
#preview-label { font-size: 11px; color: #555; }
#preview {
  font-family: 'Courier New', monospace; font-size: 13px;
  background: #1a1a28; padding: 10px 14px; border-radius: 4px;
  border: 1px solid #2a2a45; color: #99aacc; white-space: pre;
  overflow: auto; flex: 1;
}
</style>
</head>
<body>
<div id="toolbar">
  <button class="btn" id="btn-add-line">+ Line</button>
  <button class="btn" id="btn-add-bar">+ Bar</button>
  <button class="btn" id="btn-del-line">&#8722; Last line</button>
  <button class="btn" id="btn-del-bar">&#8722; Last bar</button>
  <button class="btn" id="btn-clear">Clear</button>
  <span class="tsep">|</span>
  <label>Time&nbsp;<select id="beats-sel">
    <option value="4" selected>4/4</option>
    <option value="3">3/4</option>
    <option value="2">2/4</option>
  </select></label>
  <span class="tsep">|</span>
  <button class="btn btn-insert" id="btn-insert">Insert grid</button>
</div>
<div id="grid-wrap"><table id="grid"><tbody></tbody></table></div>
<div id="palette-section">
  <div id="palette-label">Song chords &#8212; click to fill selected cell and advance</div>
  <div id="chord-buttons"></div>
</div>
<div id="preview-wrap">
  <div id="preview-label">Preview</div>
  <div id="preview"></div>
</div>
<script>
var vscode = acquireVsCodeApi();
var SONG_CHORDS = ${chordsJson};

// rows[ri][bi][ki] = chord string; empty string = dot in output
var beats = 4;
var numBars = 4;
var rows = [];
var lastFocused = null; // { r, b, k }

function makeBar()  { return new Array(beats).fill(''); }
function makeLine() { var l = []; for (var i = 0; i < numBars; i++) l.push(makeBar()); return l; }

rows.push(makeLine());
rows.push(makeLine());

function generateGrid() {
  var colW = [];
  for (var bi = 0; bi < numBars; bi++) {
    colW[bi] = [];
    for (var ki = 0; ki < beats; ki++) {
      var mx = 1;
      rows.forEach(function(row) { var v = row[bi][ki] || '.'; if (v.length > mx) mx = v.length; });
      colW[bi][ki] = mx;
    }
  }
  return rows.map(function(row, ri) {
    var isFirst = ri === 0, isLast = ri === rows.length - 1;
    var parts = [];
    for (var bi = 0; bi < numBars; bi++) {
      var bp = [];
      for (var ki = 0; ki < beats; ki++) {
        bp.push((row[bi][ki] || '.').padEnd(colW[bi][ki]));
      }
      parts.push(bp.join(' '));
    }
    return (isFirst ? '|| ' : '|  ') + parts.join(' | ').trimEnd() + (isLast ? ' ||' : ' |');
  }).join('\\n');
}

function escAttr(s) { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

function render() {
  var html = '';
  rows.forEach(function(row, ri) {
    var isFirst = ri === 0, isLast = ri === rows.length - 1;
    html += '<tr>';
    html += '<td class="row-marker">' + (isFirst ? '||' : '|') + '</td>';
    for (var bi = 0; bi < numBars; bi++) {
      if (bi > 0) html += '<td class="bar-sep"><div class="bar-sep-inner"></div></td>';
      for (var ki = 0; ki < beats; ki++) {
        if (ki > 0) html += '<td class="beat-gap"></td>';
        var v = row[bi][ki];
        var cls = 'beat-input' + (ki > 0 ? ' secondary' : '');
        var ph  = ki === 0 ? 'chord' : '\u00b7';
        html += '<td><input class="' + cls + '" data-r="' + ri + '" data-b="' + bi + '" data-k="' + ki
              + '" value="' + escAttr(v) + '" placeholder="' + ph + '"></td>';
      }
    }
    html += '<td class="row-end">' + (isLast ? '||' : '|') + '</td>';
    html += '</tr>';
  });
  document.querySelector('#grid tbody').innerHTML = html;
  document.querySelectorAll('.beat-input').forEach(function(inp) {
    inp.addEventListener('input', function() {
      rows[+inp.dataset.r][+inp.dataset.b][+inp.dataset.k] = inp.value;
      updatePreview();
    });
    inp.addEventListener('focus', function() {
      lastFocused = { r: +inp.dataset.r, b: +inp.dataset.b, k: +inp.dataset.k };
    });
    inp.addEventListener('keydown', navHandler);
  });
  updatePreview();
}

function navHandler(e) {
  var inp = e.target;
  var r = +inp.dataset.r, b = +inp.dataset.b, k = +inp.dataset.k;
  if (e.key === 'Tab' && e.shiftKey) {
    e.preventDefault(); advance(r, b, k, -1);
  } else if (e.key === 'Tab' || e.key === 'Enter') {
    e.preventDefault(); advance(r, b, k, 1);
  } else if (e.key === 'ArrowRight' && inp.selectionStart === inp.value.length) {
    e.preventDefault(); advance(r, b, k, 1);
  } else if (e.key === 'ArrowLeft' && inp.selectionStart === 0) {
    e.preventDefault(); advance(r, b, k, -1);
  } else if (e.key === 'ArrowDown' && r + 1 < rows.length) {
    e.preventDefault(); focusCell(r + 1, b, k);
  } else if (e.key === 'ArrowUp' && r > 0) {
    e.preventDefault(); focusCell(r - 1, b, k);
  }
}

function advance(r, b, k, dir) {
  k += dir;
  if (k >= beats)  { k = 0; b++; }
  if (k < 0)       { k = beats - 1; b--; }
  if (b >= numBars){ b = 0; r++; }
  if (b < 0)       { b = numBars - 1; r--; }
  r = Math.max(0, Math.min(rows.length - 1, r));
  b = Math.max(0, Math.min(numBars - 1, b));
  focusCell(r, b, k);
}

function focusCell(r, b, k) {
  var inp = document.querySelector('.beat-input[data-r="'+r+'"][data-b="'+b+'"][data-k="'+k+'"]');
  if (inp) { lastFocused = { r: r, b: b, k: k }; inp.focus(); inp.select(); }
}

function updatePreview() {
  document.getElementById('preview').textContent =
    '{start_of_grid}\\n' + generateGrid() + '\\n{end_of_grid}';
}

document.getElementById('btn-add-line').addEventListener('click', function() {
  rows.push(makeLine()); var pf = lastFocused; render();
  if (pf) focusCell(pf.r, pf.b, pf.k);
});
document.getElementById('btn-del-line').addEventListener('click', function() {
  if (rows.length > 1) { rows.pop(); render(); }
});
document.getElementById('btn-add-bar').addEventListener('click', function() {
  rows.forEach(function(row) { row.push(makeBar()); }); numBars++;
  var pf = lastFocused; render();
  if (pf) focusCell(pf.r, pf.b, pf.k);
});
document.getElementById('btn-del-bar').addEventListener('click', function() {
  if (numBars > 1) { rows.forEach(function(row) { row.pop(); }); numBars--; render(); }
});
document.getElementById('btn-clear').addEventListener('click', function() {
  rows.forEach(function(row) { row.forEach(function(bar) { for (var k=0;k<bar.length;k++) bar[k]=''; }); });
  render();
});
document.getElementById('beats-sel').addEventListener('change', function() {
  var nb = +this.value;
  rows.forEach(function(row) { row.forEach(function(bar) {
    while (bar.length < nb) bar.push('');
    bar.length = nb;
  }); });
  beats = nb; render();
});
document.getElementById('btn-insert').addEventListener('click', function() {
  vscode.postMessage({ command: 'insertGrid', grid: generateGrid() });
});

var paletteDiv = document.getElementById('chord-buttons');
if (SONG_CHORDS.length) {
  SONG_CHORDS.forEach(function(ch) {
    var btn = document.createElement('button');
    btn.className = 'chord-btn';
    btn.textContent = ch;
    btn.addEventListener('mousedown', function(e) { e.preventDefault(); });
    btn.addEventListener('click', function() {
      if (!lastFocused) return;
      var r = lastFocused.r, b = lastFocused.b, k = lastFocused.k;
      rows[r][b][k] = ch;
      var inp = document.querySelector('.beat-input[data-r="'+r+'"][data-b="'+b+'"][data-k="'+k+'"]');
      if (inp) inp.value = ch;
      updatePreview();
      advance(r, b, k, 1);
    });
    paletteDiv.appendChild(btn);
  });
} else {
  paletteDiv.innerHTML = '<span style="color:#444;font-size:11px">No chords found in document</span>';
}

render();
</script>
</body>
</html>`;
}



function deactivate() {}

module.exports = {
    activate,
    deactivate
};
