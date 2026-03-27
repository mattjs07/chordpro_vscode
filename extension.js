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

function renderChordProLogic(context) {
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

    // Build the command string to execute the bash script
    let command = `bash "${scriptPath}" "${filePath}" "${fileDirname}/${outputFile}" "${config_path}"`;
    if (options) {
        // Ensure options are quoted in case they contain spaces
        command += ` "${options}"`;
    }

    console.log('File Directory:', fileDirname);

    console.log('Running command: ', command);  // For debugging purposes, remove or comment this in production

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

function activate(context) {
    // Register the renderChordPro command
    const renderOnly = vscode.commands.registerCommand('extension.renderChordPro', function () {
        renderChordProLogic(context);
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

    // Add disposables to context.subscriptions
    context.subscriptions.push(
        renderOnly,
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
