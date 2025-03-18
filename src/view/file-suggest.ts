//https://github.com/liamcain/obsidian-periodic-notes/blob/main/src/ui/file-suggest.ts
import { TAbstractFile, TFile, TFolder } from "obsidian";
import { TextInputSuggest } from "./suggest";

export class FileSuggest extends TextInputSuggest {
    getSuggestions(inputStr){
        inputStr = inputStr.trim();
        const abstractFiles = this.app.vault.getAllLoadedFiles();
        const files = [];
        const lowerCaseInputStr = inputStr.toLowerCase();

        abstractFiles.forEach((file) => {
            if (
                file instanceof TFile &&
                file.extension === "md" &&
                file.path.toLowerCase().contains(lowerCaseInputStr)
            ) {
                files.push(file);
            }
        });

        return files;
    }

    renderSuggestion(file, el) {
        el.setText(file.path);
    }

    selectSuggestion(file) {
        this.inputEl.value = file.path;
        this.inputEl.trigger("input");
        this.close();
    }
}

export class TagSuggest extends TextInputSuggest {

    allTags() {
        // @ts-ignore
        return Object.keys(this.app.metadataCache.getTags()).map(a => a.replace('#',''));
    }

    getSuggestions(inputStr) {
        inputStr = inputStr.trim();
        let lastPart = null;
        let otherPart = null;
        if (inputStr.contains(' ')) {
            inputStr = inputStr.split(' ')[0];
        }
        if (inputStr.contains('/')) {
            const arr = inputStr.split('/');
            lastPart = arr.pop();
            otherPart = arr.join('/');
        }
        
        let tags = this.allTags();
        tags.push('_zydel');
        const files = [];
        tags.forEach((file) => {
            if (file.contains(inputStr) || (lastPart && file.contains(lastPart) && file.contains(otherPart))) {
                files.push(file);
            }
        });
        if (files.length  > 0) {
            files.splice(0,0,'$1');
        }
        return files;
    }

    renderSuggestion(tag, el) {
        el.setText(tag);
    }

    selectSuggestion(tag){
        if (tag != '$1') {
            const origin = this.inputEl.value.trim();
            if (origin.contains(' ')) {
                const arr = origin.split(' ');
                arr[0] = tag;
                this.inputEl.value = arr.join('/');
            } else {
                this.inputEl.value = tag;
            }
        }
        this.inputEl.trigger("input");
        this.close();
    }
}

export class FolderSuggest extends TextInputSuggest {
    getSuggestions(inputStr) {
        const abstractFiles = this.app.vault.getAllLoadedFiles();
        const folders = [];
        const lowerCaseInputStr = inputStr.split(',').last().trim().toLowerCase();

        abstractFiles.forEach((folder) => {
            if (
                folder instanceof TFolder &&
                folder.path.toLowerCase().contains(lowerCaseInputStr)
            ) {
                folders.push(folder);
            }
        });

        return folders;
    }

    renderSuggestion(file, el) {
        el.setText(file.path);
    }

    selectSuggestion(file) {
        // const previousInput = this.inputEl.value;
        // const formattedInput = previousInput.split(',').slice(0, -1);
        // formattedInput.push(file.path);
        const result = file.path;//formattedInput.map(x => x.trim()).join(', ');
        this.inputEl.value = result;
        this.inputEl.trigger("input");
        this.close();
    }
}