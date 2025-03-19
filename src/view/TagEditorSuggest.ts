import {
	App,
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
	getLinkpath,
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	prepareFuzzySearch,
	Setting,
	TFile,
} from "obsidian";
import TagWrangler from "../main";
import { AliasInfo } from "../component/TagAliasInfo";

const escapeRegExp = (str: string) => {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& = the whole matched string
};

const compare2Tag = (a:string,b:string) => {
	if (a && b) {
		return a.toLowerCase() == (b.toLowerCase());
	}
	return a == b;
}

interface TagFace {
	type: string,
	num: number,
	origin: string
}

export class TagEditorSuggest extends EditorSuggest<TagFace> {
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
				query: newQuery.toLowerCase(),
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

    getSuggestions(context: EditorSuggestContext): TagFace[]{
		const originString = context.query.trim();
		let filterString = originString;
		// const searchCallback = prepareFuzzySearch(filterString);
		// const queryWords = filterString;
		let tmp = [];
		// @ts-ignore
		const tagsMap:any = this.tagsMap;
		const arr:string[] = [...Object.keys(tagsMap)];
		let aliases = [];
		let lastPart = null;
		if (filterString.contains('/')) {
			const arr = filterString.split('/');
			lastPart = arr.pop();
			filterString = arr.join('/');
		}
		if (filterString.length > 0) {
			const dict = this.plugin.tagAliasInfo.tagInfo;
			const tagKeys = Object.keys(dict);
			for (const keyTag of tagKeys) {
				const aliasInfo:AliasInfo = dict[keyTag];
				if (aliasInfo.alias) {
					for (const value of aliasInfo.alias) {
						if(value.contains(filterString) && (!lastPart || value.contains(lastPart))) {
							tmp.push({type:value, num:tagsMap[keyTag], origin:keyTag});
							aliases.push(`${keyTag}`);
							// console.log(keyTag,originString,value);
						}
					}
				}
			}
		}
		for (const item of arr) {
			if (tagsMap[item] > 1000) {
				continue;
			}
			let item2 = item.toLowerCase();
			if (item2 == item) {
				item2 = null;
			}
			if(item.contains(filterString) && (!lastPart || item.contains(lastPart))
				|| (item2 && item2.contains(filterString) && (!lastPart || item2.contains(lastPart)))
			) {
				tmp.push({type:item, num:tagsMap[item], origin:null});
			} else {
				for (const alias of aliases) {
					if (item.startsWith(alias) && item != alias) {
						tmp.push({type:item, num:tagsMap[item], origin:null});
					}
				}
			}
		}

		// if (tmp.length == 1 && tmp[0].type == filterString) {
		// 	tmp = [];
		// }
		tmp.sort((a,b) => {
			// if (!a.origin && b.origin) {
			// 	return 1;
			// }
			// if (!b.origin && a.origin) {
			// 	return -1;
			// }
			
			if (compare2Tag(a.type,originString) || compare2Tag(a.type ,lastPart)) {
				return -1;
			}
			if (compare2Tag(b.type ,originString)  ||compare2Tag(b.type ,lastPart)) {
				return 1;
			}
			const aIx = a.type.indexOf(originString);
			const bIx = b.type.indexOf(originString);
			if (bIx == aIx) {
				if (this.plugin.settings.tagSuggestSortDESC) {
					return b.num - a.num;
				}
				return  a.num -b.num;
			} else {
				return aIx - bIx;
			}
		});
		// console.log(filterString,tmp);
		if(tmp.length == 0) {
			tmp.push({type:'新建', num:0, origin:originString});
		}
        return tmp;
    }

    renderSuggestion(value: TagFace, el: HTMLElement): void {
		if (value.origin) {
			el.innerHTML = `${value.origin.replace('#','')} (${value.num}) | ${value.type.replace('#','')}`;
			return;
		}
		el.innerHTML = `${value.type.replace('#','')} (${value.num})`;
    }

    selectSuggestion(value: TagFace, evt: MouseEvent | KeyboardEvent): void {
        if (this.context) {
            const editor: Editor = this.context.editor as Editor;
			const lineString = editor.getLine(this.context.start.line);
			const sele = editor.getSelection();
			// const taglist = ['what','why','how'];
			// for (const item of taglist) {
			// 	if (value.type.contains('/' +item)) {
			// 		if (!value.type.startsWith('_')) {
			// 			value.type = '_' + value.type;
			// 		}
			// 		break;
			// 	}	
			// }

			let replacement = `${value.type}`;
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