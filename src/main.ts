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
import { EnterTagsModal } from "./EnterTagsModal";
import { Tag, Replacement } from "./Tag";
import { TagAliasInfo } from "./TagAliasInfo";
import { TagEditorSuggest } from "./TagEditorSuggest";
import { TagPageUIHandler, onElement } from "./TagPageUIHandler";
import { around } from "monkey-around";
import { TagSettingsTab } from "./TagSettingTab";
import { Tool, execCmdString } from "./tool";
import CChooseTagModal from "./zylib/CChooseTagModal";
import { ZYPlugin } from "./zylib/CommonTool";

interface TagSettings {
    enableLevel2: boolean;
    tagoncount: number;
    fromCount:number;
    grepTag:string[];
    tagCountSolo:boolean;
}

export default class TagWrangler extends ZYPlugin {
    // pageAliases = new Map();
    tagAliasInfo:TagAliasInfo = null;
    settings: TagSettings = { enableLevel2: true, tagoncount: 1, fromCount:0, grepTag:[], tagCountSolo:true };
    tool: Tool;
    isSelfClick:boolean = false;
    static tagPlugin: TagWrangler = null;
    // @ts-ignore
    constructor(app, manifest) {
        super(app, manifest);
        this.tagAliasInfo = new TagAliasInfo(app, this);
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
        // this.register(
        //     onElement(document, "contextmenu", ".tag-pane-tag", this.tool.onMenu.bind(this.tool), { capture: true })
        // );

        // hook 全部展开icon
        // this.register(
        //     onElement(document, "click", '.nav-action-button[aria-label="全部展开"]', (event, tagEl)=> {
        //         const leaf = this.app.workspace.getLeavesOfType('tag').first();
        //         // @ts-ignore
        //         if (leaf && leaf.view.tree.isAllCollapsed) {
        //             console.log('i am click');
        //             event.preventDefault();
        //             event.stopPropagation();
        //         }
        //     }, { capture: true })
        // );

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
                    // new Notice(res);
                    // @ts-ignore
                    const searchPlugin = this.app.internalPlugins.getPluginById("global-search"), 
                    search = searchPlugin && searchPlugin.instance;
                    search && search.openGlobalSearch("tag:" + res);
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
        await this.tagAliasInfo.loadTagInfo();

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
                hoverSource: tagHoverMain,
                selector: ".tag-pane-tag",
                container: ".tag-container",
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
                hoverSource: null,
                selector: ".memo-content-text .tag",
                container: ".memolist-wrapper",
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
                hoverSource: "editor",
                selector: "span.cm-hashtag",
                container: ".markdown-source-view.is-live-preview",
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
        const plugin = this;

        this.register(around(metaCache, {
            // 修改tag数量
            // @ts-ignore
            getTags(old) {
                return function getTags() {
                    const tags = old.call(this);
                    const names = Object.keys(tags); // .map(t => t.toLowerCase()));
                    names.sort((a,b)=> {
                        return b.length - a.length;
                    });

                    // let rootTagMap = new Map();
                    // for (const tagItem of names) {
                    //     let itemArr = tagItem.split('/');
                    //     let curTag = itemArr[0];
                    //     let curTagMap = rootTagMap;
                    //     while (itemArr.length > 0) {
                    //         curTag = itemArr[0];
                    //         if (!curTagMap.has(curTag)) {
                    //             curTagMap.set(curTag, new Map());
                    //         }
                    //         itemArr = itemArr.slice(1);
                    //         curTagMap = curTagMap.get(curTag);
                    //     }
                    // }

                    const arr = ['tech', 'res', 't'];
                    for (const tagKey of names) {
                        if (tagKey.contains('/')) {
                            if (that.settings.tagCountSolo) {
                                const arr = tagKey.split('/');
                                arr.pop();
                                const faKey = arr.join('/');
                                tags[faKey] -= tags[tagKey];
                            }
                            if (tagKey.startsWith('#task')) {
                                const lat = tagKey.split('/').pop();
                                const latn = parseInt(lat);
                                if (latn && latn > 0) {
                                    tags[tagKey] += 10 - latn;
                                }
                            }
                        }
                    }
                    for (let i = 0; i < arr.length; i++) {
                        const tagItem = '#' + arr[i];
                        if (tags[tagItem] && tags[tagItem] > 10) {
                            tags[tagItem] = 0;
                        }
                    }
                    if (tags['#task']) {
                        tags['#task'] += 1000;
                        tags['#task/石头'] = 2;
                        tags['#task/剪刀'] = 1;
                        tags['#task/布'] = 0;
                    }

                    return tags;
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
                    if (!(folder instanceof TFolder)) return;
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
