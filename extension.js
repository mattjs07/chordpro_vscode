const vscode = require('vscode');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

function renderChordProLogic(context, showPanel = false) {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
        vscode.window.showErrorMessage("No active editor found");
        return;
    }

    const filePath = editor.document.uri.fsPath;
    const fileDirname = path.dirname(filePath);
    const fileBasenameNoExtension = path.basename(filePath, path.extname(filePath));
    const firstLine = editor.document.lineAt(0).text;

    const optionsMatch = firstLine.match(/{options\s*=\s*(.*)}/);
    const suffixMatch = firstLine.match(/{suffix\s*=\s*(.*)}/);

    let options = optionsMatch?.[1]?.trim() || '';
    let suffix = suffixMatch?.[1]?.trim() || '';

    const scriptPath = path.join(context.extensionPath, 'resources', 'bash_for_chordpro_task.sh');
    if (!fs.existsSync(scriptPath)) {
        vscode.window.showErrorMessage("Bash script not found!");
        return;
    }

    let command = `bash "${scriptPath}" "${filePath}" "${fileDirname}/${fileBasenameNoExtension}"`;
    if (options) command += ` ${options}`;
    if (suffix) command += ` ${suffix}`;

    console.log('Running command: ', command);

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

        if (showPanel) {
            const outputSuffix = suffix ? `_${suffix}` : '';
            const outputPdfPath = `${fileDirname}/${fileBasenameNoExtension}${outputSuffix}.pdf`;

            if (!fs.existsSync(outputPdfPath)) {
                vscode.window.showErrorMessage(`PDF not found at ${outputPdfPath}`);
                return;
            }

            const panel = vscode.window.createWebviewPanel(
                'chordpro.pdfPreview',               // Identifies the type of the webview. Used internally
                'ChordPro PDF Preview',              // Title of the panel displayed to the user
                vscode.ViewColumn.Beside,            // Editor column to show the new webview panel in
                {
                    enableScripts: false,            // Whether the webview can run scripts
                    localResourceRoots: [            // 👈 This is where you add it
                        vscode.Uri.file(fileDirname) // 👈 This grants access to the folder with the PDF
                    ]
                }
            );

            const pdfUri = vscode.Uri.file(outputPdfPath);
            const pdfWebviewUri = panel.webview.asWebviewUri(pdfUri);

            // 🔍 Log paths for debugging
            console.log('PDF URI:', outputPdfPath);
            console.log('Webview URI:', pdfWebviewUri.toString());

            console.log('PDF URI:', outputPdfPath);
            console.log('Webview URI:', pdfWebviewUri.toString());

            panel.webview.html = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <style>
                        html, body, iframe {
                            margin: 0;
                            padding: 0;
                            width: 100%;
                            height: 100%;
                            border: none;
                        }
                    </style>
                </head>
                <body>
                    <iframe src="${pdfWebviewUri}" frameborder="0"></iframe>
                </body>
                </html>
            `;
        }
    });
}

function activate(context) {
    const renderOnly = vscode.commands.registerCommand('extension.renderChordPro', function () {
        renderChordProLogic(context, false);
    });

    const renderAndShow = vscode.commands.registerCommand('extension.renderChordProInSidePanel', function () {
        renderChordProLogic(context, true);
    });

    // Build on save if setting is enabled
    const onSaveDisposable = vscode.workspace.onDidSaveTextDocument((document) => {
        const config = vscode.workspace.getConfiguration('chordpro');
        const isEnabled = config.get('buildOnSave', false);

        if (isEnabled && document.languageId === 'chordpro') {
            renderChordProLogic(context, false);
        }
    });

    context.subscriptions.push(renderOnly, renderAndShow, onSaveDisposable);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
