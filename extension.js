const vscode = require('vscode');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

function activate(context) {
    let disposable = vscode.commands.registerCommand('extension.renderChordPro', function () {

        // Get the current active text editor
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            vscode.window.showErrorMessage("No active editor found");
            return;
        }

        const filePath = editor.document.uri.fsPath;  // Get full path of the current file
        const fileDirname = path.dirname(filePath);   // Get directory name
        const fileBasenameNoExtension = path.basename(filePath, path.extname(filePath));  // Get the file name without extension

        // Check for any custom options (from the first line, for example)
        const firstLine = editor.document.lineAt(0).text;
        
        // Regular expressions to match options and suffix
        const optionsMatch = firstLine.match(/{options\s*=\s*(.*)}/);
        const suffixMatch = firstLine.match(/{suffix\s*=\s*(.*)}/);

        let options = '';
        let suffix = '';

        // If options are found, assign them
        if (optionsMatch && optionsMatch[1]) {
            options = optionsMatch[1].trim();
        }

        // If suffix is found, assign it
        if (suffixMatch && suffixMatch[1]) {
            suffix = suffixMatch[1].trim();
        }

        // Get the path to the bundled bash script in the extension's resources folder
        const scriptPath = path.join(context.extensionPath, 'resources', 'bash_for_chordpro_task.sh');

        // Check if the script exists
        if (!fs.existsSync(scriptPath)) {
            vscode.window.showErrorMessage("Bash script not found!");
            return;
        }

        // Build the command with options and suffix
        let command = `bash "${scriptPath}" "${filePath}" "${fileDirname}/${fileBasenameNoExtension}"`;

        // If options are present, add them to the command
        if (options) {
            command += ` ${options}`;
        }

        // If suffix is present, add it to the command
        if (suffix) {
            command += ` ${suffix}`;
        }

        // Debug: Show the full command in the console for debugging purposes
        console.log('Running command: ', command);

        // Execute the shell command
        exec(command, (error, stdout, stderr) => {
            if (error) {
                vscode.window.showErrorMessage(`Error: ${error.message}`);
                return;
            }
            if (stderr) {
                vscode.window.showErrorMessage(`stderr: ${stderr}`);
                return;
            }
            vscode.window.showInformationMessage(`stdout: ${stdout}`);
        });
    });

    context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
