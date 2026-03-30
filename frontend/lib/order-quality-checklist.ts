import type { OrderQualityChecklist, OrderQualityChecklistItem } from "@/types";

/** Stable ids for the three default rows (legacy DB rows map here when loaded). */
export const DEFAULT_QUALITY_CHECKLIST_LINES: readonly { id: string; label: string }[] = [
    { id: "miza-qc-default-listing", label: "Item matches listing photos and description" },
    { id: "miza-qc-default-packing", label: "Packing protects edges and corners" },
    { id: "miza-qc-default-order-id", label: "Label or note includes order ID" }
] as const;

export const QUALITY_CHECKLIST_MAX_ITEMS = 30;

export function emptyQualityChecklist(): OrderQualityChecklist {
    return {
        items: DEFAULT_QUALITY_CHECKLIST_LINES.map(({ id, label }) => ({
            id,
            label,
            checked: false
        }))
    };
}

export function newQualityChecklistItem(partialLabel = ""): OrderQualityChecklistItem {
    const id =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? `miza-qc-custom-${crypto.randomUUID()}`
            : `miza-qc-custom-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return { id, label: partialLabel, checked: false };
}

/** True when every row has non-empty trimmed text and is checked (confirm gate). */
export function isQualityChecklistCompleteForConfirm(q: OrderQualityChecklist): boolean {
    return (
        q.items.length > 0 &&
        q.items.length <= QUALITY_CHECKLIST_MAX_ITEMS &&
        q.items.every((i) => i.label.trim().length > 0 && i.checked)
    );
}
