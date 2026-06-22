import { useEffect, useRef } from "react";

export function useNativeEvent(ref, eventName, handler) {
    const handlerRef = useRef(handler);
    handlerRef.current = handler;

    useEffect(() => {
        const node = ref.current;
        if (!node || typeof node.addEventListener !== "function") {
            return undefined;
        }

        const listener = (event) => handlerRef.current(event);
        node.addEventListener(eventName, listener);
        return () => node.removeEventListener(eventName, listener);
    }, [eventName, ref]);
}
