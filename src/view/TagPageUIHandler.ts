import {
    Component,
    Keymap,
    Plugin
} from "obsidian";
import TagWrangler from "../main";

interface TagUIFace {
    // container:string,
    selector:string,
    // hoverSource:string,
    toTag(el:HTMLElement):string
}

export class TagPageUIHandler extends Component {
    // Handle hovering and clicks-to-open for tag pages
    plugin:TagWrangler;
    opts:TagUIFace;
    constructor(plugin:TagWrangler, opts) {
        super();
        this.opts = opts;
        this.plugin = plugin;
    }

    onload() {
        // 处理UIhook
        // 经过特定的选择器, 或者点击特定的选择器, 拦截或者触发特定操作.
        const { selector, toTag } = this.opts; // container, hoverSource,
        // this.register(
        //  显示tagpage. 专为tag生成的md文件.
        //     // Show tag page on hover
        //     onElement(document, "mouseover", selector, (event, targetEl) => {
        //         const tagName = toTag(targetEl);
        //     }, { capture: false })
        // );

        this.register(
            onElement(document, "contextmenu", selector, (event, targetEl) => {
                const inEditor = (selector == 'span.cm-hashtag' || selector.contains('.memo-content-text'));
                const tagName = toTag(targetEl);
                this.plugin.tool.onMenu(event, targetEl,inEditor, tagName);
            } , { capture: true })
        );
        this.register(
            // Open tag page w/alt click (current pane) or ctrl/cmd/middle click (new pane)
            onElement(document, "click", selector, (event, targetEl) => {
                const { altKey,shiftKey } = event;
                const tagName = toTag(targetEl);
                if (shiftKey) {
                    event.preventDefault();
                    event.stopPropagation();
                    this.plugin.tool.openFileWithTag(tagName);
                    return;
                }
                if (!altKey) {
                    // console.log('not alt click',selector,event.altKey,event);
                    if (selector == 'span.cm-hashtag') {
                        event.preventDefault();
                        event.stopPropagation();
                        return false;
                    }

                    const tagParent = tagName.split("/").slice(0, -1).join("/");
                    const tagView = this.plugin.tool.leafView(targetEl.matchParent(".workspace-leaf"));
                    if (!tagView.tagDoms) {
                        return false;
                    }

                    const keys = Object.keys(tagView.tagDoms);
                    this.plugin.isSelfClick = true;
                    for (const key of keys) {
                        if (key == '#'+tagName.toLowerCase()) {
                            const tag = tagView.tagDoms[key];
                            if (key.contains('/') && tag.collapsed) {
                                // 关闭打开选项.
                                if (this.plugin.settings.enableLevel2) {
                                    tag.setCollapsed(!tag.collapsed);
                                    tag.tree.requestSaveFolds();
                                }
                            } else {
                                tag.setCollapsed(!tag.collapsed);
                                tag.tree.requestSaveFolds();
                            }
                            
                        }
                    }
                    this.plugin.isSelfClick = false;
                    event.preventDefault();
                    event.stopPropagation();
                    return false;
                }
                if (altKey) {
                    // @ts-ignore
                    const searchPlugin = this.plugin.app.internalPlugins.getPluginById("global-search"), search = searchPlugin && searchPlugin.instance, query = search && search.getGlobalSearchQuery();
                    search.openGlobalSearch("tag:" + tagName);
                }
            }, { capture: true })
        );
    }
}

export function onElement(el, event, selector, callback, options) {
    el.on(event, selector, callback, options);
    return () => el.off(event, selector, callback, options);
}

