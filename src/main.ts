// @ts-ignore
import { moveToFolder, promptForAliasName, renameTag, renameTagWith } from "./renaming";
import dayjs from "dayjs";
import {
    Keymap,
    Menu, // @ts-ignore
    parseFrontMatterAliases, Plugin, Scope,
    TFile, TFolder, MarkdownView, iterateCacheRefs, getLinkpath, normalizePath,
    Notice
} from "obsidian";
import { EnterTagsModal } from "./view/EnterTagsModal";
import { Tag, Replacement } from "./component/Tag";
import { TagAliasInfo } from "./component/TagAliasInfo";
import { TagEditorSuggest } from "./view/TagEditorSuggest";
import { TagPageUIHandler, onElement } from "./view/TagPageUIHandler";
import { around } from "monkey-around";
import { TagSettingsTab } from "./TagSettingTab";
import { Tool, execCmdString } from "./tool";
import CChooseTagModal from "./zylib/CChooseTagModal";
import { ZYPlugin } from "./zylib/CommonTool";

interface TagSettings {
    enableLevel2: boolean;
    tagoncount: number;
    fromCount:number;
    childTagLimit:number;
    grepTag:string[];
    tagCountSolo:boolean;
    tagLimit:number;
    onlyLevel2:boolean;
    grepTooManyChild: boolean;
    tagSuggestSortDESC:boolean;
    fileContext:boolean;
    searchFTagOnly:boolean;
}

const DefaultTagSettings = { 
    enableLevel2: true, 
    tagoncount: 1, 
    fromCount:0, 
    grepTag:[], 
    tagCountSolo:true ,
    tagLimit:30,
    onlyLevel2:false ,
    tagSuggestSortDESC:true ,
    grepTooManyChild:false,
    childTagLimit:7,
    fileContext:false,
    searchFTagOnly:false,
};

export default class TagWrangler extends ZYPlugin {
    // pageAliases = new Map();
    tagAliasInfo:TagAliasInfo = null;
    settings: TagSettings = DefaultTagSettings;
    tool: Tool;
    isSelfClick:boolean = false;
    statusBar:HTMLElement;
    static tagPlugin: TagWrangler = null;
    // @ts-ignore
    constructor(app, manifest) {
        super(app, manifest);
        this.tool = new Tool(app, this);
    }

    onunload(): void {
        TagWrangler.tagPlugin = null;
    }

