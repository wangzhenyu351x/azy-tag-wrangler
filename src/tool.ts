import { App, Keymap, MarkdownView, Menu, Notice, Scope, TFile, TFolder, getLinkpath, iterateCacheRefs } from "obsidian";
import TagWrangler from "./main";
import { completeTag, getFilesWithTag, moveToFolder, promptForAliasName, renameTag, renameTagWith } from "./component/renaming";
import { Replacement, Tag } from "./component/Tag";
import dayjs from "dayjs";
import { AliasInfo } from "./component/TagAliasInfo";
import { String, trim } from "lodash";
import { EnterTagsModal } from "./view/EnterTagsModal";
import CChooseTagModal from "./zylib/CChooseTagModal";
import CChooseFileModal from "./zylib/CChooseFileModal";

export class Tool {
    constructor(private app:App,private plugin:TagWrangler) {
    }

    async waitOneSecond() {
        return new Promise(resolve => setTimeout(resolve, 1000));
    }

    async openFileWithTag(tagName:string) {
        // new Notice('先关掉防止误操作');
            // this.createTagPage(tagName, Keymap.isModEvent(e))
        const list = await getFilesWithTag(this.app,tagName);
        if (list.length == 0) {
            new Notice('找不到文件');
        } else if (list.length == 1) {
            const t = list.first();
            await this.openTagPage(t.file as TFile, false, false);
        } else {
            const flist = list.map(a => a.file);
            new CChooseFileModal(this.app,'','选择一个文件',flist,undefined).awaitSelection().then(f => {
                if (f.file) {
                    this.openTagPage(f.file as TFile, false, false);
                }
            }).catch(e=>{});
        }
    }

            

    async getSearchResult() {
        // this.app.workspace.containerEl;
        
        const fileNameList = window.document.querySelectorAll(".search-result-container.mod-global-search .search-result-file-title .tree-item-inner");
        let fileList:TFile[] = [];
        for (const fileDom of fileNameList) {
            const source = fileDom.textContent.trim();
            const file = this.app.metadataCache.getFirstLinkpathDest(source,'');
            if (file && file.path.endsWith('.md')) {
                fileList.push(file);
            } else {
                console.log(`${source} 没有找到对应的md文件`);
            }
        }
        if (fileList.length == 0) {
            new Notice('没有找到合格文件.');
            return;
        }
        new CChooseTagModal(this.app).awaitSelection().then((res:string) =>{
            // new Notice(res);
            for (const file of fileList) {
                this.addTagToFile(res,file);   
            }
        }).catch(reason => {
            console.log(`cancel ${reason}`);
        });

    }

