import { useEffect } from "react";

export function useInjectedStyle(id, cssText) {
    useEffect(() => {
        if (!id || !cssText || typeof document === "undefined") {
            return;
        }

        let styleElement = document.getElementById(id);
        if (!styleElement) {
            styleElement = document.createElement("style");
            styleElement.id = id;
            styleElement.textContent = cssText;

            const target = document.head || document.body || document.documentElement;
            if (target) {
                target.appendChild(styleElement);
            }
        }
    }, [id, cssText]);
}
