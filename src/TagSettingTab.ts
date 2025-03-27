import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import TagWrangler from "./main";

export class TagSettingsTab extends PluginSettingTab {
    constructor(app:App,public plugin:TagWrangler) {
        super(app,plugin);
    }
    display() {
        this.containerEl.empty();
        new Setting(this.containerEl)
        .setName('enable level2 label')
        .addToggle(to=> {
            to.setValue(this.plugin.settings.enableLevel2);
            to.onChange(value => {
                this.plugin.settings.enableLevel2 = value;
                this.plugin.saveSettings();
            });
        });

        new Setting(this.containerEl)
        .setName('获取数量为多少的标签')
        .addText(to =>{
            to.setValue(`${this.plugin.settings.fromCount}`);
            to.onChange(value => {
                this.plugin.settings.fromCount = parseInt(value);
                this.plugin.saveSettings();
            });
        }).addText(to =>{
            to.setValue(`${this.plugin.settings.tagoncount}`);
            to.onChange(value => {
                this.plugin.settings.tagoncount = parseInt(value);
                this.plugin.saveSettings();
            });
        })

        new Setting(this.containerEl)
            .setName('筛选的标签')
            .setDesc('以,间隔开')
            .addText(to =>{
                to.setValue(this.plugin.settings.grepTag.join(','));
                to.onChange(value => {
                    const arr = value.split(',').map(a => a.trim()).filter(a => a.length > 0);
                    this.plugin.settings.grepTag = arr;
                    this.plugin.saveSettings();
                });
            })

        new Setting(this.containerEl)
            .setName('子标签限制不超过几个')
            .addSlider(to => {
                to.setValue(this.plugin.settings.childTagLimit);
                to.setLimits(3,10,1);
                to.setDynamicTooltip();
                to.onChange(value => {
                    this.plugin.settings.childTagLimit = value;
                    this.plugin.saveSettings();
                });
            })
            .setDesc('是否筛选子标签超数的')
            .addToggle(to => {
                to.setValue(this.plugin.settings.grepTooManyChild);
                to.onChange(value => {
                    this.plugin.settings.grepTooManyChild = value;
                    this.plugin.saveSettings();
                });
            })

        new Setting(this.containerEl)
            .setName('标签数量不包括子标签')
            .setDesc('默认包括')
            .addToggle(to => {
                to.setValue(this.plugin.settings.tagCountSolo);
                to.onChange(value => {
                    this.plugin.settings.tagCountSolo = value;
                    this.plugin.saveSettings();
                });
            })

        new Setting(this.containerEl)
            .setName('仅筛选二级以上')
            .addToggle(to => {
                to.setValue(this.plugin.settings.onlyLevel2);
                to.onChange(value => {
                    this.plugin.settings.onlyLevel2 = value;
                    this.plugin.saveSettings();
                });
            })
            

        new Setting(this.containerEl)
            .setName('标签提示数量倒序')
            .addToggle(to => {
                to.setValue(this.plugin.settings.tagSuggestSortDESC);
                to.onChange(value => {
                    this.plugin.settings.tagSuggestSortDESC = value;
                    this.plugin.saveSettings();
                });
            })
        new Setting(this.containerEl)
            .setName('文件夹右键加特性')
            .addToggle(to => {
                to.setValue(this.plugin.settings.fileContext);
                to.onChange(value => {
                    this.plugin.settings.fileContext = value;
                    this.plugin.saveSettings();
                });
            })

        new Setting(this.containerEl)
            .setName('默认只搜索当前标签,不包括子标签')
            .addToggle(to => {
                to.setValue(this.plugin.settings.searchFTagOnly);
                to.onChange(value => {
                    this.plugin.settings.searchFTagOnly = value;
                    this.plugin.saveSettings();
                });
            })
    }
}