    async getTagTree(echoTree:boolean = true) {
        if (this.plugin.settings.tagoncount > 0) {
            echoTree = false;
        }
        this.createContentPage('', 'tagTree');
        await this.waitOneSecond();

        // @ts-ignore
        const map = this.app.metadataCache.getTagsOld();
        // @ts-ignore
        let childmap = this.app.metadataCache.childMap;
        if (!childmap) {
            // @ts-ignore
            this.app.metadataCache.getTags();
            // @ts-ignore
            childmap = this.app.metadataCache.childMap;
        }
        const tagArr = Object.keys(map).filter(a => {
            if (this.plugin.settings.grepTooManyChild) {
                if (childmap[a] && childmap[a]> this.plugin.settings.childTagLimit) {
                    return true;
                }
                return false;
            }
            if (this.plugin.settings.tagoncount < 1) {
                return true;
            }
            if (a.contains('/')) {
                const arr = a.split('/');
                const first = arr[0];
                if (map[first] == 0) {
                    return false;
                }
                if (this.plugin.settings.onlyLevel2 && arr.length > 2) {
                    return false;
                }
                if (this.plugin.settings.grepTag.length > 0) {
                    if (!this.plugin.settings.grepTag.contains(first)) {
                        return false;
                    }
                }
            }
            if (map[a] <= this.plugin.settings.tagoncount && map[a] > this.plugin.settings.fromCount ) {
                return true;
            }
            return false;
        }).map(a => a.replace('#', ''));

        // console.log(tagArr);
        let content = '';
        if (echoTree) {
            let rootTagMap = new Map();
            for (const tagItem of tagArr) {
                let itemArr = tagItem.split('/');
                let curTag = itemArr[0];
                let curTagMap = rootTagMap;
                while (itemArr.length > 0) {
                    curTag = itemArr[0];
                    if (!curTagMap.has(curTag)) {
                        curTagMap.set(curTag, new Map());
                    }
                    itemArr = itemArr.slice(1);
                    curTagMap = curTagMap.get(curTag);
                }
            }
            // console.log(rootTagMap);
            content = this.echoMap(rootTagMap);
        } else {
            let stringArr:string[] = [];
            for (const tagItem of tagArr) {
                let itemArr = tagItem.split('/');
                let curTag = itemArr[0];
                // if (map[`#${curTag}`] > 100) {
                const tagOri = '#' + tagItem;
                if (this.plugin.settings.grepTooManyChild) {
                    stringArr.push(`${childmap[tagOri]} ${tagOri}`);
                } else {
                    stringArr.push(`${map[tagOri]} ${tagOri}`);
                }
                // }
            }
            stringArr.sort((a,b)=>b.localeCompare(a));
            content = stringArr.join('\n');
        }
        // console.log(content);
        this.createContentPage(content, 'tagTree');
    }

    echoMap(map: any, level = 0, prefixStr = '#') {
        let content = '';
        const isEchoHeading = this.plugin.settings.tagoncount < 1;
        for (const key of map.keys()) {
            let curFix = prefixStr;
            const innerMap = map.get(key);
            let curString = '# ';
            for (let i = 0; i < level; i++) {
                curString = '#' + curString;
            }
            if (isEchoHeading) {
                curString += key + ' \n' + `${curFix}${key}\n\n`;
                content += curString;
            } else {
                content += `${curFix}${key}\n`;
            }
            curFix = `${curFix}${key}/`;
            const res = this.echoMap(innerMap, level + 1, curFix);
            content += res;
        }
        return content;
    }

    myechoMap(map: any, level = 0, prefixStr = '#') {
        let content = '';
        for (const key of map.keys()) {
            let curFix = prefixStr;
            const innerMap = map.get(key);
            let curString = '# ';
            for (let i = 0; i < level; i++) {
                curString = '#' + curString;
            }
            content += `${curFix}${key}\n`;
            curFix = `${curFix}${key}/`;
            const res = this.echoMap(innerMap, level + 1, curFix);
            content += res;
        }
        return content;
    }

    async createContentPage(content: string, baseName: string) {
        let path = `${baseName}.md`;
        if ("MapFolder" == this.app.vault.getName()) {
            path = `fileIgnore/${path}`;
        }
        let file = this.app.vault.getAbstractFileByPath(path);
        if (!file || !(file instanceof TFile)) {
            file = await this.app.vault.create(path, content);
        } else {
            await this.app.vault.modify(file, content);
        }
        await this.openTagPage(file as TFile, false, false);
    }

    openTagPage(file: TFile, isNew: boolean, newLeaf: boolean) {
        const openState = {
            eState: isNew ? { rename: "all" } : { focus: true }, // Rename new page, focus existing
            ...(isNew ? { state: { mode: "source" } } : {}) // and set source mode for new page
        };
        return this.app.workspace.getLeaf(newLeaf).openFile(file, openState);
    }

    // @ts-ignore
    // @ts-ignore
    async createTagPage(tagName, newLeaf) {
        const baseName = "grep_out";
        const rs_content = await renameTagWith(this.app, [new Replacement(new Tag(tagName), new Tag('sel'))], false, true);
        if (!rs_content) {
            return;
        }
        const text: string = rs_content as any;
        this.createContentPage(text, baseName);
    }

