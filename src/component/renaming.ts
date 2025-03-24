import {confirm} from "smalltalk";
import {Progress} from "./progress";
import {validatedInput} from "src/view/validation";
import {Notice, parseFrontMatterAliases, parseFrontMatterTags, normalizePath, TFile, App} from "obsidian";
import {Tag, Replacement} from "./Tag";
import {File} from "./File";
import TagWrangler from "../main";
export const kCptTag = '_zycpt';

export async function getFilesWithTag(app:App,tag:string):Promise<File[]> {
    let targets = await findTargets(app, [new Tag(tag)],undefined,true);
    targets.sort((a,b) => {
        // return a.stat.size - b.stat.size; // 大小排序
        return b.stat.mtime - a.stat.mtime; // 创建时间排序
    });
    // console.log(targets);
    return targets;
}

export async function renameTagWith(app, arr, selectHalf = false , getFileName = false) {
    for (const repl of arr) {
        if (!repl.fromTag || repl.toTag === repl.fromTag) {
            return new Notice("Unchanged or empty tag: No changes made.");
        }    
    }
    
    const findTags = arr.map(i => i.fromTag);
    let targets = await findTargets(app, findTags);
    targets.sort((a,b) => {
        // return a.stat.size - b.stat.size; // 大小排序
        return b.stat.ctime - a.stat.ctime; // 创建时间排序
    });
    // console.log(targets);
    if (!targets) return;

    const progress = new Progress(`Renaming /*`, "Processing files...");
    let renamed = 0;
    let count = 0;
    let res_content = ''
    await progress.forEach(targets, async (target) => {
        count ++;
        if (selectHalf && count % 2 == 0) {
            return;
        }

        if (getFileName) {
            const fileLink = `[[${target.basename}]]\n`.replace('.md','');
            res_content += fileLink;
            return;
        }
        progress.message = "Processing " + target.basename;
        let result = await target.renamed(arr);
        if (result) {
            if (typeof result == 'string') {
                res_content += result;
            }
            renamed++;
        }
    });
    await TagWrangler.tagPlugin?.tagAliasInfo.getTagInfo();
    // this.plugin.tagAliasInfo;
    if (renamed > 0 || progress.aborted ) {
        const content = `Operation ${progress.aborted ? "cancelled" : "complete"}: ${renamed} file(s) updated`;
        new Notice(content);
        console.log(content);
    }

    if (res_content.length) {
        return res_content;
    }
}

export async function renameTag(app, tagName, selectHalf=false) {
    const newName = await promptForNewName(app, tagName);
    if (newName === false) return;  // aborted
    let rep = new Replacement(new Tag(tagName),new Tag(newName));
    await renameTagWith(app, [rep], selectHalf);
}

export async function completeTag(app, tagName) {
    if (!tagName.contains('task/')) {
        return;
    }
    let rep = new Replacement(new Tag(tagName),new Tag(kCptTag));
    await renameTagWith(app, [rep]);
}

export async function moveToFolder(app, tagName) {
    const folderPath = await promptForFolderToMove(app,tagName);
    if (folderPath === false) return;  // aborted
    // is path valid.
    const isExists = await app.vault.adapter.exists(folderPath);
    if (!isExists) {
        new Notice(`文件夹${folderPath}不存在`);
        console.log(folderPath,isExists);
        await app.vault.createFolder(folderPath);
    }
    const tags = [new Tag(tagName)];
    const targets = await findTargets(app,tags,true);
    // console.log(tagName,targets);
    if (!targets) {
        new Notice('找不到需要移动文件');
        return;
    }
    const progress = new Progress(`move /*`, "Processing files...");
    await progress.forEach(targets, async (target) => {
        progress.message = "Processing " + target.basename;
        const path = `${folderPath}/${target.basename}`;
        try {
            // await app.vault.adapter.rename(target.path, path);  
            const newPath = normalizePath(path);
            const newPathExist = await app.vault.adapter.exists(newPath);
            if (newPathExist || newPath === target.file.path) {
                console.log(`${newPath}路径一致,不需要修改`);
                return;
            }
            // Move file
            console.log(`from ${target.file.path} to ${newPath}`);
            await app.fileManager.renameFile(target.file, newPath); 
        } catch (error) {
            console.log(path, target.file.path);
        }
    });

    // let rep = new Replacement(new Tag(tagName),new Tag(newName));
    // await renameTagWith(app, [rep], selectHalf);
}

