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
    }
}