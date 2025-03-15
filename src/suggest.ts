//https://github.com/liamcain/obsidian-periodic-notes/blob/main/src/ui/suggest.ts

import { createPopper} from "@popperjs/core";
import { App, ISuggestOwner, Scope } from 'obsidian';

class Suggest {
    owner;//: ISuggestOwner<T>;
    values;//: T[];
    suggestions;//: HTMLDivElement[];
    selectedItem;//: number;
    containerEl;// HTMLElement;

    constructor(owner, containerEl, scope) {
        this.owner = owner;
        this.containerEl = containerEl;

        containerEl.on(
            "click",
            ".suggestion-item",
            this.onSuggestionClick.bind(this)
        );
        containerEl.on(
            "mousemove",
            ".suggestion-item",
            this.onSuggestionMouseover.bind(this)
        );

        scope.register([], "ArrowUp", (event) => {
            if (!event.isComposing) {
                this.setSelectedItem(this.selectedItem - 1, true);
                return false;
            }
        });

        scope.register([], "ArrowDown", (event) => {
            if (!event.isComposing) {
                this.setSelectedItem(this.selectedItem + 1, true);
                return false;
            }
        });

        scope.register([], "Enter", (event) => {
            if (!event.isComposing) {
                this.useSelectedItem(event);
                return false;
            }
        });
    }

    onSuggestionClick(event, el) {
        event.preventDefault();

        const item = this.suggestions.indexOf(el);
        this.setSelectedItem(item, false);
        this.useSelectedItem(event);
    }

    onSuggestionMouseover(_event, el) {
        const item = this.suggestions.indexOf(el);
        this.setSelectedItem(item, false);
    }

    setSuggestions(values) {
        this.containerEl.empty();
        const suggestionEls = [];

        values.forEach((value) => {
            const suggestionEl = this.containerEl.createDiv("suggestion-item");
            this.owner.renderSuggestion(value, suggestionEl);
            suggestionEls.push(suggestionEl);
        });

        this.values = values;
        this.suggestions = suggestionEls;
        this.setSelectedItem(0, false);
    }

    useSelectedItem(event) {
        const currentValue = this.values[this.selectedItem];
        if (currentValue) {
            this.owner.selectSuggestion(currentValue, event);
        }
    }

    setSelectedItem(selectedIndex, scrollIntoView) {
        const normalizedIndex = this.wrapAround(selectedIndex, this.suggestions.length);
        const prevSelectedSuggestion = this.suggestions[this.selectedItem];
        const selectedSuggestion = this.suggestions[normalizedIndex];

        prevSelectedSuggestion?.removeClass("is-selected");
        selectedSuggestion?.addClass("is-selected");

        this.selectedItem = normalizedIndex;

        if (scrollIntoView) {
            selectedSuggestion.scrollIntoView(false);
        }
    }
    wrapAround = (value, size) => {
        return ((value % size) + size) % size;
    };
}

export class TextInputSuggest {
    app;//: App;
    inputEl;//: HTMLInputElement;

    popper;//: PopperInstance;
    scope;//: Scope;
    suggestEl;//: HTMLElement;
    suggest;//: Suggest<T>;
    fathEl;//: HTMLElement;

    constructor(app, inputEl, fathEl) {
        this.app = app;
        this.inputEl = inputEl;
        this.scope = new Scope();
        this.fathEl = fathEl;
        this.suggestEl = createDiv("suggestion-container");
        // 添加z-index
        const suggestion = this.suggestEl.createDiv("suggestion");
        this.suggest = new Suggest(this, suggestion, this.scope);

        this.scope.register([], "Escape", this.close.bind(this));

        this.inputEl.addEventListener("input", this.onInputChanged.bind(this));
        this.inputEl.addEventListener("focus", this.onInputChanged.bind(this));
        this.inputEl.addEventListener("blur", this.close.bind(this));
        this.suggestEl.on(
            "mousedown",
            ".suggestion-container",
            (event) => {
                event.preventDefault();
            }
        );
    }

    onInputChanged(){
        const inputStr = this.inputEl.value;
        // @ts-ignore
        const suggestions = this.getSuggestions(inputStr);
        if (suggestions.length > 0) {
            this.suggest.setSuggestions(suggestions);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.open((this.app).dom.appContainerEl, this.inputEl);
        }
    }

    open(container, inputEl) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.app).keymap.pushScope(this.scope);

        container.appendChild(this.suggestEl);
        this.popper = createPopper(this.inputEl, this.suggestEl, {
            placement: "bottom-start",
            modifiers: [
                {
                    name: "sameWidth",
                    enabled: true,
                    fn: ({ state, instance }) => {
                        // Note: positioning needs to be calculated twice -
                        // first pass - positioning it according to the width of the popper
                        // second pass - position it with the width bound to the reference element
                        // we need to early exit to avoid an infinite loop
                        const targetWidth = `${state.rects.reference.width}px`;
                        if (state.styles.popper.width === targetWidth) {
                            return;
                        }
                        state.styles.popper.width = targetWidth;
                        instance.update();
                    },
                    phase: "beforeWrite",
                    requires: ["computeStyles"],
                },
            ],
        });
    }

    close() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.app).keymap.popScope(this.scope);

        this.suggest.setSuggestions([]);
        if (this.popper) {
            this.popper.destroy();
        }
        this.suggestEl.detach();
    }

    // abstract getSuggestions(inputStr: string): T[];
    // abstract renderSuggestion(item: T, el: HTMLElement): void;
    // abstract selectSuggestion(item: T): void;
}