const componentRegistrations = [
    ["sp-action-button", () => import("@spectrum-web-components/action-button/sp-action-button.js")],
    ["sp-button", () => import("@spectrum-web-components/button/sp-button.js")],
    ["sp-field-label", () => import("@spectrum-web-components/field-label/sp-field-label.js")],
    ["sp-link", () => import("@spectrum-web-components/link/sp-link.js")],
    ["sp-menu-item", () => import("@spectrum-web-components/menu/sp-menu-item.js")],
    ["sp-picker", () => import("@spectrum-web-components/picker/sp-picker.js")],
    ["sp-slider", () => import("@spectrum-web-components/slider/sp-slider.js")],
    ["sp-textfield", () => import("@spectrum-web-components/textfield/sp-textfield.js")],
];

function isAlreadyDefinedError(error) {
    const message = String((error && error.message) || error || "");
    return message.indexOf("already") !== -1 && message.indexOf("defined") !== -1;
}

function guardCustomElementDefine(registry) {
    const originalDefine = registry.define;

    try {
        registry.define = function defineSafely(tagName, elementClass, options) {
            if (registry.get(tagName)) {
                return undefined;
            }

            try {
                return originalDefine.call(registry, tagName, elementClass, options);
            } catch (error) {
                if (registry.get(tagName) || isAlreadyDefinedError(error)) {
                    return undefined;
                }

                throw error;
            }
        };
    } catch (error) {
        return () => {};
    }

    return () => {
        registry.define = originalDefine;
    };
}

export function registerSpectrumComponents() {
    if (typeof window === "undefined" || !window.customElements) {
        return Promise.resolve([]);
    }

    const registry = window.customElements;
    const restoreDefine = guardCustomElementDefine(registry);

    return Promise.all(
        componentRegistrations.map(([tagName, load]) => {
            if (registry.get(tagName)) {
                return Promise.resolve({ tagName, loaded: false, skipped: true });
            }

            return load()
                .then(() => ({ tagName, loaded: true, skipped: false }))
                .catch(error => {
                    if (registry.get(tagName) || isAlreadyDefinedError(error)) {
                        return { tagName, loaded: false, skipped: true };
                    }
                    throw error;
                });
        }),
    ).finally(restoreDefine);
}