    async onload() {
        const data = await this.loadData();
        this.settings = Object.assign(this.settings, data);
        this.addSettingTab(new TagSettingsTab(this.app, this));
        TagWrangler.tagPlugin = this;
        setTimeout(() => {
            this.tool.updatePluginsJson();
        }, 1000);

        this.statusBar = this.addStatusBarItem();

        this.addCommand({
            id: 'tag-replace',
            name: `tag-replace`,
            callback: () => {
                this.tool.replaceSpecialTags();
            }
        });

        this.addCommand({
            id: "delete-file-and-link",
            name: "Delete file with its link",
            callback: () => this.tool.deleteFileAndItsLink(),
        });

        this.addCmd('get search result',() => {
            this.tool.getSearchResult();
        })

        this.addCommand({
            id: "choose tag",
            name: "choose tag",
            callback: () => {
                new CChooseTagModal(this.app).awaitSelection().then((res:string) =>{
                    const tagName = res.replace('#','');
                    this.tool.openFileWithTag(tagName);
                }).catch(reason => {
                    console.log(`cancel ${reason}`);
                });
            },
        });

        this.addCommand({
            id: `reload`,
            name: `reload ${this.manifest.name}`,
            callback: () => {
                // @ts-ignore
                this.app.plugins.disablePlugin(this.manifest.id);
                // @ts-ignore
                this.app.plugins.enablePlugin(this.manifest.id);
            }
        });

        this.addCommand({
            id: 'get-tagTree',
            name: 'get Tag Tree',
            callback: () => {
                this.tool.getTagTree();
            }
        });

        this.addCommand({
            id: 'grep link count',
            name: 'grep link count',
            callback: () => {
                this.tool.grepFileHighLinks();
            }
        });

        this.tagAliasInfo = new TagAliasInfo(this.app, this);
        this.tagAliasInfo.getTagInfo();

        const tagHoverMain = "tag-wrangler:tag-pane";
        // @ts-ignore
        this.app.workspace.registerHoverLinkSource(tagHoverMain, { display: 'Tag pane', defaultMod: true });

        const tagSuggest = new TagEditorSuggest(this);

        // @ts-ignore
        this.app.workspace.editorSuggest.suggests.splice(0, 0, tagSuggest);
        this.register((() => {
            // @ts-ignore
            return this.app.workspace.editorSuggest.removeSuggest(tagSuggest);
        }));


        this.addChild(
            // Tags in the tag pane
            new TagPageUIHandler(this, {
                // hoverSource: tagHoverMain,
                selector: ".tag-pane-tag",
                // container: ".tag-container",
                toTag(el) {
                    let tag = el.find(".tag-pane-tag-text, tag-pane-tag-text, .tag-pane-tag .tree-item-inner-text")?.textContent;  
                    if (tag.contains(' (')) {
                        tag = tag.split(' (')[0];
                    }
                    return tag;
                }
            })
        );

        // memo-content-text markdown-rendered

        this.addChild(
            // Tags in the tag pane
            new TagPageUIHandler(this, {
                // hoverSource: null,
                selector: ".memo-content-text .tag, .mm-mindmap .tag",
                // container: ".memolist-wrapper",
                toTag(el: HTMLElement) { 
                     let tag = el.textContent; 
                    if (tag.contains(' (')) {
                        tag = tag.split(' (')[0];
                    }
                    return tag;
                }
            })
        );

        // this.addChild(
        //     // Reading mode / tag links
        //     // 阅读模式
        //     new TagPageUIHandler(this, {
        //         hoverSource: "preview", 
        //         selector: 'a.tag[href^="#"]',
        //         container: ".markdown-preview-view, .markdown-embed, .workspace-leaf-content",
        //         toTag(el) { return el.getAttribute("href"); }
        //     })
        // );

        this.addChild(
            // 编辑模式
            new TagPageUIHandler(this, {
                // hoverSource: "editor",
                selector: "span.cm-hashtag",
                // container: ".markdown-source-view.is-live-preview",
                toTag(el) {
                    // Multiple cm-hashtag elements can be side by side: join them all together:
                    let tagName = el.textContent;
                    if (!el.matches(".cm-formatting")) for (let t = el.previousElementSibling; t?.matches("span.cm-hashtag:not(.cm-formatting)"); t = t.previousElementSibling) {
                        tagName = t.textContent + tagName;
                    }
                    for (let t = el.nextElementSibling; t?.matches("span.cm-hashtag:not(.cm-formatting)"); t = t.nextElementSibling) {
                        tagName += t.textContent;
                    }
                    if (tagName.contains(' (')) {
                        tagName = tagName.split(' (')[0];
                    }
                    return tagName;
                }
            })
        );


        // Tag Drag
        this.register(
            onElement(document, "pointerdown", ".tag-pane-tag", (_, targetEl) => {
                targetEl.draggable = "true";
            }, { capture: true })
        );
        this.register(
            onElement(document, "dragstart", ".tag-pane-tag", (event, targetEl) => {
                const tagName = targetEl.find(".tag-pane-tag-text, tag-pane-tag-text, .tag-pane-tag .tree-item-inner-text")?.textContent;
                event.dataTransfer.setData("text/plain", "#" + tagName);
                // @ts-ignore
                app.dragManager.onDragStart(event, {
                    source: "tag-wrangler",
                    type: "text",
                    title: tagName,
                    icon: "hashtag",
                });
            }, { capture: false })
        );

        this.register(
            // 预览的图片或md, 双击跳文件.
            onElement(document, "dblclick", ".internal-embed.inline-embed.markdown-embed.is-loaded", (event, targetEl) => {
                const src = targetEl.getAttribute('src');
                // console.log('iam click',src);
                const file = this.app.workspace.getActiveFile();
                this.app.workspace.openLinkText(src, file.path, false);
            }, { capture: true })
        );

        // Track Tag Pages
        const metaCache = this.app.metadataCache;
        // @ts-ignore
        const plugins = this.app.plugins;
        const that = this;
        this.register(around(plugins, {
            enablePlugin(old) {
                return function enablePlugin(xxx) {
                    // console.log(old,xxx,this);
                    const result = old.call(this, xxx);
                    setTimeout(() => {
                        that.tool.updatePluginsJson();
                    }, 5000);
                    return result;
                };
            }
        }));
        let hookTreeFlag = false;
        this.app.workspace.onLayoutReady(() => {
            // @ts-ignore
            // metaCache.getCachedFiles().forEach(filename => {
            //     const fm = metaCache.getCache(filename)?.frontmatter;
            //     if (fm && parseFrontMatterAliases(fm)?.filter(Tag.isTag)) this.updatePage(
            //         this.app.vault.getAbstractFileByPath(filename), fm
            //     );
            // });
            metaCache.getTagInfo = this.tagAliasInfo.getTagInfo.bind(this.tagAliasInfo);
            
            this.register(around(metaCache, {
                // 修改tag数量
                // @ts-ignore
                getTags(old) {
                    // @ts-ignore
                    metaCache.getTagsOld = old;
                    return function getTags() {
                        const tags = old.call(this);
                        const fasolo = Object.assign({},tags);
                        const names = Object.keys(tags); // .map(t => t.toLowerCase()));
                        names.sort((a,b)=> {
                            return b.length - a.length;
                        });
    
                        let childMap = {};
                        let lowTagCount = 0;
                        let childBigTagCount = 0;
                        let fasoloCount = 0;
                        const igArr = ['#tech', '#res', '#t', '#area'];
                        for (const tagKey of names) {
                            let faKey = null;
                            let rootKey = tagKey;
                            if (tagKey.contains('/')) {
                                const arr = tagKey.split('/');
                                arr.pop();
                                rootKey = arr[0];
                                faKey = arr.join('/');
                                // if (that.settings.tagCountSolo) {
                                //     tags[faKey] -= tags[tagKey];
                                // } 
                                fasolo[faKey] -= fasolo[tagKey];
                             }

                            if (!igArr.contains(rootKey)) {
                                if (tags[tagKey] > 0 && tags[tagKey]<5) {
                                    lowTagCount +=1;
                                }
                                if (childMap[tagKey] && childMap[tagKey]> that.settings.childTagLimit ) {
                                    childBigTagCount ++;
                                }
                                if(fasolo[tagKey]>that.settings.tagLimit) {
                                    fasoloCount ++;
                                }
                            }

                            if (faKey) {
                                if (childMap[faKey]) {
                                    childMap[faKey] += 1;
                                } else {
                                    childMap[faKey] = 1;
                                }
                            }
                        }
                        this.analysisStr = `${childBigTagCount}/${fasoloCount}/${lowTagCount}`
                        that.statusBar.innerHTML = this.analysisStr;
    
                        // const folderLimit = that.settings.childTagLimit;
                        const keys = Object.keys(childMap);
                        for (const key of keys) {
                            if(childMap[key] > 99) {
                                if (childMap[key] %10 == 0) {
                                    childMap[key] -= 1;
                                }
                                tags[key] += childMap[key]/1000.0;
                            } else if (childMap[key] > 9) {
                                if (childMap[key] %10 == 0) {
                                    childMap[key] -= 1;
                                }
                                // tags[key] += (childMap[key] -folderLimit) * 1000;
                                tags[key] += childMap[key]/100.0;
                            } else {
                                tags[key] += childMap[key]/10.0;
                            }
                        }
    
                        this.ignoreTags = igArr;
                        this.childMap = childMap;
                        this.fasolo = fasolo;
                        // const resKey = '#res';
                        // for (let i = 0; i < igArr.length; i++) {
                        //     const tagItem = igArr[i];
                        //     if (tags[tagItem] && (tags[tagItem] > 10 || tags[tagItem] < 0)) {
                        //         if (childMap[resKey]) {
                        //             tags[tagItem] = ((tags[tagItem] * 1000) %1000) / 1000.0;
                        //         }
                        //     }
                        // }

                        this.curTags = tags;
                        return tags;
                    };
                }
            }));
            this.registerEvent(
                this.app.workspace.on("file-menu", (menu, folder) => {
                    menu.addItem((item) => {
                        item
                            .setTitle("在sublime中打开")
                            .setIcon("tags")
                            // @ts-ignore
                            .setSection("system")
                            .onClick(async () => {
                                const path = normalizePath(folder.path);
                                // @ts-ignore
                                const basePath = this.app.vault.adapter.basePath;
                                // console.log(path);
                                execCmdString(`open -a SublimeText ${basePath}/${path}`);
                            });
                    });
                    if (!(folder instanceof TFolder) || !this.settings.fileContext) return;
                    menu.addItem((item) => {
                        item
                            .setTitle("Tag all notes in this folder")
                            .setIcon("tags")
                            .onClick(async () => {
                                new EnterTagsModal(this.app, async (tags, includeSubfolders) => {
                                    if (tags) {
                                        const tagArray = tags.split(",");
                                        await this.tool.addTagsToNotes(tagArray, folder, includeSubfolders);
                                    }
                                }).open();
                            });
                    });
                    menu.addItem((item) => {
                        item
                            .setTitle("add ctime to fmt in this folder")
                            .setIcon("tags")
                            .onClick(async () => {
                                const path = normalizePath(folder.path);
                                const list = await this.app.vault.adapter.list(path);
                                for (const filepath of list.files) {
                                    const file = this.app.vault.getAbstractFileByPath(filepath) as TFile;
                                    if (!file) {
                                        continue;
                                    }
                                    // @ts-ignore
                                    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                                        if(!frontmatter.ctime) {
                                            frontmatter.ctime = file.stat.ctime;
                                        }
                                    })
                                }
                                // console.log(list);
                                // new EnterTagsModal(this.app, async (tags, includeSubfolders) => {
                                //     if (tags) {
                                //         const tagArray = tags.split(",");
                                //         await this.tool.addTagsToNotes(tagArray, folder, includeSubfolders);
                                //     }
                                // }).open();
                            });
                    });
                })
            );
            const that = this;
            // @ts-ignore
            app.workspace.getLeavesOfType("tag").forEach(leaf => {
                const view = leaf?.view;
                const tree = view?.tree;
                const tagDoms = leaf?.view?.tagDoms;
                if (tree && tagDoms && !hookTreeFlag) {
                    tree.prefersCollapsed = false;
                    hookTreeFlag = true;
                    this.register(around(Object.getPrototypeOf(view), {
                        setUseHierarchy(old) {
                            return function() {
                                that.isSelfClick = true;
                                old.apply(this,arguments);
                                setTimeout(() => {
                                    that.isSelfClick = false;
                                }, 2000);
                            }
                        }
                    }));
                    // 解决merge 文件,显示的不是目标文件.
                    this.register(around(this.app.fileManager, {
                        // @ts-ignore
                        trashFile(old) {
                            return function(f:TFile) {
                                if (f == that.app.workspace.getActiveFile()) {
                                    that.app.workspace.activeLeaf.detach();
                                }
                                return old.apply(this,arguments);
                            }
                        }
                    }));
                    this.register(around(view, {
                        setUseHierarchy(old) {
                            return function() {
                                that.isSelfClick = true;
                                old.apply(this,arguments);
                                setTimeout(() => {
                                    that.isSelfClick = false;
                                }, 2000);
                            }
                        }
                        
                    }));
                    this.register(around(Object.getPrototypeOf(tree), {
                        toggleCollapseAll(old) {
                            return function () {
                                that.isSelfClick = true;
                                old.apply(this,arguments);
                                that.isSelfClick = false;
                            };
                        },
                    }));
                    function fmttag(tag:string) {
                        if (tag == '#area') {
                            tag = '#q';
                        } 
                        return tag;
                    }
                    // metaCache.curTags
                    this.register(around(Object.getPrototypeOf(tree.root.vChildren), {
                        sort(old) {
                            return function () {
                                const item = this.first();
                                if (item && item.tag && item.tag.contains('/')) {
                                    return old.apply(this,arguments);
                                }
                                const fistitem = this._children.first();
                                if (fistitem && fistitem.tag) {
                                    this._children.sort((a,b)=> {
                                        let atag = a.tag;
                                        let btag = b.tag;
                                        atag = fmttag(atag);
                                        btag = fmttag(btag);
                                        return atag.localeCompare(btag);
                                    });
                                } else {
                                    return old.apply(this,arguments);
                                }
                            };
                        },
                    }));
                    const dom = Object.values(tagDoms).first();
                    let i =0;
                    this.register(around(Object.getPrototypeOf(dom), {
                        setCollapsed(old) {
                            return function (a,b) {
                                if (!that.isSelfClick) {
                                    // console.log('setCollapsed not SelfClick');
                                    // console.trace();
                                    return;
                                }
                                if (!this.tag.contains('/')) {
                                    return old.call(this, a,b);
                                }
                                if (that.settings.enableLevel2 || !this.collapsed) {
                                    return old.call(this, a,b);
                                }
                            }
                        },
                    }));
                }
            });
        });
    }
}