    replaceTag(oldTag, diffMount, unit) {
        const formatStr = "YY/MM/DD";
        const prefixStr = "zztest/";
        const nextWeek = dayjs().add(diffMount, unit).format(formatStr);
        let newName = prefixStr + nextWeek;
        newName = newName.replace('test/24/', 'test/');
        return new Replacement(new Tag(oldTag), new Tag(newName));
    }

    replaceTagArr(tagArr: string[], newTag: string) {
        let newList = [];
        for (const item of tagArr) {
            const r = new Replacement(new Tag(item), new Tag(newTag + '/' + item));
            newList.push(r);
        }
        return newList;
    }

    replaceSpecificTagArr(tagArr: string[]) {
        let newList = [];
        for (const item of tagArr) {
            const arr = item.split('/');
            const part = arr.pop();
            const r = new Replacement(new Tag(item), new Tag(item.replace(`/${part}`,'')));
            newList.push(r);
        }
        return newList;
    }

    replaceTodayTag() {
        const formatStr = "MM/DD";
        const prefixStr = "zztest/";
        const component = dayjs().format(formatStr);
        return new Replacement(new Tag(prefixStr + component), new Tag('today'));
    }

    async replaceSpecialTags() {
        // let replaces = this.replaceSpecificTagArr(['#res/运营','#res/安全感','#res/价值观','#res/关系','#res/交通工具']);
        // await renameTagWith(this.app, replaces);
        new Notice('未有自定义替换');
    }

    deleteFileAndItsLink() {
        // this.app.workspace.activeEditor;
        const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!markdownView || !markdownView.file) {
            return;
        }
        const curFile = markdownView.file;
        const curFilePath = markdownView.file.path;
        const curFileName = curFilePath.split('/').last();
        const markdownFiles = this.app.vault.getMarkdownFiles();
        markdownFiles.forEach((markFile) => {
            iterateCacheRefs(
                this.app.metadataCache.getFileCache(markFile),
                (cb) => {
                    const linkPath = getLinkpath(cb.link);
                    // const destPath = this.app.metadataCache.getFirstLinkpathDest(linkPath, markFile.path);
                    if (linkPath + '.md' == curFileName) {
                        console.log(cb.original, linkPath, curFilePath);
                        this.app.vault.cachedRead(markFile).then(content => {
                            let res = content.replace('\n' + cb.original, '');
                            res = res.replace(cb.original, '').trim();
                            this.app.vault.modify(markFile, res);
                        });
                    }
                }
            );
        });

