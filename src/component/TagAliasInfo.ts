import { App, Notice, Plugin, TAbstractFile, TFile, normalizePath, parseYaml } from "obsidian";
export interface TagInfoDict {
	[key: string]: AliasInfo;
}
export interface AliasInfo {
	alias?: string[];
}
export class TagAliasInfo {
    tagInfo: TagInfoDict = {};
	tagInfoFrontMatterBuffer: Record<string, object> = {};
	skipOnce = false;
	tagInfoBody = "";
    settings:any = {};

    constructor(private app:App,private plugin:Plugin) {
    }

	async modifyFile(file: TAbstractFile) {
		if (this.skipOnce) {
			this.skipOnce = false;
			return;
		}
		if (file.path == this.getTagInfoFilename()) {
			await this.loadTagInfo();
		}
	}

	getTagInfoFilename() {
		return 'fileIgnore/taginfo.md';
	}

	getTagInfoFile() {
		const file = this.app.vault.getAbstractFileByPath(this.getTagInfoFilename());
		if (file instanceof TFile) {
			return file;
		}
		return null;
	}

	async loadTagInfo() {
		if (this.tagInfo == null) this.tagInfo = {};
		const file = this.getTagInfoFile();
		if (file == null) return;
		const data = await this.app.vault.read(file);
		try {
			const arr = data.split('\n');
			const newTagInfo = {} as TagInfoDict;
			arr.filter(a => a.startsWith('#') && a.contains('||')).forEach((value:string,idx:number)=> {
				const arr = value.split('||');
				const key = arr[0].trim();
				const values = arr[1].split(',').map(a => a.trim());
				newTagInfo[key] = {alias:values};
			});
			this.tagInfo = newTagInfo;
            // console.log(this.tagInfo);
		} catch (ex) {
			console.log(ex);
			// NO OP.
		}
	}

    async addAlias(tag:string,alias:string) {
        const tagInfo:AliasInfo = this.tagInfo[tag];
        if (!tagInfo || !tagInfo.alias || tagInfo.alias.length == 0) {
            const aliasInfo:AliasInfo = {'alias':[alias]}
            this.tagInfo[tag] = aliasInfo;
            await this.saveTagInfo();
            new Notice('udpate tag alias');
        } else {
            const list:string[] = tagInfo.alias;
            if (!list.contains(alias)) {
                list.push(alias);
                tagInfo.alias = list;
                await this.saveTagInfo();
                new Notice('udpate tag alias');
            }
        }
    }

	async updateAliasList(tag:string,aliasL:string[]) {
        const tagInfo:AliasInfo = this.tagInfo[tag];
		if(aliasL.length == 0) {
			if (tagInfo) {
				delete this.tagInfo[tag];
				await this.saveTagInfo();
			}
			new Notice(`delete alias ${tag}`);
			return;
		} 
		const result = aliasL.join(',');
        if (!tagInfo || !tagInfo.alias) {
            const aliasInfo:AliasInfo = {'alias':aliasL};
            this.tagInfo[tag] = aliasInfo;
            await this.saveTagInfo();
            
        } else {
            const list:string[] = tagInfo.alias;
			tagInfo.alias = aliasL;
			await this.saveTagInfo();
        }
		new Notice(`udpate alias ${tag} => ${result}`);
    }

	async saveTagInfo() {
		if (this.tagInfo == null) return;
		let file = this.getTagInfoFile();
		if (file == null) {
			file = await this.app.vault.create(this.getTagInfoFilename(), "");
		}

		let oriConnt = await this.app.vault.read(file);
		const parts = oriConnt.split('---\n');
		const lat = parts.pop();

		let content = '';
		const keys = Object.keys(this.tagInfo).sort();
		const oriCount = lat.split('#').length -1;
		if (keys.length < oriCount -1) {
			new Notice('出问题了');
			console.error('taginfo修改bug',this.tagInfo,lat);
			return;
		}
		for (const key of keys) {
			const info = this.tagInfo[key];
			if (info.alias) {
				const val = info.alias.join(' , ');
				content += `${key} || ${val} \n`;
			}
		}
		parts.push(content);
		await this.app.vault.modify(file,parts.join('---\n'));
        // @ts-ignore
		// await this.app.fileManager.processFrontMatter(file, matter => {
		// 	const ti = Object.entries(this.tagInfo);
		// 	for (const [key, value] of ti) {
		// 		if (value === undefined) {
		// 			delete matter[key];
		// 		} else {
		// 			matter[key] = value;
		// 		}
		// 	}
		// });
	}
}