# chordpro-vscode

This extension allows you to edit and render chordpro files in vscode. While easily passing rendering parameters directly in source code.

## Features


- [x] Allows to compile chordpro files with the function "Render ChordPro PDF"
- [x] Keyboard shortcut for rendering .cho : Ctrl+Shift+B
- [x] Possibility to activate "Build on save" from extension settings.
- [x] Write rendering parameters directly in source code. 
- [ ] Render and open pdf document in side pannel.
- [ ] Preview result in side panel.
- [ ] Synthax highlighting.

## Functions

- "Render ChordPro PDF"
  - Compile and renders your `.cho` file, fetching parameters from the first 25 lines of the file. 
- "Open ChordPro Minimal Template"
  - Minimal template to write a compatible `.cho` file.
- "Open ChordPro Example Template"
  - Example of Yesterday by The Beatles.
  
## Requirements

  Install Chordpro  from  [official website](https://www.chordpro.org/chordpro/chordpro-installation/) and make sure to **add chordpro to system PATH**.

## Advices

- Use `.cho` extension for your chordpro files to make sure the extension recognizes the language (for functions to work).
- Combine this extension with the VScode extension [ChordPro by ricardomfmsousa](https://marketplace.visualstudio.com/items/?itemName=ricardomfmsousa.chordpro)  to enjoy synthax highlighting!

## Release Notes

### 0.0.1

Beta product with basic functions.

---

## Working with chordpro_vscode

1. You can open an example or minimal template through functions
  - "Open ChordPro Minimal Template"
  - "Open ChordPro Example Template"
2. Configure your rendering parameters:
   - All parameters can be written quoted or not.
   - Config can be one of the [preset config](https://www.chordpro.org/chordpro/chordpro-configuration-presets/#preset-configurations) OR a path to your config.json file (either absolute or relative to your .cho file folder)

 ```
# {options = -l}
# {suffix = "lyrics_only"}
# {output =}
# {config ="dark"}
```
3. Render your .cho file using "Render ChordPro PDF"
4. From file explorer, open PDF in side panel.
5. From now on "Render ChordPro PDF" and Ctrl+s (if activate build on save) will update automatically the opened PDF. 

*Note*: If change suffix or output name, need to open the new pdf file.

**Enjoy!**
