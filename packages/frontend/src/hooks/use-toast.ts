import * as React from "react";
import type { ToastProps } from "@/components/ui/toast";

type ToasterToast = ToastProps & {
    id: string;
    title?: React.ReactNode;
    description?: React.ReactNode;
};

let count = 0;
const genId = () => (++count % Number.MAX_SAFE_INTEGER).toString();
const REMOVE_DELAY = 4000;

const listeners: Array<(state: { toasts: ToasterToast[] }) => void> = [];
let memoryState: { toasts: ToasterToast[] } = { toasts: [] };

function dispatch(action: { type: "ADD" | "REMOVE"; toast?: ToasterToast; id?: string }) {
    if (action.type === "ADD") {
        memoryState = { toasts: [action.toast!, ...memoryState.toasts].slice(0, 3) };
    } else {
        memoryState = { toasts: memoryState.toasts.filter((t) => t.id !== action.id) };
    }
    listeners.forEach((l) => l(memoryState));
}

export function toast(props: Omit<ToasterToast, "id">) {
    const id = genId();
    dispatch({ type: "ADD", toast: { ...props, id } });
    setTimeout(() => dispatch({ type: "REMOVE", id }), REMOVE_DELAY);
}

export function useToast() {
    const [state, setState] = React.useState(memoryState);
    React.useEffect(() => {
        listeners.push(setState);
        return () => {
            const i = listeners.indexOf(setState);
            if (i > -1) listeners.splice(i, 1);
        };
    }, []);
    return { ...state, toast, dismiss: (id: string) => dispatch({ type: "REMOVE", id }) };
}
