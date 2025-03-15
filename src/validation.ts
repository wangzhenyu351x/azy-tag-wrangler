import { Notice } from "obsidian";
import { prompt } from "smalltalk";

import "./validation.scss";
import { FolderSuggest, TagSuggest } from "./file-suggest";

export async function validatedInput(app, typeString, title, message, value = "", regex = ".*", what = "entry") {
    let sug = null;
    while (true) {
        const input = prompt(title, message, value);
        const inputField = input.dialog.find("input");
        const regStr =  `^${regex}$`;
        const reg = new RegExp(regStr);
        const isValid = (t) => reg.test(t);

        inputField.setSelectionRange(value.length, value.length);
        inputField.pattern = regex;
        inputField.oninput = () => inputField.setAttribute("aria-invalid", !isValid(inputField.value));
        if (!sug) {
            if (typeString == 'folder') {
                sug = new FolderSuggest(app, inputField, input.dialog);
            }
            if (typeString == 'tag') {
                sug = new TagSuggest(app, inputField, input.dialog);
            }
        }
        const result = await input;
        if (isValid(result)) return result;
        console.log(regStr,reg,result);
        new Notice(`"${result}" is not a valid ${what}`);
    }
}
