import { CST, parseDocument } from "yaml";
import {Tag, Replacement} from "./Tag";
import {Notice, TFile, parseFrontMatterAliases, parseFrontMatterTags} from "obsidian";

export class File {
    app:any;
    filename:string;
    basename:string;
    tagPositions:any;
    hasFrontMatter:boolean;
    stat:any;
    file:TFile;
    constructor(app, filename, tagPositions, hasFrontMatter) {
        this.app = app;
        this.filename = filename;
        this.basename = filename.split("/").pop();
        this.tagPositions = tagPositions;
        
        // let or1 = JSON.stringify(this.tagPositions);
        // console.log(or1);
        this.hasFrontMatter = !!hasFrontMatter;
        this.stat = app.vault.fileMap[filename].stat;
        this.file = app.vault.fileMap[filename];
    }

    async renamed(replaces) {
        const file = this.app.vault.getAbstractFileByPath(this.filename);
        const original = await this.app.vault.read(file);
        let text = original;

        if (replaces.length == 1) {
            const rep =replaces[0];
            if (rep.toTag.tag == '#sel'){
                let lineArr = original.split('\n');
                let content = '';

                if (this.filename.indexOf('grep_out') >= 0 ) {
                    return content;
                }
                const reverse = this.tagPositions.reverse();

                const replacePattern = /^#+\s/;

                for ( const posi of reverse) {
                    const { position: { start, end }, tag } = posi;
                    let line = lineArr[start.line];
                    line = line.replace(replacePattern, '').trim();
                    line = line.replace('#today', '#td');
                    content += line +'\n';
                }
                return content;
            }
        }
        
        for ( const posi of this.tagPositions) {
            const { position: { start, end }, tag } = posi;
            let theRep:Replacement = null;
            for (const rep of replaces) {
                if (rep.fromTag.matches(tag)) {
                    theRep = rep;
                    break;
                }
            }
            if (!theRep) {
                let string = '找不到替换的Replacement'
                new Notice(string);
                console.log(string);
                return;
            }
            if (text.slice(start.offset, end.offset) !== tag) {
                console.log(text.slice(start.offset, end.offset), posi , tag);
                return false;
            }
            text = theRep.inString(text,start.offset,tag,this.file.path);
        }

        if (this.hasFrontMatter)
            text = this.replaceInFrontMatter(text, replaces[0]);

        if (text !== original) {
            await this.app.vault.modify(file, text);
        }
        return true;
    }

    /** @param {Replacement} replace */
    replaceInFrontMatter(text, replace) {
        const [empty, frontMatter] = text.split(/^---\r?$\n?/m, 2);

        // Check for valid, non-empty, properly terminated front matter
        if (empty.trim() !== "" || !frontMatter.trim() || !frontMatter.endsWith("\n"))
            return text;

        const parsed = parseDocument(frontMatter, {keepSourceTokens: true});
        if (parsed.errors.length) {
            const error = `YAML issue with ${this.filename}: ${parsed.errors[0]}`;
            console.error(error); new Notice(error + "; skipping frontmatter");
            return;
        }

        let changed = false, json = parsed.toJSON();

        function setInNode(node, value, afterKey=false) {
            CST.setScalarValue(node.srcToken, value, {afterKey});
            changed = true;
            node.value = value;
        }

        function processField(prop, isAlias) {
            const node = parsed.get(prop, true);
            if (!node) return;
            const field = json[prop];
            if (!field || !field.length) return;
            if (typeof field === "string") {
                const parts = field.split(isAlias ? /(^\s+|\s*,\s*|\s+$)/ : /([\s,]+)/);
                const after = replace.inArray(parts, true, isAlias).join("");
                if (field != after) setInNode(node, after, true);
            } else if (Array.isArray(field)) {
                replace.inArray(field, false, isAlias).forEach((v, i) => {
                    // @ts-ignore
                    if (field[i] !== v) setInNode(node.get(i, true), v)
                });
            }
        }
        // @ts-ignore
        for (const {key: {value:prop}} of parsed.contents.items) {
            if (/^tags?$/i.test(prop)) {
                processField(prop, false);
            } else if (/^alias(es)?$/i.test(prop)) {
                processField(prop, true);
            }
        }
        return changed ? text.replace(frontMatter, CST.stringify(parsed.contents.srcToken)) : text;
    }
}