        // const toExcuteCmdId = "heycalmdown-navigate-cursor-history:cursor-position-backward";
        // if (this.app.commands.findCommand(toExcuteCmdId)) {
        //     this.app.commands.executeCommandById(toExcuteCmdId);  
        // } else {
        //     console.log('没有找到cmd id');
        // }
        this.app.vault.trash(curFile, true);
    }

    async updatePluginsJson() {
        const abPath = '.obsidian/community-plugins.json';
        const isExist = await this.app.vault.adapter.exists(abPath);
        if (isExist) {
            const data = await this.app.vault.adapter.read(abPath);
            const pluginList = JSON.parse(data);
            pluginList.sort((a, b) => { return a > b ? 1 : (a == b ? 0 : -1); });
            await this.app.vault.adapter.write(abPath, JSON.stringify(pluginList, null, 4));
            console.log('plugins update');
        }
    }

    onMenu(e:MouseEvent | any, tagEl:HTMLElement, inEditor:boolean, tagNameF:string) {
        if (!e.obsidian_contextmenu) {
            e.obsidian_contextmenu = new Menu(this.plugin.app);
            setTimeout(() => menu.showAtPosition({ x: e.pageX, y: e.pageY }), 0);
        }

        // @ts-ignore
        const searchPlugin = this.app.internalPlugins.getPluginById("global-search"), search = searchPlugin && searchPlugin.instance, query = search && search.getGlobalSearchQuery(),
            // random = this.app.plugins.plugins["smart-random-note"],
            menu = e.obsidian_contextmenu;
        let isHierarchy = null; 
        let
            tagName = tagNameF;
            if (tagName.startsWith('#')) {
                tagName = tagName.replace('#','');
            }
        if (!inEditor) {
            tagName = tagEl.find(".tag-pane-tag-text, .tag-pane-tag .tree-item-inner-text").textContent;
            isHierarchy = tagEl.parentElement.parentElement.find(".collapse-icon");
        }
        menu.addItem(item("pencil", "Open With #" + tagName, () => {
            this.openFileWithTag(tagName);
        }));
        menu.addSeparator();
        menu.addItem(item("pencil", "Alias #" + tagName, () => this.alias(tagName)));
        if ("MapFolder" == this.app.vault.getName()) {
            menu.addItem(item("pencil", `move #${tagName} to Folder`, () => {
                // let rep = new Replacement(new Tag(tagName),new Tag("today"));
                // renameTagWith(app, [rep]);
                // this.moveFolder(tagName);
                new Notice('先关掉防止误操作');
            }));
        }
        e.preventDefault();
        e.stopPropagation();

        if (search) {
            menu.addSeparator();
            menu.addItem(
                item("magnifying-glass", "New search for #" + tagName, () => {  
                    
                    search.openGlobalSearch("tag:" + tagName)
                })
            );
            menu.addItem(
                item("magnifying-glass", "search father only for #" + tagName, () => {
                    const inner = tagName.replace('/','\\/');
                    search.openGlobalSearch(`/${inner}\\s/`)
                })
            );
        }
        menu.addSeparator();
        menu.addItem(item("pencil", "Rename #" + tagName, () => this.rename(tagName)));

        this.app.workspace.trigger("tag-wrangler:contextmenu", menu, tagName, { search, query, isHierarchy});

        if (isHierarchy) {
            const
                tagParent = tagName.split("/").slice(0, -1).join("/"), tagView = this.leafView(tagEl.matchParent(".workspace-leaf")),
                // @ts-ignore
                tagContainer = tagParent ? tagView.tagDoms["#" + tagParent.toLowerCase()] : tagView.root;
            function toggle(collapse) {
                for (const tag of tagContainer.children ?? tagContainer.vChildren.children) {
                    tag.setCollapsed(collapse);
                }
            }
            menu.addSeparator()
                .addItem(item("vertical-three-dots", "Collapse tags at this level", () => toggle(true)))
                .addItem(item("expand-vertically", "Expand tags at this level", () => toggle(false)));
        }
        if (tagName.contains('task/')) {
            menu.addItem(item("pencil", "Complete #" + tagName, () => this.complete(tagName)));
        }
    }

    leafView(containerEl) {
        let view;
        this.app.workspace.iterateAllLeaves((leaf) => {
            // @ts-ignore
            if (leaf.containerEl === containerEl) { view = leaf.view; return true; }
        });
        return view;
    }

    // tags: string[], folder: TFolder, includeSubfolders: boolean, counter: number[] = [0]) 
    async addTagToFile(tag,file:TFile) {
        const note = file;
        let linkStr = tag;
        // '#' + tags.first();
        if (!linkStr.startsWith('#')) {
            linkStr = '#'+linkStr.trim();
        }
        let content = await this.app.vault.read(file);
        if (!content.contains(linkStr)) {
            const fcache = this.app.metadataCache.getFileCache(note);
            if (fcache && fcache.frontmatter) {
                let contArr = content.split('\n');
                let lineNo = -1;
                let i = 0;
                for (const line of contArr) {
                    if (line.startsWith('---') && line.trim() === '---') {
                        lineNo = i;
                    }
                    i++;
                }
                if (lineNo >= 0) {
                    contArr.splice(lineNo + 1, 0, linkStr);
                } else {
                    contArr.push(linkStr);
                }
                content = contArr.join('\n');
            } else {
                if (!content.contains(linkStr)) {
                    content = `${linkStr}\n${content}`;
                }
            }
            await this.app.vault.modify(note, content);
        }
    }
    async addTagsToNotes(tags, folder, includeSubfolders, counter = [0]) {
        for (const note of folder.children) {
            if (note instanceof TFolder) {
                // If its a folder and subfolders are to be included, recurse into subfolders
                if (includeSubfolders) await this.addTagsToNotes(tags, note, true, counter);
                continue;
            }

            // Add tags to frontmatter
            // this.app.fileManager.processFrontMatter(note as TFile, (frontmatter) => {
            // 	if(!frontmatter.tags) {
            // 		frontmatter.tags = new Set(tags);
            // 	} else {
            // 		frontmatter.tags = [...new Set([...frontmatter.tags, ...tags])];
            // 	}
            // })
            const file = note; //as TFile;
            await this.addTagToFile(tags.first(),file);
            counter[0]++;
        }
    }


    async rename(tagName, selectHalf = false) {
        const scope = new Scope;
        // @ts-ignore
        this.app.keymap.pushScope(scope);
        try { await renameTag(this.app, tagName, selectHalf); }
        catch (e) { console.error(e); new Notice("error: " + e); }
        // @ts-ignore
        this.app.keymap.popScope(scope);
    }

    async complete(tagName) {
        const scope = new Scope;
        // @ts-ignore
        this.app.keymap.pushScope(scope);
        try { await completeTag(this.app, tagName); }
        catch (e) { console.error(e); new Notice("error: " + e); }
        // @ts-ignore
        this.app.keymap.popScope(scope);
    }

    async alias(tagName:string) {
        const scope = new Scope;
        // @ts-ignore
        this.app.keymap.pushScope(scope);
        try { await this.aliasTag(this.app, tagName); }
        catch (e) { console.error(e); new Notice("error: " + e); }
        // @ts-ignore
        this.app.keymap.popScope(scope);
    }

    async aliasTag(app, tagName) {
        if (!tagName.startsWith('#')) {
            tagName = `#${tagName}`;
        }
        this.plugin.tagAliasInfo;
        const dict = await this.plugin.tagAliasInfo.getTagInfo();
        const aliasInfo:AliasInfo = dict[tagName];
        console.log(tagName,aliasInfo);
        const ers = aliasInfo?.alias?.join(',') ?? '';
        const newName = await promptForAliasName(app, tagName.replace('#',''), ers);
        if (newName === false) return; // aborted
        // let rep = new Replacement(new Tag(tagName),new Tag(newName));
        // await renameTagWith(app, [rep], selectHalf);
        console.log('aliasTag', tagName, newName);
        const list = newName.split(',').map(trim).filter(a => a.length > 0);
        await this.plugin.tagAliasInfo.updateAliasList(tagName, list);
    }

    async moveFolder(tagName) {
        const scope = new Scope;
        // @ts-ignore
        this.app.keymap.pushScope(scope);
        try {
            // console.log(tagName,typeof tagName);
            await moveToFolder(this.app, tagName);
        }
        catch (e) { console.error(e); new Notice("error: " + e); }
        // @ts-ignore
        this.app.keymap.popScope(scope);
    }
}

function item(icon, title, click) {
    return i => i.setIcon(icon).setTitle(title).onClick(click);
}

export function execCmdString(cmdString){
    var child = require('child_process');
    if (cmdString.length <3) {
        return;
    }
    // 调用shell脚本并传参数
    child.exec(cmdString, function(err, sto) {
        // sto才是真正的输出
        if (err) {
            new Notice(`error ${err}`);
            // @ts-ignore
            throw new Error(err);
        } else {
            const result = `${cmdString}执行成功!${sto}`;
            console.log(result);
        }
    })
  }