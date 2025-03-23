import {
	App,
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
	TFile,
} from "obsidian";
import TagWrangler from "../main";
import { AliasInfo } from "../component/TagAliasInfo";
import {getTagSuggestions} from "../zylib/CommonTool";

const escapeRegExp = (str: string) => {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& = the whole matched string
};

const compare2Tag = (a:string,b:string) => {
	if (a && b) {
		return a.toLowerCase() == (b.toLowerCase());
	}
	return a == b;
}

interface TagSuggestion {
	tag: string;
	num: number;
	origin?:string;
}

export class TagEditorSuggest extends EditorSuggest<TagSuggestion> {
	private isOpen:boolean = false;
	private tagsMap:any;
	private lastFilePath:string;
	private lastline:number;
    constructor(public plugin: TagWrangler) {
		super(plugin.app);
	}

	onTrigger(
		cursor: EditorPosition,
		editor: Editor,
		file: TFile
	): EditorSuggestTriggerInfo | null {
		const line = editor.getLine(cursor.line);
		
		let subString = line.substring(0, cursor.ch);
		// @ts-ignore
		const path = this.plugin.app.workspace.activeEditor?.file?.path;
		if(path != this.lastFilePath || cursor.line != this.lastline) {
			this.lastFilePath = null;
		}
		if(subString.endsWith(' ') || !subString.contains('#')){
			// console.log('endwith space or no #');
			return null;
		}
		const endLine = line.substring(cursor.ch);
		if (!endLine.startsWith(' ')) {
			if (endLine.trim().contains(' ')) {
				subString += endLine.split(' ')[0];
			} else {
				subString += endLine;
			}
		}
		const reg1 =  new RegExp('#');
		const match = subString.match(reg1)?.first();
		if (match) {
			const newQuery = subString.substring(subString.lastIndexOf('#')+1);
			const res = {
				start: {
					ch: subString.lastIndexOf('#'),
					line: cursor.line,
				},
				end: {
					ch: newQuery.length + subString.lastIndexOf('#') +1,
					line: cursor.line
				},
				query: newQuery,
			};
			const excludeSomeChar = ' :|#@$%()';
			for (const char of excludeSomeChar) {
				if (res.query.contains(char)) {
					// console.log('startWith space');
					return null;
				}	
			}
			// console.log(JSON.stringify(res),endLine);
			if (!this.tagsMap || path != this.lastFilePath || cursor.line != this.lastline) {
				// @ts-ignore
				this.tagsMap = this.plugin.app.metadataCache.getTags();
				// console.log(path,this.lastFilePath)
				// console.log(cursor.line,this.lastline)
				this.lastFilePath = path;
				this.lastline = cursor.line;
			}
			return res;
		}
		
        return null;
	}

	updatePosition(e:any) {
		if (!this.isOpen) {
			this.open();
		}
		// @ts-ignore
		super.updatePosition(e);
	}

    async getSuggestions(context: EditorSuggestContext): Promise<TagSuggestion[]> {
		const originString = context.query.trim();
		const tmp = await getTagSuggestions(originString,this.tagsMap);
        return tmp;
    }

    renderSuggestion(value: TagSuggestion, el: HTMLElement): void {
		if (value.origin) {
			el.innerHTML = `${value.origin.replace('#','')} (${value.num}) | ${value.tag.replace('#','')}`;
			return;
		}
		el.innerHTML = `${value.tag.replace('#','')} (${value.num})`;
    }

    selectSuggestion(value: TagSuggestion, evt: MouseEvent | KeyboardEvent): void {
        if (this.context) {
            const editor: Editor = this.context.editor as Editor;
			const lineString = editor.getLine(this.context.start.line);
			const sele = editor.getSelection();
			// const taglist = ['what','why','how'];
			// for (const item of taglist) {
			// 	if (value.tag.contains('/' +item)) {
			// 		if (!value.tag.startsWith('_')) {
			// 			value.tag = '_' + value.tag;
			// 		}
			// 		break;
			// 	}	
			// }

			let replacement = `${value.tag}`;
			if (value.origin) {
				replacement = `${value.origin}`;
			}
			if (!replacement.startsWith('#')) {
				replacement = '#'+replacement;
			}
			let start = this.context.start;
			if (lineString[start.ch-1] == '#') {
				start.ch -= 1;
			}
            editor.replaceRange(
                replacement,
				start,
                this.context.end
            );
            const { ch, line } = this.context.start;
            editor.setCursor({ line, ch: ch + replacement.length });
			super.close();
		}
	}
}