import dayjs from "dayjs";
import { kCptTag } from "./renaming";
import { App, Notice, TFile } from "obsidian";

const tagBody = /^#[^\u2000-\u206F\u2E00-\u2E7F\'\!\"\#\$\%\&\(\)\*\+\,\.\:\;\<\=\>\?\@\^\`\{\|\}\~\[\]\\\s]+$/;

export class Tag {
    canonical:any;
    tag:any;
    canonical_prefix:string;
    name:string;
    matches:any;
    constructor(name) {
        const
            hashed = this.tag = Tag.toTag(name),
            canonical = this.canonical = hashed.toLowerCase(),
            canonical_prefix = this.canonical_prefix = canonical + "/";
        this.name = hashed.slice(1);
        this.matches = function (text) {
            text = text.toLowerCase();
            return text == canonical || text.startsWith(canonical_prefix);
        };
    }
    toString() { return this.tag; }

    static isTag(s) { return tagBody.test(s); }

    static toTag(name) {
        while (name.startsWith("##")) name = name.slice(1);
        return name.startsWith("#") ? name : "#"+name;
    }

    static canonical(name) {
        return Tag.toTag(name).toLowerCase();
    }
}

export class Replacement {
    fromTag:any;
    toTag:any;
    cache:any;
    constructor(fromTag,toTag) {
        this.fromTag = fromTag;
        this.toTag = toTag;
        this.cache =  Object.assign(
            Object.create(null), {
                [this.fromTag.tag]:  this.toTag.tag,
                [this.fromTag.name]: this.toTag.name,
            }
        );
    }

    async addToTodayNote(addLine:string,filepath:string){
        const pluginId = 'obsidian-open-file-by-magic-date';
        // @ts-ignore
        const magicDate = window.app.plugins.plugins[pluginId];
        
        if (!magicDate) {
            new Notice(`没有目标插件${pluginId}`);
            return
        }
        const todayNotePath = magicDate.getTodayDailyNoteFile(false);// isyesterday
        if (filepath == todayNotePath) {
            return;
        }
        // @ts-ignore
        const app:App = window.app;
        let dayliNoteFile = app.vault.getAbstractFileByPath(todayNotePath) as TFile;
        // 如果不存在就创建.
        if (!dayliNoteFile) {
          dayliNoteFile = await app.vault.create(todayNotePath, '');
        }
        let dayliNoteContent = await app.vault.read(dayliNoteFile);
        if (addLine.contains('task/')) {
            const lastline = addLine.split('task/').pop();
            if (dayliNoteContent.contains(lastline)) {
                return;
            }
        }
        const kSeperateLine = '++++++\n';
        const kPaddingStr = ' \n\n';
        if (!dayliNoteContent.contains(kSeperateLine)) {
          dayliNoteContent = `${dayliNoteContent.trim()}${kPaddingStr}${kSeperateLine}`;
        }
        dayliNoteContent =dayliNoteContent.trim() + `\n${addLine}\n`;
        await app.vault.modify(dayliNoteFile, dayliNoteContent);
      }

    inString(text, pos = 0, tag = null, filepath:string) {
        let addition = '';
        
        if (this.fromTag.name.length <= 3 && /zztest/.test(this.toTag.tag) ) {
            addition = '/'+this.fromTag.name;
        }
        let fromTagLen = this.fromTag.tag.length;
        // if (tag && !/zztest/.test(this.fromTag.tag)) {
        //     this.fromTagLen = tag.length;
        //     // console.log(this.fromTag.tag , tag, this.fromTagLen);
        // }
        if (this.toTag.tag.endsWith('_zydel')) {
            return text.slice(0, pos) + text.slice(pos + fromTagLen);
        }
        // if (this.toTag.tag.endsWith(kCptTag)) {
        //     let tagName = this.fromTag.name;
        //     if (!tagName.startsWith('#')) {
        //         tagName = '#'+tagName;
        //     }
        //     const formatStr = "YY/MM/DD HH:mm";
        //     const dayfmt = dayjs().format(formatStr);
        //     tagName = tagName.replace('#task/',`✅ task/`) + ` ${dayfmt} `;
        //     this.addToTodayNote(tagName,filepath);
        //     return text.slice(0, pos) + tagName + text.slice(pos + fromTagLen);
        // }
        return text.slice(0, pos) + this.toTag.tag + addition + text.slice(pos + fromTagLen);
    }

    inArray(tags, skipOdd, isAlias) {
        return tags.map((t, i) => {
            if (skipOdd && (i & 1)) return t;   // leave odd entries (separators) alone
            // Obsidian allows spaces as separators within array elements
            if (!t) return t;
            // Skip non-tag parts
            if (isAlias) {
                if (!t.startsWith("#") || !Tag.isTag(t)) return t;
            } else if (/[ ,\n]/.test(t)) {
                return this.inArray(t.split(/([, \n]+)/), true, false).join("");
            }
            if (this.cache[t]) return this.cache[t];
            const lc = t.toLowerCase();
            if (this.cache[lc]) {
                return this.cache[t] = this.cache[lc];
            } else if (lc.startsWith(this.fromTag.canonical_prefix)) {
                //@ts-ignore
                return this.cache[t] = this.cache[lc] = this.inString(t);
            } else if (("#" + lc).startsWith(this.fromTag.canonical_prefix)) {
                //@ts-ignore
                return this.cache[t] = this.cache[lc] = this.inString("#" + t).slice(1);
            }
            return this.cache[t] = this.cache[lc] = t;
        });
    }

    // willMergeTags(tagNames) {
    //     // Renaming to change case doesn't lose info, so ignore it
    //     if (this.fromTag.canonical === this.toTag.canonical) return;

    //     const existing = new Set(tagNames.map(s => s.toLowerCase()));

    //     for (const tagName of tagNames.filter(this.fromTag.matches)) {
    //         const changed = this.inString(tagName);
    //         if (existing.has(changed.toLowerCase()))
    //             return [new Tag(tagName), new Tag(changed)];
    //     }

    // }
}


