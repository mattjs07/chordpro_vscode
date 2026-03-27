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
    { label: 'start_of_chorus',      detail: 'Start chorus section',             snippet: 'start_of_chorus}'                 },
    { label: 'end_of_chorus',        detail: 'End chorus section',               snippet: 'end_of_chorus}'                   },
    { label: 'chorus',               detail: 'Repeat / reference chorus inline', snippet: 'chorus}'                          },
    { label: 'start_of_verse',       detail: 'Start verse section',              snippet: 'start_of_verse}'                  },
    { label: 'end_of_verse',         detail: 'End verse section',                snippet: 'end_of_verse}'                    },
    { label: 'start_of_bridge',      detail: 'Start bridge section',             snippet: 'start_of_bridge}'                 },
    { label: 'end_of_bridge',        detail: 'End bridge section',               snippet: 'end_of_bridge}'                   },
    { label: 'start_of_tab',         detail: 'Start tablature section',          snippet: 'start_of_tab}'                    },
    { label: 'end_of_tab',           detail: 'End tablature section',            snippet: 'end_of_tab}'                      },
    { label: 'start_of_grid',        detail: 'Start chord grid section',         snippet: 'start_of_grid}'                   },
    { label: 'end_of_grid',          detail: 'End chord grid section',           snippet: 'end_of_grid}'                     },
    { label: 'start_of_textblock',   detail: 'Start raw text block',             snippet: 'start_of_textblock}'              },
    { label: 'end_of_textblock',     detail: 'End raw text block',               snippet: 'end_of_textblock}'                },
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
        const chordName = await vscode.window.showInputBox({ prompt: 'Enter chord name' });
        if (!chordName) { return; }
        const chord = context.globalState.get(`chord_${chordName}`);
        if (!chord) { vscode.window.showErrorMessage(`Chord "${chordName}" not found`); return; }
        const editor = vscode.window.activeTextEditor;
        if (editor) { editor.insertSnippet(new vscode.SnippetString(`[${chordName}]`)); }
    });

    const insertChordFromList = vscode.commands.registerCommand('chordproFretboard.insertChordFromList', async () => {
        const allKeys = context.globalState.keys().filter(k => k.startsWith('chord_'));
        const chordNames = allKeys.map(k => k.replace('chord_', ''));
        if (!chordNames.length) { vscode.window.showInformationMessage('No chords defined yet'); return; }
        const selection = await vscode.window.showQuickPick(chordNames, { placeHolder: 'Select a chord' });
        if (!selection) { return; }
        const editor = vscode.window.activeTextEditor;
        if (editor) { editor.insertSnippet(new vscode.SnippetString(`[${selection}]`)); }
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

                    const savedItems = savedChordNames.map(chord => {
                        const item = new vscode.CompletionItem(chord, vscode.CompletionItemKind.Value);
                        item.insertText = new vscode.SnippetString(`${chord}]`);
                        item.detail = 'Saved chord';
                        item.sortText = `0_${chord}`;
                        item.range = replaceRange;
                        return item;
                    });

                    const genericItems = COMPLETION_CHORDS
                        .filter(chord => !savedChordNames.includes(chord))
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
            const presetItems = [
                ...info.presets.map(p => ({ label: p })),
                { label: '$(edit) Enter custom path...', custom: true },
            ];
            const choice = await vscode.window.showQuickPick(presetItems, { placeHolder: 'Select a preset or enter a custom JSON path' });
            if (!choice) { return; }
            if (choice.custom) {
                value = await vscode.window.showInputBox({ prompt: 'Path to config JSON file', placeHolder: info.placeholder });
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

    const autoScrollPreview = vscode.commands.registerCommand('extension.autoScrollPreview', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { vscode.window.showErrorMessage('No active editor found'); return; }

        const source = editor.document.getText();
        const title = path.basename(editor.document.uri.fsPath, path.extname(editor.document.uri.fsPath));

        if (scrollPanel) {
            scrollPanel.reveal(vscode.ViewColumn.Beside);
            scrollPanel.webview.postMessage({ command: 'reload', source });
            return;
        }

        scrollPanel = vscode.window.createWebviewPanel(
            'chordproScrollPreview',
            title + ' — Preview',
            vscode.ViewColumn.Beside,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        scrollPanel.webview.html = getScrollWebviewContent(source);
        scrollPanel.onDidDispose(() => { scrollPanel = null; });
    });

    function getScrollWebviewContent(source) {
        const safeSource = JSON.stringify(source);
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: Georgia, serif; font-size: 17px; line-height: 1.6;
  background: #fafaf8; color: #1a1a1a;
  padding: 40px 56px 160px; max-width: 860px; margin: 0 auto;
}
.song-header { text-align: center; margin-bottom: 36px; padding-bottom: 20px; border-bottom: 2px solid #ddd; }
.song-title  { font-size: 2em; font-weight: bold; }
.song-subtitle { font-size: 1.1em; color: #555; margin-top: 4px; }
.song-meta   { font-size: 0.88em; color: #888; margin-top: 8px; }
.section     { margin-bottom: 22px; }
.section-label {
  display: inline-block; font-size: 0.75em; font-weight: bold;
  text-transform: uppercase; letter-spacing: 1px;
  padding: 2px 10px; border-radius: 3px; margin-bottom: 6px;
}
.section-chorus  .section-label { background: #e8f0fe; color: #2a5bbf; }
.section-verse   .section-label { background: #f0f0f0; color: #555; }
.section-bridge  .section-label { background: #fef0d0; color: #a05000; }
.section-tab     .section-label { background: #f0f4e8; color: #4a6a20; }
.chord-line  { display: flex; flex-wrap: wrap; line-height: 1; margin-bottom: 4px; }
.pair        { display: inline-flex; flex-direction: column; align-items: flex-start; }
.chord       { color: #1a5fb4; font-weight: bold; font-size: 0.82em; min-height: 1.3em; font-family: sans-serif; white-space: pre; }
.lyric       { white-space: pre; }
.lyric-line  { white-space: pre-wrap; margin-bottom: 2px; }
.empty-line  { height: 0.75em; }
.comment     { color: #888; font-style: italic; font-size: 0.9em; margin: 3px 0; }
.comment-box { border: 1px solid #ccc; padding: 1px 8px; border-radius: 3px; display: inline-block; }
.chorus-ref  { color: #2a5bbf; font-style: italic; font-size: 0.9em; margin: 3px 0; }
.tab-block   {
  font-family: 'Courier New', monospace; font-size: 0.88em;
  background: #f4f4f0; padding: 12px 16px; border-radius: 4px;
  border-left: 3px solid #bbb; white-space: pre; overflow-x: auto;
}
.page-break  { border: none; border-top: 2px dashed #ddd; margin: 28px 0; }
#scroll-bar {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 10px;
  background: rgba(20,20,20,0.90); border: 1px solid #555; border-radius: 28px;
  padding: 8px 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  font-family: sans-serif; color: #eee; user-select: none; z-index: 9999;
}
#scroll-bar button {
  background: #3a3a3a; border: 1px solid #666; color: #eee;
  border-radius: 50%; width: 30px; height: 30px; font-size: 15px;
  cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;
}
#scroll-bar button:hover { background: #555; }
#play-btn    { width: 38px; height: 38px; font-size: 18px; }
#speed-label { min-width: 56px; text-align: center; font-size: 12px; color: #aaa; }
</style>
</head>
<body>
<div id="song"></div>
<div id="scroll-bar">
  <button id="slower-btn" title="Slower (↓)">−</button>
  <button id="play-btn"   title="Play / Pause (Space)">▶</button>
  <button id="faster-btn" title="Faster (↑)">+</button>
  <span   id="speed-label">30 px/s</span>
</div>
<script>
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
  let cur = { type: 'verse', label: '', lines: [] };

  function flush() { if (cur.lines.length) { sections.push(cur); } }
  function next(type, label) { flush(); cur = { type, label, lines: [] }; }

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
      if (k === 'start_of_chorus'||k==='soc') { next('chorus',  v||'Chorus');  continue; }
      if (k === 'end_of_chorus'  ||k==='eoc') { next('verse',   '');           continue; }
      if (k === 'start_of_verse' ||k==='sov') { next('verse',   v||'');        continue; }
      if (k === 'end_of_verse'   ||k==='eov') { next('verse',   '');           continue; }
      if (k === 'start_of_bridge'||k==='sob') { next('bridge',  v||'Bridge');  continue; }
      if (k === 'end_of_bridge'  ||k==='eob') { next('verse',   '');           continue; }
      if (k === 'start_of_tab'   ||k==='sot') { next('tab',     v||'Tab');     continue; }
      if (k === 'end_of_tab'     ||k==='eot') { next('verse',   '');           continue; }
      if (k === 'comment'||k==='c'||k==='highlight') { cur.lines.push({ type:'comment',     text:v }); continue; }
      if (k === 'comment_italic' ||k==='ci')          { cur.lines.push({ type:'comment',     text:v }); continue; }
      if (k === 'comment_box'    ||k==='cb')          { cur.lines.push({ type:'comment-box', text:v }); continue; }
      if (k === 'chorus')                             { cur.lines.push({ type:'chorus-ref'         }); continue; }
      if (k === 'new_page'||k==='np'||k==='new_physical_page'||k==='npp') { cur.lines.push({ type:'page-break' }); continue; }
      continue;   // define, chord, column_break, image, …
    }

    if (cur.type === 'tab') { cur.lines.push({ type:'tab', text:line }); continue; }
    if (!line.trim())       { cur.lines.push({ type:'empty' });          continue; }
    if (line.includes('[')) { cur.lines.push({ type:'chord-line', segs: parseChordLine(line) }); }
    else                    { cur.lines.push({ type:'lyric', text:line }); }
  }
  flush();
  return { meta, sections };
}

// ── HTML renderer ────────────────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function render({ meta, sections }) {
  const out = ['<div class="song-header">'];
  if (meta.title)    out.push('<div class="song-title">'    + esc(meta.title)    + '</div>');
  if (meta.subtitle) out.push('<div class="song-subtitle">' + esc(meta.subtitle) + '</div>');
  const mp = [];
  if (meta.artist) mp.push(esc(meta.artist));
  if (meta.key)    mp.push('Key: ' + esc(meta.key));
  if (meta.capo)   mp.push('Capo ' + esc(meta.capo));
  if (meta.tempo)  mp.push(esc(meta.tempo) + ' BPM');
  if (mp.length)   out.push('<div class="song-meta">' + mp.join(' &nbsp;·&nbsp; ') + '</div>');
  out.push('</div>');

  for (const sec of sections) {
    out.push('<div class="section section-' + sec.type + '">');
    if (sec.label) out.push('<div class="section-label">' + esc(sec.label) + '</div>');

    if (sec.type === 'tab') {
      out.push('<pre class="tab-block">');
      for (const l of sec.lines) if (l.type === 'tab') out.push(esc(l.text));
      out.push('</pre>');
    } else {
      for (const l of sec.lines) {
        if (l.type === 'chord-line') {
          out.push('<div class="chord-line">');
          for (const s of l.segs) {
            out.push('<span class="pair">'
              + '<span class="chord">' + (s.chord ? esc(s.chord) : '&nbsp;') + '</span>'
              + '<span class="lyric">'  + esc(s.lyric || ' ') + '</span>'
              + '</span>');
          }
          out.push('</div>');
        } else if (l.type === 'lyric')      out.push('<div class="lyric-line">'  + esc(l.text) + '</div>');
        else if   (l.type === 'comment')    out.push('<div class="comment">'      + esc(l.text) + '</div>');
        else if   (l.type === 'comment-box')out.push('<div class="comment comment-box">' + esc(l.text) + '</div>');
        else if   (l.type === 'chorus-ref') out.push('<div class="chorus-ref">[ Chorus ]</div>');
        else if   (l.type === 'empty')      out.push('<div class="empty-line"></div>');
        else if   (l.type === 'page-break') out.push('<hr class="page-break">');
      }
    }
    out.push('</div>');
  }
  return out.join('\\n');
}

// ── Boot ─────────────────────────────────────────────────────────────────────
const SOURCE = ${safeSource};
document.getElementById('song').innerHTML = render(parse(SOURCE));

// ── Auto-scroll ──────────────────────────────────────────────────────────────
let speed = 30, playing = false, lastTs = null, accum = 0;
const playBtn      = document.getElementById('play-btn');
const speedLabel   = document.getElementById('speed-label');

function updateUI() {
  playBtn.textContent = playing ? '⏸' : '▶';
  speedLabel.textContent = speed + ' px/s';
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
document.getElementById('faster-btn').addEventListener('click', () => { speed = Math.min(speed + 10, 300); updateUI(); });
document.getElementById('slower-btn').addEventListener('click', () => { speed = Math.max(speed - 10, 5);   updateUI(); });
document.addEventListener('keydown', e => {
  if (e.code === 'Space')     { playBtn.click(); e.preventDefault(); }
  if (e.code === 'ArrowUp')   { document.getElementById('faster-btn').click(); e.preventDefault(); }
  if (e.code === 'ArrowDown') { document.getElementById('slower-btn').click(); e.preventDefault(); }
});

// Reload when file changes
window.addEventListener('message', e => {
  if (e.data.command === 'reload') {
    document.getElementById('song').innerHTML = render(parse(e.data.source));
    window.scrollTo(0, 0);
  }
});

updateUI();
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

    // Add disposables to context.subscriptions
    context.subscriptions.push(
        renderOnly,
        previewChordPro,
        completionProvider,
        hoverProvider,
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
        transposeChords
    );
}

// ─────────────────────────────────────────────
// Tab Editor (outside activate — pure webview HTML)
// ─────────────────────────────────────────────
function registerTabEditor(context) {
    return vscode.commands.registerCommand('extension.openTabEditor', () => {
        const panel = vscode.window.createWebviewPanel(
            'chordproTabEditor',
            'Tab Editor',
            vscode.ViewColumn.Beside,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        panel.webview.html = getTabEditorContent();
        panel.webview.onDidReceiveMessage(msg => {
            if (msg.command === 'insertTab') {
                const editor = vscode.window.activeTextEditor;
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

document.getElementById('btn-col').addEventListener('click',    () => { commit(); addNote(); render(); });
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


function deactivate() {}

module.exports = {
    activate,
    deactivate
};
