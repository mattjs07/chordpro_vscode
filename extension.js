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
    const PL = 10, PR = 16, PT = 22, PB = 8;
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

    // Detect barre: ≥ 4 strings on the same lowest fret
    const fretCounts = {};
    frets.forEach(f => { if (f > 0) fretCounts[f] = (fretCounts[f] || 0) + 1; });
    const barreFret = Number(Object.keys(fretCounts).find(f => fretCounts[f] >= 4 && Number(f) === minFret) || 0);

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
        parts.push(`<text x="${sx(NS-1)+5}" y="${fy(1)+3}" font-size="9" fill="#555" font-family="sans-serif">${startFret}fr</text>`);
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
        .slice(0, 6);
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
    return `{define: ${chord.name} base-fret ${baseFret} frets ${values.join(' ')}}`;
}

class ChordBuilderViewProvider {
    constructor(context) {
        this.context = context;
    }

    resolveWebviewView(webviewView) {
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = getWebviewContent();

        webviewView.webview.onDidReceiveMessage(message => {
            if (message.command === 'saveChord') {
                const chord = message.chord;
                this.context.globalState.update(`chord_${chord.name}`, chord);

                const define = toChordProDefine(chord);
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    editor.insertSnippet(new vscode.SnippetString(define + '\n'));
                } else {
                    vscode.env.clipboard.writeText(define);
                    vscode.window.showInformationMessage('No active editor — definition copied to clipboard');
                }
            }

            if (message.command === 'detectChord') {
                const suggestions = detectChord(message.frets);
                webviewView.webview.postMessage({ command: 'chordSuggestions', suggestions });
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
body { margin: 0; padding: 6px; background: #1a1a0a; color: #d4c5a0; font-family: sans-serif; overflow: hidden; }
#top { display: flex; gap: 6px; margin-bottom: 8px; align-items: center; }
#chordName { flex: 1; padding: 3px 6px; font-size: 13px; background: #2a2a1a; border: 1px solid #5a4a28; color: #d4c5a0; border-radius: 3px; outline: none; }
#saveBtn  { padding: 3px 12px; font-size: 13px; cursor: pointer; background: #3a5a28; border: 1px solid #5a8a38; color: #d4e8b0; border-radius: 3px; }
#resetBtn { padding: 3px 8px;  font-size: 13px; cursor: pointer; background: #2a1a1a; border: 1px solid #6a3030; color: #c08080; border-radius: 3px; }
#fretboard { display: inline-flex; flex-direction: column; position: relative; background: #1c1a0c; }
.string-row { display: flex; align-items: center; height: 26px; position: relative; }
.string-line { position: absolute; right: 0; top: 50%; transform: translateY(-50%); pointer-events: none; z-index: 2; }
.string-indicator { width: 24px; height: 24px; flex-shrink: 0; margin-right: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 12px; font-weight: bold; border-radius: 50%; border: 2px solid; user-select: none; z-index: 4; position: relative; }
.string-indicator.muted  { color: #e04040; border-color: #e04040; }
.string-indicator.open   { color: #d4c5a0; border-color: #8a7a50; }
.string-indicator.played { color: #3a3a3a; border-color: #3a3a3a; }
.fret-cell { width: 40px; height: 26px; flex-shrink: 0; border-right: 1px solid #6a5530; background: transparent; display: flex; align-items: center; justify-content: center; cursor: pointer; position: relative; z-index: 3; }
.fret-cell.nut { border-left: 4px solid #a08840; }
.string-row:first-child .fret-cell { border-top: 1px solid #2a2010; }
.string-row:last-child  .fret-cell { border-bottom: 1px solid #2a2010; }
.finger-dot { width: 18px; height: 18px; border-radius: 50%; background: #e8c840; display: none; position: absolute; z-index: 5; box-shadow: 0 1px 4px rgba(0,0,0,0.8); pointer-events: none; }
.fret-cell.selected .finger-dot { display: block; }
#fret-numbers { display: flex; padding-left: 28px; margin-top: 2px; }
.fret-num { width: 40px; text-align: center; font-size: 10px; color: #6a5830; flex-shrink: 0; }
#suggestions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; min-height: 22px; align-items: center; }
#suggestions span { font-size: 11px; color: #8a8068; }
.suggestion { padding: 2px 8px; font-size: 12px; cursor: pointer; background: #2a2a1a; border: 1px solid #5a4a28; color: #d4c5a0; border-radius: 3px; user-select: none; }
.suggestion:hover { background: #3a3a2a; border-color: #8a7a50; }
</style>
</head>
<body>
<div id="top">
  <input id="chordName" placeholder="Chord Name" />
  <button id="saveBtn">Insert definition</button>
  <button id="resetBtn">Reset</button>
</div>
<div id="fretboard"></div>
<div id="fret-numbers"></div>
<div id="suggestions"><span>play some strings...</span></div>
<script>
const vscode = acquireVsCodeApi();
const NUM_STRINGS = 6, NUM_FRETS = 15, ROW_H = 26, FRET_W = 40, INDICATOR_W = 28;
const STRING_THICKNESS = [1.0, 1.3, 1.7, 2.2, 2.8, 3.5];
const STRING_COLOR = ['#786828','#887838','#988848','#a89858','#b8a86a','#c8b87a'];
let fretsArray = Array(NUM_STRINGS).fill(-1);
const fretboardDiv = document.getElementById('fretboard');
const fretNumbersDiv = document.getElementById('fret-numbers');

for (let s = 0; s < NUM_STRINGS; s++) {
    const row = document.createElement('div');
    row.className = 'string-row';
    const indicator = document.createElement('div');
    indicator.className = 'string-indicator muted';
    indicator.innerText = 'X';
    indicator.addEventListener('click', () => { fretsArray[s] = (fretsArray[s] === 0) ? -1 : 0; updateDisplay(); });
    row.appendChild(indicator);
    for (let f = 1; f <= NUM_FRETS; f++) {
        const cell = document.createElement('div');
        cell.className = 'fret-cell' + (f === 1 ? ' nut' : '');
        const dot = document.createElement('div');
        dot.className = 'finger-dot';
        cell.appendChild(dot);
        cell.addEventListener('click', () => { fretsArray[s] = (fretsArray[s] === f) ? -1 : f; updateDisplay(); });
        row.appendChild(cell);
    }
    const sl = document.createElement('div');
    sl.className = 'string-line';
    sl.style.left = INDICATOR_W + 'px';
    sl.style.height = STRING_THICKNESS[s] + 'px';
    sl.style.background = STRING_COLOR[s];
    row.appendChild(sl);
    fretboardDiv.appendChild(row);
}

const overlay = document.createElement('div');
overlay.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:1;';
function mkMarker(x, y) {
    const m = document.createElement('div');
    m.style.cssText = \`position:absolute;width:7px;height:7px;border-radius:50%;background:#4a3818;left:\${x}px;top:\${y}px;transform:translate(-50%,-50%);\`;
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

function updateDisplay() {
    const rows = fretboardDiv.children;
    for (let s = 0; s < NUM_STRINGS; s++) {
        const row = rows[s], indic = row.children[0], val = fretsArray[s];
        if (val === -1)     { indic.className = 'string-indicator muted';  indic.innerText = 'X'; }
        else if (val === 0) { indic.className = 'string-indicator open';   indic.innerText = 'O'; }
        else                { indic.className = 'string-indicator played';  indic.innerText = ''; }
        for (let f = 1; f <= NUM_FRETS; f++) { row.children[f].classList.toggle('selected', val === f); }
    }
    vscode.postMessage({ command: 'detectChord', frets: [...fretsArray] });
}

window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.command !== 'chordSuggestions') { return; }
    const div = document.getElementById('suggestions');
    div.innerHTML = '';
    if (!msg.suggestions.length) { div.innerHTML = '<span>no chord found</span>'; return; }
    msg.suggestions.forEach(name => {
        const btn = document.createElement('div');
        btn.className = 'suggestion';
        btn.innerText = name;
        btn.addEventListener('click', () => { document.getElementById('chordName').value = name; });
        div.appendChild(btn);
    });
});

function doInsert() {
    const name = document.getElementById('chordName').value.trim();
    if (!name) { alert('Enter chord name'); return; }
    vscode.postMessage({ command: 'saveChord', chord: { name, frets: [...fretsArray] } });
}
document.getElementById('saveBtn').addEventListener('click', doInsert);
document.getElementById('chordName').addEventListener('keydown', e => { if (e.key === 'Enter') { doInsert(); } });
document.getElementById('resetBtn').addEventListener('click', () => {
    fretsArray = Array(NUM_STRINGS).fill(-1);
    document.getElementById('chordName').value = '';
    updateDisplay();
    document.getElementById('suggestions').innerHTML = '<span>play some strings...</span>';
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

    const insertChord = vscode.commands.registerCommand('chordproFretboard.insertChord', async () => {
        const editor = vscode.window.activeTextEditor;
        const docDefineNames = editor ? Object.keys(parseDocumentDefines(editor.document)) : [];
        const savedNames = context.globalState.keys()
            .filter(k => k.startsWith('chord_'))
            .map(k => k.slice('chord_'.length));
        const allNames = [...new Set([...docDefineNames, ...savedNames])];

        const chordName = await vscode.window.showInputBox({
            prompt: 'Enter chord name',
            placeHolder: allNames.length ? allNames.join(', ') : undefined
        });
        if (!chordName) { return; }
        if (editor) { editor.insertSnippet(new vscode.SnippetString(`[${chordName}]`)); }
    });

    const insertChordFromList = vscode.commands.registerCommand('chordproFretboard.insertChordFromList', async () => {
        const editor = vscode.window.activeTextEditor;
        const docDefineNames = editor ? Object.keys(parseDocumentDefines(editor.document)) : [];
        const savedKeys = context.globalState.keys().filter(k => k.startsWith('chord_'));
        const savedNames = savedKeys.map(k => k.slice('chord_'.length));
        const allNames = [...new Set([...docDefineNames, ...savedNames])];
        if (!allNames.length) { vscode.window.showInformationMessage('No chords defined yet'); return; }
        const items = allNames.map(name => ({
            label: name,
            description: docDefineNames.includes(name) ? 'defined in file' : 'saved chord'
        }));
        const selection = await vscode.window.showQuickPick(items, { placeHolder: 'Select a chord' });
        if (!selection) { return; }
        if (editor) { editor.insertSnippet(new vscode.SnippetString(`[${selection.label}]`)); }
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

                // Render option completions: inside {…} on a comment line
                if (isCommentLine && braceStart !== -1 && !linePrefix.includes('}', braceStart)) {
                    const replaceRange = new vscode.Range(position.line, braceStart + 1, position.line, position.character);
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
                    const replaceRange = new vscode.Range(position.line, braceStart + 1, position.line, position.character);
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
                    const replaceRange = new vscode.Range(position.line, bracketStart + 1, position.line, position.character);

                    const savedChordNames = context.globalState.keys()
                        .filter(k => k.startsWith('chord_'))
                        .map(k => k.slice('chord_'.length));

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
        for (const key of context.globalState.keys()) {
            if (key.startsWith('chord_')) {
                const chord = context.globalState.get(key);
                if (chord && chord.frets)
                    data[key.slice('chord_'.length)] = [...chord.frets].reverse();
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
            scrollPanel.reveal(vscode.ViewColumn.Beside);
            scrollPanel.webview.postMessage({ command: 'reload', source, chordSvgs });
            return;
        }

        scrollDocUri = editor.document.uri.toString();
        scrollPanel  = vscode.window.createWebviewPanel(
            'chordproScrollPreview',
            title + ' — Preview',
            vscode.ViewColumn.Beside,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        scrollPanel.webview.html = getScrollWebviewContent(source, chordSvgs);
        scrollPanel.webview.onDidReceiveMessage(msg => {
            if (msg.command === 'saveHtml') {
                const srcPath = editor.document.uri.fsPath;
                const outPath = srcPath.replace(/\.[^.]+$/, '') + '_preview.html';
                // Strip VSCode CSP and replace acquireVsCodeApi with a no-op for browser use
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
            }
        });
        scrollPanel.onDidDispose(() => { scrollPanel = null; scrollDocUri = null; });
    });

    function getScrollWebviewContent(source, chordSvgs) {
        const safeSource = JSON.stringify(source);
        const safeChordSvgs = JSON.stringify(chordSvgs || {});
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
  --tab-bg: #f4f4f0; --tab-border: #bbb;
  --tip-bg: #fff; --tip-border: #ccc; --tip-fg: #333;
  --capo-bg: #ffe8b0; --capo-fg: #7a4000;
}
@media (prefers-color-scheme: dark) {
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
  }
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: Georgia, serif; font-size: 17px; line-height: 1.6;
  background: var(--bg); color: var(--fg);
  padding: 40px clamp(16px, 6vw, 56px) 160px; max-width: 860px; margin: 0 auto;
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
.section     { margin-bottom: 22px; }
.section-label {
  display: inline-block; font-size: 0.75em; font-weight: bold;
  text-transform: uppercase; letter-spacing: 1px;
  padding: 2px 10px; border-radius: 3px; margin-bottom: 6px;
}
.section-chorus  .section-label { background: var(--sec-chorus-bg); color: var(--sec-chorus-fg); }
.section-verse   .section-label { background: var(--sec-verse-bg);  color: var(--sec-verse-fg); }
.section-bridge  .section-label { background: var(--sec-bridge-bg); color: var(--sec-bridge-fg); }
.section-tab     .section-label { background: var(--sec-tab-bg);    color: var(--sec-tab-fg); }
.chord-line  { display: flex; flex-wrap: wrap; line-height: 1; margin-bottom: 4px; }
.pair        { display: inline-flex; flex-direction: column; align-items: flex-start; }
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
.grid-block .chord { color: var(--chord); font-weight: bold; cursor: pointer; }
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
  display: flex; align-items: center; gap: 8px;
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
#save-btn    { font-size: 14px; opacity: 0.7; }
#save-btn:hover { opacity: 1; }
#tempo-btn   { font-size: 15px; opacity: 0.7; }
#tempo-btn:hover { opacity: 1; }
#tempo-btn.active { opacity: 1; color: #ffd700; border-color: #ffd700; }
#metro-btn   { font-size: 15px; opacity: 0.7; }
#metro-btn:hover { opacity: 1; }
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
}
/* ── Two-column layout ────────────────────────────────────────────────────── */
#song.two-col { column-count: 2; column-gap: 3em; column-rule: 1px solid var(--border); }
#song.two-col .section { break-inside: avoid-column; }
#song.two-col .song-header { column-span: all; }
/* ── Additional button styles ────────────────────────────────────────────── */
#theme-btn  { font-size: 14px; }
#twocol-btn { font-size: 14px; }
#twocol-btn.active { color: #ffd700; border-color: #ffd700; }
#trans-down, #trans-up { font-size: 13px; }
#trans-label { min-width: 28px; text-align: center; font-size: 12px; color: #aaa; padding: 0 2px; }
#trans-label.active { color: #ffd700; }
#tap-btn    { font-size: 11px; font-family: sans-serif; border-radius: 6px !important; width: auto !important; padding: 0 7px !important; }
#tap-label  { min-width: 44px; text-align: center; font-size: 11px; color: #888; padding: 0 2px; }
#lyrics-btn { font-size: 11px; font-family: sans-serif; border-radius: 6px !important; width: auto !important; padding: 0 7px !important; }
#lyrics-btn.active { color: #ffd700; border-color: #ffd700; }
#fs-btn     { font-size: 14px; }
/* ── Lyrics-only mode ────────────────────────────────────────────────────── */
.chord { transition: opacity 0.2s; }
#song.lyrics-only .chord { opacity: 0; }
/* ── Section jump popup ──────────────────────────────────────────────────── */
#sec-popup {
  display: none; position: fixed; bottom: 72px; left: 50%; transform: translateX(-50%);
  background: rgba(20,20,20,0.96); border: 1px solid #555; border-radius: 10px;
  padding: 6px; z-index: 9998; min-width: 150px; max-height: 280px; overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
}
.sec-item {
  display: block; width: 100%; text-align: left; padding: 7px 14px;
  background: none; border: none; color: #eee; cursor: pointer; border-radius: 5px;
  font-family: sans-serif; font-size: 13px; white-space: nowrap;
}
.sec-item:hover { background: #3a3a3a; }
/* ── Print ────────────────────────────────────────────────────────────────── */
@media print {
  #scroll-bar, #progress-bar { display: none !important; }
  body { background: #fff !important; color: #000 !important; padding: 20px !important; max-width: 100% !important; font-size: 13px !important; }
  .song-header { border-bottom-color: #ccc !important; }
  .chord { color: #1a5fb4 !important; }
  .tab-block { background: #f8f8f8 !important; border-left-color: #aaa !important; }
  .section-chorus .section-label { background: #e8f0fe !important; color: #2a5bbf !important; }
  .section-verse  .section-label { background: #f0f0f0 !important; color: #555 !important; }
  .section-bridge .section-label { background: #fef0d0 !important; color: #a05000 !important; }
  .section-tab    .section-label { background: #f0f4e8 !important; color: #4a6a20 !important; }
  .capo-badge { background: #ffe8b0 !important; color: #7a4000 !important; }
}
</style>
</head>
<body>
<div id="progress-bar"></div>
<div id="song"></div>
<div id="sec-popup"></div>
<div id="scroll-bar">
  <button id="tap-btn"      title="Tap tempo (T)">Tap</button>
  <span   id="tap-label"></span>
  <button id="trans-down"   title="Transpose down (♭)">♭</button>
  <span   id="trans-label">0</span>
  <button id="trans-up"     title="Transpose up (♯)">♯</button>
  <button id="slower-btn"   title="Slower (↓)">−</button>
  <button id="play-btn"     title="Play / Pause (Space)">▶</button>
  <button id="faster-btn"   title="Faster (↑)">+</button>
  <span   id="speed-label">30 px/s</span>
  <button id="tempo-btn"    title="Snap to tempo speed" style="display:none">♩</button>
  <button id="metro-btn"    title="Metronome (M)" disabled style="opacity:0.3">♪</button>
  <button id="font-smaller" title="Smaller text (A−)">A−</button>
  <button id="font-larger"  title="Larger text (A+)">A+</button>
  <button id="lyrics-btn"   title="Lyrics only — hide chords (L)">Ly</button>
  <button id="sec-btn"      title="Jump to section (§)">§</button>
  <button id="fs-btn"       title="Full screen (F)" style="display:none">⤢</button>
  <button id="twocol-btn"   title="Toggle two-column layout">⊞</button>
  <button id="theme-btn"    title="Toggle dark/light theme">🌙</button>
  <button id="save-btn"     title="Save as HTML">💾</button>
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
      if (k === 'start_of_chorus'||k==='soc') { next('chorus',  v||'Chorus', true);  continue; }
      if (k === 'end_of_chorus'  ||k==='eoc') { next('verse',   '',          false); continue; }
      if (k === 'start_of_verse' ||k==='sov') { next('verse',   v||'Verse',  true);  continue; }
      if (k === 'end_of_verse'   ||k==='eov') { next('verse',   '',          false); continue; }
      if (k === 'start_of_bridge'||k==='sob') { next('bridge',  v||'Bridge', true);  continue; }
      if (k === 'end_of_bridge'  ||k==='eob') { next('verse',   '',          false); continue; }
      if (k === 'start_of_tab'   ||k==='sot') { next('tab',     v||'Tab',    true);  continue; }
      if (k === 'end_of_tab'     ||k==='eot') { next('verse',   '',          false); continue; }
      if (k === 'start_of_grid'  ||k==='sog') { next('grid',    v||'Grid',   true);  continue; }
      if (k === 'end_of_grid'    ||k==='eog') { next('verse',   '',          false); continue; }
      if (k === 'comment'||k==='c'||k==='highlight') { cur.lines.push({ type:'comment',     text:v }); continue; }
      if (k === 'comment_italic' ||k==='ci')          { cur.lines.push({ type:'comment',     text:v }); continue; }
      if (k === 'comment_box'    ||k==='cb')          { cur.lines.push({ type:'comment-box', text:v }); continue; }
      if (k === 'chorus')                             { cur.lines.push({ type:'chorus-ref'         }); continue; }
      if (k === 'new_page'||k==='np'||k==='new_physical_page'||k==='npp') { cur.lines.push({ type:'page-break' }); continue; }
      if (k === 'chord' && v && !v.includes('frets')) { cur.lines.push({ type:'chord-diagram', name:v.trim() }); continue; }
      continue;   // define, column_break, image, …
    }

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
function renderGridLine(text) {
  return text.split(' ').map(function(tok) {
    if (tok && /^[A-G][b#]?[^|.]*$/.test(tok) && tok !== '.' && CHORD_SVGS[tok]) {
      return '\x3cspan class="chord" data-chord="' + esc(tok) + '"\x3e' + esc(tok) + '\x3c/span\x3e';
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

  var secIdx = 0;
  for (const sec of sections) {
    out.push('<div class="section section-' + sec.type + '" id="sec-' + (secIdx++) + '"' + (sec.nav ? ' data-nav="1"' : '') + '>');
    if (sec.label) out.push('<div class="section-label">' + esc(sec.label) + '</div>');

    if (sec.type === 'tab') {
      out.push('<pre class="tab-block">');
      for (const l of sec.lines) if (l.type === 'tab') out.push(esc(l.text));
      out.push('</pre>');
    } else if (sec.type === 'grid') {
      out.push('<pre class="grid-block">');
      for (const l of sec.lines) {
        if (l.type !== 'grid-line') continue;
        out.push(renderGridLine(l.text));
      }
      out.push('</pre>');
    } else {
      for (const l of sec.lines) {
        if (l.type === 'chord-line') {
          out.push('<div class="chord-line">');
          for (const s of l.segs) {
            var dc = transposeChordName(s.chord || '', transpose || 0);
            out.push('<span class="pair">'
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
        else if   (l.type === 'chord-diagram')out.push('<div class="chord-diagram-cell" data-chord="' + esc(l.name) + '"></div>');
      }
    }
    out.push('</div>');
  }
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
  if (tempoSpeed) setTimeout(function() { applyTempoSpeed(PARSED.meta, false, true); }, 100);
}
document.getElementById('font-smaller').addEventListener('click', function() { changeFontSize(-1); });
document.getElementById('font-larger').addEventListener('click',  function() { changeFontSize(+1); });

// ── Rerender (called when transpose or any display param changes) ─────────
function rerender() {
  document.getElementById('song').innerHTML = render(PARSED, previewTranspose);
  bindTooltips();
  populateChordDiagrams();
  if (tempoSpeed) setTimeout(function() { applyTempoSpeed(PARSED.meta, false, true); }, 100);
}

// ── Theme toggle ──────────────────────────────────────────────────────────
var themeBtn  = document.getElementById('theme-btn');
var _sysDark  = window.matchMedia('(prefers-color-scheme: dark)').matches;
function _updateThemeBtn() {
  var cur = document.documentElement.dataset.theme || (_sysDark ? 'dark' : 'light');
  themeBtn.textContent = cur === 'dark' ? '☀️' : '🌙';
}
themeBtn.addEventListener('click', function() {
  var cur = document.documentElement.dataset.theme || (_sysDark ? 'dark' : 'light');
  document.documentElement.dataset.theme = cur === 'dark' ? 'light' : 'dark';
  _updateThemeBtn();
});

// ── Two-column toggle ─────────────────────────────────────────────────────
var twoColBtn = document.getElementById('twocol-btn');
twoColBtn.addEventListener('click', function() {
  var on = document.getElementById('song').classList.toggle('two-col');
  twoColBtn.classList.toggle('active', on);
});

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
var PARSED = parse(SOURCE);
document.getElementById('song').innerHTML = render(PARSED);
bindTooltips();
populateChordDiagrams();

// ── Auto-scroll ──────────────────────────────────────────────────────────────
let speed = 30, playing = false, lastTs = null, accum = 0;
const playBtn      = document.getElementById('play-btn');
const speedLabel   = document.getElementById('speed-label');

var tempoSpeed = 0; // non-zero when a {tempo:} was detected
var activeBpm  = 0; // current BPM (from directive or tap tempo) for metronome
const tempoBtn = document.getElementById('tempo-btn');

function updateUI() {
  playBtn.textContent = playing ? '⏸' : '▶';
  speedLabel.textContent = speed + ' px/s';
  if (tempoSpeed) {
    tempoBtn.style.display = 'flex';
    tempoBtn.classList.toggle('active', speed === tempoSpeed);
    tempoBtn.title = 'Tempo speed (' + tempoSpeed + ' px/s)';
  }
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
// keepManual=true: update tempoSpeed but don't change speed if user had manually overridden it
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
document.getElementById('save-btn').addEventListener('click',   function() { vscodeApi.postMessage({ command: 'saveHtml' }); });
tempoBtn.addEventListener('click', function() { if (tempoSpeed) { speed = tempoSpeed; updateUI(); } });
// ── Tap tempo ─────────────────────────────────────────────────────────────
var tapTimes = [];
var tapLabel = document.getElementById('tap-label');
document.getElementById('tap-btn').addEventListener('click', function() {
  var now = Date.now();
  if (tapTimes.length && now - tapTimes[tapTimes.length - 1] > 3000) tapTimes = [];
  tapTimes.push(now);
  if (tapTimes.length < 2) { tapLabel.textContent = '…'; return; }
  if (tapTimes.length > 8) tapTimes.shift();
  var intervals = [];
  for (var i = 1; i < tapTimes.length; i++) intervals.push(tapTimes[i] - tapTimes[i - 1]);
  var bpm = Math.round(60000 / (intervals.reduce(function(a,b){return a+b;},0) / intervals.length));
  tapLabel.textContent = bpm + ' ♩';
  activeBpm = bpm;
  if (_metroActive) startMetronome();
  _updateMetroBtn();
  var computed = computeScrollSpeed(bpm);
  if (computed > 0) { tempoSpeed = computed; speed = tempoSpeed; updateUI(); }
});

// ── Section jump ──────────────────────────────────────────────────────────
var secPopup = document.getElementById('sec-popup');
var secBtn   = document.getElementById('sec-btn');
var SECTION_TYPE_LABELS = { chorus:'Chorus', verse:'Verse', bridge:'Bridge', tab:'Tab', grid:'Grid' };
function buildSectionNav() {
  secPopup.innerHTML = '';
  var secs = document.querySelectorAll('.section[data-nav]');
  var typeCounts = {};
  secs.forEach(function(sec, idx) {
    // Robust type extraction: find the class that starts with 'section-' (but isn't 'section')
    var type = '';
    var cls = sec.className.split(/\s+/);
    for (var ci = 0; ci < cls.length; ci++) {
      if (cls[ci].indexOf('section-') === 0 && cls[ci] !== 'section') {
        type = cls[ci].slice(8); break;
      }
    }
    var labelEl  = sec.querySelector('.section-label');
    var baseName = labelEl ? labelEl.textContent.trim()
                           : (SECTION_TYPE_LABELS[type] || (type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Section'));
    typeCounts[baseName] = (typeCounts[baseName] || 0) + 1;
    var text = (idx + 1) + '. ' + baseName;
    var item = document.createElement('button');
    item.className   = 'sec-item';
    item.textContent = text;
    item.addEventListener('click', function() {
      sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      secPopup.style.display = 'none';
    });
    secPopup.appendChild(item);
  });
}
secBtn.addEventListener('click', function() {
  if (secPopup.style.display === 'block') { secPopup.style.display = 'none'; return; }
  buildSectionNav();
  secPopup.style.display = 'block';
});
document.addEventListener('click', function(e) {
  if (!secBtn.contains(e.target) && !secPopup.contains(e.target)) secPopup.style.display = 'none';
});

// ── Lyrics-only toggle ────────────────────────────────────────────────────
var lyricsBtn = document.getElementById('lyrics-btn');
lyricsBtn.addEventListener('click', function() {
  var on = document.getElementById('song').classList.toggle('lyrics-only');
  lyricsBtn.classList.toggle('active', on);
  lyricsBtn.title = on ? 'Show chords (L)' : 'Lyrics only — hide chords (L)';
});

// ── Full-screen ───────────────────────────────────────────────────────────
var fsBtn = document.getElementById('fs-btn');
fsBtn.style.display = 'flex'; // always show; silently fails in VSCode webview
fsBtn.addEventListener('click', function() {
  try {
    if (!document.fullscreenElement) {
      var p = document.documentElement.requestFullscreen();
      if (p && p.catch) p.catch(function() {});
    } else {
      document.exitFullscreen();
    }
  } catch(e) {}
});
document.addEventListener('fullscreenchange', function() {
  fsBtn.textContent = document.fullscreenElement ? '⤡' : '⤢';
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
  metroBtn.disabled = activeBpm === 0;
  metroBtn.style.opacity = activeBpm === 0 ? '0.3' : '';
  metroBtn.classList.toggle('active', _metroActive);
}

metroBtn.addEventListener('click', function() {
  if (_metroActive) stopMetronome(); else startMetronome();
});

document.addEventListener('keydown', e => {
  if (e.code === 'Space')     { playBtn.click(); e.preventDefault(); }
  if (e.code === 'ArrowUp')   { document.getElementById('faster-btn').click(); e.preventDefault(); }
  if (e.code === 'ArrowDown') { document.getElementById('slower-btn').click(); e.preventDefault(); }
  if (e.key  === 't' || e.key === 'T') { document.getElementById('tap-btn').click(); e.preventDefault(); }
  if (e.key  === 'l' || e.key === 'L') { lyricsBtn.click(); e.preventDefault(); }
  if (e.key  === 'f' || e.key === 'F') { if (fsBtn.style.display !== 'none') fsBtn.click(); e.preventDefault(); }
  if (e.key  === 'm' || e.key === 'M') { metroBtn.click(); e.preventDefault(); }
});

// Reload when file changes (triggered by save or re-running the command)
window.addEventListener('message', function(e) {
  if (e.data.command === 'reload') {
    var savedY = e.data.preserveScroll ? window.scrollY : 0;
    if (e.data.chordSvgs) CHORD_SVGS = e.data.chordSvgs;
    PARSED = parse(e.data.source);
    document.getElementById('song').innerHTML = render(PARSED, previewTranspose);
    bindTooltips();
    populateChordDiagrams();
    window.scrollTo(0, savedY);
    setTimeout(function() { applyTempoSpeed(PARSED.meta); }, 200);
  }
});

_updateThemeBtn();
updateUI();
setTimeout(function() { applyTempoSpeed(PARSED.meta); }, 200);
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
  }
}
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
#song { max-width: 720px; margin: 0 auto; padding: 24px clamp(10px, 4vw, 40px) 40px; }
.song-header { margin-bottom: 18px; }
.song-title    { font-size: 2em; font-weight: bold; color: var(--fg); }
.song-subtitle { font-size: 1.1em; color: var(--fg-dim); margin-top: 2px; }
.song-meta     { font-size: 0.85em; color: var(--fg-muted); margin-top: 6px; }
.capo-badge { display: inline-block; margin-left: 8px; background: var(--capo-bg); color: var(--capo-fg); padding: 1px 7px; border-radius: 10px; font-size: 0.85em; }
.section { margin-bottom: 18px; padding: 10px 14px; border-radius: 6px; }
.section-label { font-size: 0.75em; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; opacity: 0.7; }
.section-chorus .section-label { background: var(--sec-chorus-bg); color: var(--sec-chorus-fg); }
.section-chorus .chord { color: var(--sec-chorus-fg); }
.section-verse  .section-label { background: var(--sec-verse-bg);  color: var(--sec-verse-fg); }
.section-bridge .section-label { background: var(--sec-bridge-bg); color: var(--sec-bridge-fg); }
.section-tab    { background: var(--sec-tab-bg); color: var(--sec-tab-fg); }
.chord-line { display: flex; flex-wrap: wrap; margin-bottom: 2px; }
.pair { display: inline-flex; flex-direction: column; margin-right: 2px; }
.chord { font-weight: bold; font-size: 0.85em; color: var(--chord); min-height: 1.2em; white-space: pre; cursor: default; }
.lyric { white-space: pre; }
.lyric-line { margin-bottom: 2px; }
.comment { font-style: italic; color: var(--fg-dim); margin: 4px 0; }
.comment-box { border: 1px solid var(--border); padding: 4px 8px; border-radius: 4px; }
.chorus-ref { color: var(--fg-muted); font-style: italic; }
.empty-line { height: 0.6em; }
.tab-block, .grid-block { font-family: monospace; font-size: 0.9em; background: var(--tab-bg); border: 1px solid var(--tab-border); padding: 8px 12px; border-radius: 4px; overflow-x: auto; white-space: pre; line-height: 1.5; }
.grid-block .chord { color: var(--chord); font-weight: bold; cursor: pointer; }
.page-break { border: none; border-top: 1px dashed var(--border); margin: 16px 0; }
.chord-diagrams { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 6px 0; }
.chord-diagram-cell { display: inline-flex; flex-direction: column; align-items: center; }
.chord-diagram-cell svg { display: block; }
.chord-diagram-cell .cd-label { font-size: 0.78em; font-weight: bold; color: var(--chord); margin-top: 2px; }
#song.lyrics-only .chord { opacity: 0; }
#song.two-col { column-count: 2; column-gap: 3em; column-rule: 1px solid var(--border); }
#song.two-col .section { break-inside: avoid-column; }
#song.two-col .song-header { column-span: all; }
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
      if (k==='comment'||k==='c'||k==='highlight') { cur.lines.push({type:'comment',text:v}); continue; }
      if (k==='comment_italic'||k==='ci')           { cur.lines.push({type:'comment',text:v}); continue; }
      if (k==='comment_box'||k==='cb')              { cur.lines.push({type:'comment-box',text:v}); continue; }
      if (k==='chorus')                             { cur.lines.push({type:'chorus-ref'}); continue; }
      if (k==='new_page'||k==='np')                 { cur.lines.push({type:'page-break'}); continue; }
      if (k==='chord' && v && !v.includes('frets')) { cur.lines.push({type:'chord-diagram',name:v.trim()}); continue; }
      continue;
    }
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
function renderGridLine(text) {
  return text.split(' ').map(function(tok) {
    if (tok && /^[A-G][b#]?[^|.]*$/.test(tok) && tok !== '.' && CHORD_SVGS[tok]) {
      return '\x3cspan class="chord" data-chord="' + esc(tok) + '"\x3e' + esc(tok) + '\x3c/span\x3e';
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
  for (var sec of sections) {
    out.push('<div class="section section-' + sec.type + '">');
    if (sec.label) out.push('<div class="section-label">' + esc(sec.label) + '</div>');
    if (sec.type === 'tab') {
      out.push('<pre class="tab-block">');
      for (var l of sec.lines) if (l.type==='tab') out.push(esc(l.text));
      out.push('</pre>');
    } else if (sec.type === 'grid') {
      out.push('<pre class="grid-block">');
      for (var l of sec.lines) {
        if (l.type !== 'grid-line') continue;
        out.push(renderGridLine(l.text));
      }
      out.push('</pre>');
    } else {
      for (var l of sec.lines) {
        if (l.type==='chord-line') {
          out.push('<div class="chord-line">');
          for (var s of l.segs) {
            var dc = transposeChordName(s.chord||'', transpose||0);
            out.push('<span class="pair"><span class="chord"' + (dc?' data-chord="'+esc(dc)+'"':'') + '>' + (dc?esc(dc):'&nbsp;') + '</span><span class="lyric">' + esc(s.lyric||' ') + '</span></span>');
          }
          out.push('</div>');
        } else if (l.type==='lyric')        out.push('<div class="lyric-line">'  + safeFmt(l.text) + '</div>');
        else if   (l.type==='comment')      out.push('<div class="comment">'      + safeFmt(l.text) + '</div>');
        else if   (l.type==='comment-box')  out.push('<div class="comment comment-box">' + safeFmt(l.text) + '</div>');
        else if   (l.type==='chorus-ref')   out.push('<div class="chorus-ref">[ Chorus ]</div>');
        else if   (l.type==='empty')        out.push('<div class="empty-line"></div>');
        else if   (l.type==='page-break')   out.push('<hr class="page-break">');
        else if   (l.type==='chord-diagram')out.push('<div class="chord-diagram-cell" data-chord="' + esc(l.name) + '"></div>');
      }
    }
    out.push('</div>');
  }
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
function rerender(){document.getElementById('song').innerHTML=render(PARSED,previewTranspose);bindTooltips();populateChordDiagrams();}

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
                const saved = context.globalState.get(`chord_${chordName}`);
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
                } else {
                    md.appendMarkdown(`**${chordName}**`);
                }
                md.appendMarkdown(`\n\n*Used ${usageCount}× in this file*`);
                return new vscode.Hover(md, new vscode.Range(position.line, start, position.line, end));
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
        const savedNames = new Set(
            context.globalState.keys()
                .filter(k => k.startsWith('chord_'))
                .map(k => k.slice('chord_'.length))
        );

        const usedChords = new Set();

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (/\{(?:define|chord):?\s/i.test(line)) continue; // skip define lines

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
        insertChord,
        insertChordFromList,
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
        registerGridEditor(context)
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
  if (selC < 0) return;
  if (e.key >= '0' && e.key <= '9') {
    const next = inputBuf + e.key;
    inputBuf = (+next <= 24 && next.length <= 2) ? next : e.key;
    render(); e.preventDefault();
  } else if (e.key === 'Backspace') {
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
  commit();
  if (selC >= 0) cols.splice(selC + 1, 0, { type: 'notes', values: Array(NS).fill('') });
  else addNote();
  selC = -1; selS = -1; render();
});
document.getElementById('btn-bar').addEventListener('click',    () => {
  commit();
  if (selC >= 0) cols.splice(selC + 1, 0, { type: 'bar' });
  else addBar();
  selC = -1; selS = -1; render();
});
document.getElementById('btn-del').addEventListener('click',    () => {
  if (!cols.length) return;
  if (selC === cols.length - 1) { selC = -1; selS = -1; }
  cols.pop(); render();
});
document.getElementById('btn-clear').addEventListener('click',  () => {
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
            const re = /\[([A-G][^\[\]]*)\]/g;
            let m;
            while ((m = re.exec(text)) !== null) {
                const ch = m[1].trim();
                if (ch && !seen.has(ch)) { seen.add(ch); songChords.push(ch); }
            }
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
