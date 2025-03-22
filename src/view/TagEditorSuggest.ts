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

    async getSuggestions(context: EditorSuggestContext): Promise<TagFace[]> {
		const originString = context.query.trim();
		let filterString = originString;
		// const searchCallback = prepareFuzzySearch(filterString);
		// const queryWords = filterString;
		let tmp:TagFace[] = [];
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
			const dict = await this.plugin.tagAliasInfo.getTagInfo();
			const tagKeys = Object.keys(dict);
			for (const keyTag of tagKeys) {
				const aliasInfo:AliasInfo = dict[keyTag];
				if (aliasInfo.alias) {
					for (const value of aliasInfo.alias) {
						if (lastPart) {
							if(keyTag.contains(filterString) && value.contains(lastPart)) {
								tmp.push({type:value, num:tagsMap[keyTag], origin:keyTag});
								aliases.push(`${keyTag}`);
								// console.log(keyTag,originString,value);
							}
						} else {
							if(value.contains(filterString)) {
								tmp.push({type:value, num:tagsMap[keyTag], origin:keyTag});
								aliases.push(`${keyTag}`);
								// console.log(keyTag,originString,value);
							}
						}
					}
				}
			}
		}

		let secondList:TagFace[] = [];
		for (const itemOri of arr) {
			if (tagsMap[itemOri] > 1000) {
				continue;
			}
			const item = itemOri;
			if(item.contains(filterString) && (!lastPart || (item.contains(lastPart)))) {
				tmp.push({type:itemOri, num:tagsMap[itemOri], origin:null});
			} else if (lastPart && item.endsWith(filterString)) {
				secondList.push({type:itemOri, num:tagsMap[itemOri], origin:null});
			} else  {
				for (const alias of aliases) {
					if (itemOri.startsWith(alias) && itemOri != alias) {
						tmp.push({type:itemOri, num:tagsMap[itemOri], origin:null});
					}
				}
			}
		}
		
		// console.log(filterString,tmp);
		if(tmp.length == 0) {
			if (secondList.length > 0) {
				for (const item of secondList) {
					tmp.push({type:'新建', num:0, origin:item.type + '/' + lastPart});		
				}
			} else {
				tmp.push({type:'新建', num:0, origin:originString});
			}
		}

		const sortFn = (a,b) => {
			const atype = a.type;
			const btype = b.type;
			if (atype.contains(originString) && !btype.contains(originString)) { // 输入刚好包含备注,置顶.
				return -1;
			}
			if (btype.contains(originString) && !atype.contains(originString)) {
				return 1;
			}
			
			if (lastPart) {
				const sLastPart = '/' + lastPart;
				if (atype.endsWith(sLastPart) && !btype.endsWith(sLastPart)) {
					return -1;
				}
				if (btype.endsWith(sLastPart) && !atype.endsWith(sLastPart)) {
					return 1;
				}
				if (atype.contains(lastPart) && !btype.contains(lastPart)) {
					return -1;
				}
				if (btype.contains(lastPart) && !atype.contains(lastPart)) {
					return 1;
				}
			}

			const aIx = atype.indexOf(originString);
			const bIx = btype.indexOf(originString);
			if (bIx == aIx) {
				// if (this.plugin.settings.tagSuggestSortDESC) {
				// 	return b.num - a.num;
				// }
				return  b.num -a.num;
			} else {
				return aIx - bIx;
			}
		};
		tmp.sort(sortFn);

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