function allTags(app) {
    return Object.keys(app.metadataCache.getTags());
}

export async function findTargets(app, mytags, needFist = false, filterTree:boolean=false):Promise<File[]> {
    const targets = [];
    const progress = new Progress(`Searching /*`, "Matching files...");

    let compareFunc = (t => {
        if (!t) {
            return false;
        }
        for (const tag of mytags) {
            if (tag.matches(t)) {
                return true
            }
        }
        return false
    });
    const files = app.vault.getMarkdownFiles();
    await progress.forEach(
        files,
        (file:TFile) => {
            const filename = file.path;
            if (filterTree && (filename.contains('/tagTree.md')
                || filename.contains('/taginfo.md'))) {
                return;
            }
            const { frontmatter, tags } = app.metadataCache.getCache(filename) || {};
            let sortTags = (tags || []).sort((a,b) => {
                return a.position.start.offset - b.position.start.offset;
            });
            if (needFist) {
                if (sortTags.length > 0 && mytags[0].matches(sortTags[0].tag)) {
                    // console.log('===>',filename,sortTags[0].tag,sortTags);
                    targets.push(new File(app, filename, sortTags, 0));
                } 
            } else {
                sortTags = sortTags.filter(t =>compareFunc(t.tag)); // last positions first
                // console.log(tags, other);
                // return ;
                let fmtags = (parseFrontMatterTags(frontmatter) || [])
                if (fmtags && fmtags.length > 0) {
                    fmtags = fmtags.filter(t => compareFunc(t));
                }
                // const aliasTags = (parseFrontMatterAliases(frontmatter) || []).filter(Tag.isTag).filter(compareFunc);
                if (sortTags.length || fmtags.length) {
                    targets.push(new File(app, filename, sortTags.reverse(), fmtags.length));
                }
            }
        }
    );
    if (!progress.aborted)
        return targets;
}

async function promptForNewName(app, tagName) {
    try {
        return await validatedInput(
            app,
            'tag',
            `Renaming #${tagName} (and any sub-tags)`, "Enter new name (must be a valid Obsidian tag):\n",
            tagName,
            ".+",
            "Obsidian tag name"
        );
    } catch(e) {
        return false;  // user cancelled
    }
}

export async function promptForAliasName(app, tagName, oriAlias) {
    try {
        return await validatedInput(
            app,
            'alias',
            `Alias #${tagName} (and any sub-tags)`, "输入别名:\n",
            oriAlias,
            ".+",
            "Obsidian alias list"
        );
    } catch(e) {
        return false;  // user cancelled
    }
}

async function promptForFolderToMove(app, tagName) {
    const arr = tagName.split('/');
    const lastPart = arr[arr.length-1];
    try {
        return await validatedInput(
            app,
            'folder',
            `move all file with #${tagName} (and any sub-tags)`, "Enter a valid file path:\n",
            lastPart,
            ".+",
            "Obsidian folder"
        );
    } catch(e) {
        return false;  // user cancelled
    }
}

// async function shouldAbortDueToClash([origin, clash], oldTag, newTag) {
//     try {
//         await confirm(
//             "WARNING: No Undo!",
//             `Renaming <code>${oldTag}</code> to <code>${newTag}</code> will merge ${
//                 (origin.canonical === oldTag.canonical) ?
//                     `these tags` : `multiple tags
//                     into existing tags (such as <code>${origin}</code>
//                     merging with <code>${clash}</code>)`
//             }.

//             This <b>cannot</b> be undone.  Do you wish to proceed?`
//         );
//     } catch(e) {
//         return true;
//     }
// }
