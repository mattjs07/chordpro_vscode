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
        insertChordFromList
    );
}


function deactivate() {}

module.exports = {
    activate,
    deactivate
};
