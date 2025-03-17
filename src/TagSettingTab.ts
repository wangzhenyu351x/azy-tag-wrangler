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
    }
}