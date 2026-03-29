import * as THREE from "three";
import type { ProductModelViewerCustomization, ProductOption, ResolvedMaterialTint } from "@/types";

/** Tint / material swatches (exclude bare “finish” so “Polished” options drive roughness, not hue). */
const COLOR_OPTION = /color|material|stone|tone|shade|variant|swatch|texture\s*type|granite|marble|limestone/i;
const DIMENSION_OPTION = /dimension|size|measure|length|width|area|panel/i;
const FINISH_OPTION = /\bfinish\b|sheen|polish|honed|matte|brushed|satin|gloss/i;

/** Parse "150 X 300 CM", "200x450", etc. */
export function parseDimensionPair(value: string): { a: number; b: number } | null {
    const normalized = value.replace(/,/g, ".").replace(/\s+/g, " ").trim();
    const m = normalized.match(/(\d+(?:\.\d+)?)\s*[x×X]\s*(\d+(?:\.\d+)?)/);
    if (!m) {
        return null;
    }
    return { a: parseFloat(m[1]), b: parseFloat(m[2]) };
}

function geomMean(pair: { a: number; b: number }): number {
    return Math.sqrt(Math.max(pair.a * pair.b, 1e-6));
}

/**
 * Scale vs first parsable value in the option list (baseline = 1).
 */
export function dimensionScaleFromSelection(selected: string, allValues: readonly string[]): number {
    const sel = parseDimensionPair(selected);
    if (!sel) {
        return 1;
    }
    const baseline =
        allValues.map((v) => parseDimensionPair(v)).find((p): p is { a: number; b: number } => p !== null) ?? sel;
    const gs = geomMean(sel);
    const gb = geomMean(baseline);
    if (gb <= 0) {
        return 1;
    }
    const ratio = gs / gb;
    return Math.min(2.25, Math.max(0.4, ratio));
}

/**
 * Stone / material swatches for 3D tint. Order matters: most specific patterns first
 * (e.g. "limestone green" before plain "limestone").
 */
const STONE_SWATCHES: readonly { pattern: RegExp; hex: string; blend: number }[] = [
    // Green limestones & green stones (gray-green sedimentary look, not neon)
    {
        pattern: /limestone\s*green|green\s*limestone|lime\s*stone\s*green|verde\s*indiana|verde\s*billiard/i,
        // Gray-green limestone / Connemara-style serpentine (muted, not neon).
        hex: "#6b8562",
        blend: 0.93
    },
    {
        pattern: /mint\s*green|seafoam|sage\s*stone|celadon/i,
        hex: "#7d9178",
        blend: 0.9
    },
    {
        pattern: /forest\s*green|emerald\s*granite|green\s*granite/i,
        hex: "#3d5248",
        blend: 0.9
    },

    // White / light marbles
    {
        pattern: /marble\s*white|white\s*marble|bianco|calacatta|statuario|carrara|thassos|arabescato|olympian\s*white/i,
        hex: "#eae8e3",
        blend: 0.9
    },

    // Black marbles & absolute blacks
    {
        pattern: /nero\s*marquina|marble\s*black|black\s*marble|absolute\s*black|nero\s*assoluto|jet\s*black\s*stone/i,
        hex: "#1a1c1b",
        blend: 0.92
    },

    // Named light granites (before generic “granite”)
    {
        pattern: /kashmir\s*white|alaska\s*white|white\s*granite|colonial\s*white|moon\s*white/i,
        hex: "#d6d4d0",
        blend: 0.88
    },
    {
        pattern: /blue\s*pearl|volga\s*blue|sapphire\s*blue|azul\s*platino|blue\s*granite/i,
        hex: "#4a5563",
        blend: 0.9
    },
    {
        pattern: /tan\s*brown|baltic\s*brown|baltic\s*red|brown\s*granite|tan\s*granite/i,
        hex: "#5c4e44",
        blend: 0.88
    },
    {
        pattern: /black\s*galaxy|star\s*galaxy|galaxy\s*black/i,
        hex: "#1e1e22",
        blend: 0.92
    },

    // Generic granite — cool gray with slight blue (typical showroom slab)
    { pattern: /\bgranite\b/i, hex: "#545860", blend: 0.9 },

    // Travertine & warm tans
    {
        pattern: /travertine|travertino|tuscany|noce\s*travertine/i,
        hex: "#c4b49a",
        blend: 0.88
    },

    // Plain limestone / lime stone (warm buff — only after “limestone green” variants)
    { pattern: /\blimestone\b|lime\s*stone|\bcaliza\b/i, hex: "#bfb0a0", blend: 0.86 },

    // Other greens / verde marbles
    {
        pattern: /\bverde\b|green\s*marble|marble\s*green|verde\s*marble|green\s*onyx/i,
        hex: "#5c6e56",
        blend: 0.9
    },

    { pattern: /charcoal|graphite|anthracite/i, hex: "#383a3f", blend: 0.9 },
    { pattern: /ivory|cream|bone|vanilla/i, hex: "#ede6db", blend: 0.86 },
    { pattern: /natural|sand|beige|taupe|buff/i, hex: "#c9bfb2", blend: 0.84 },
    { pattern: /slate|basalt/i, hex: "#454b52", blend: 0.88 },
    { pattern: /rosso|red\s*marble|terracotta|rosso\s*levanto|red\s*granite/i, hex: "#8f4e42", blend: 0.88 },
    { pattern: /blue\s*marble|azul|blue\s*stone(?!\s*pearl)/i, hex: "#4a5f78", blend: 0.88 },
    { pattern: /gold|golden|giallo|honey\s*onyx/i, hex: "#c4a574", blend: 0.82 },
    { pattern: /bronze|copper|brown\s*marble/i, hex: "#8b6045", blend: 0.85 }
];

/**
 * Map a listing option value to a preview tint. Compound names are matched before generic ones
 * so e.g. "LIMESTONE GREEN" resolves to green limestone, not beige limestone.
 */
export function valueToResolvedMaterialTint(value: string): ResolvedMaterialTint {
    const v = value.trim();
    const hexDirect = v.match(/#([0-9a-f]{3}|[0-9a-f]{6})\b/i);
    if (hexDirect) {
        let h = hexDirect[0];
        if (h.length === 4) {
            h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
        }
        return { hex: h.toLowerCase(), blend: 0.94 };
    }

    for (const { pattern, hex, blend } of STONE_SWATCHES) {
        if (pattern.test(v)) {
            return { hex, blend };
        }
    }

    let hash = 0;
    for (let i = 0; i < v.length; i++) {
        hash = v.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = (Math.abs(hash) % 360) / 360;
    const c = new THREE.Color();
    c.setHSL(hue, 0.32, 0.5);
    return { hex: `#${c.getHexString()}`, blend: 0.55 };
}

/** @deprecated Prefer valueToResolvedMaterialTint — kept for tests / callers needing hex only. */
export function valueToTintHex(value: string): string {
    return valueToResolvedMaterialTint(value).hex;
}

export function valueToFinishRoughnessMultiplier(value: string): number | undefined {
    const v = value.trim().toLowerCase();
    if (/polish|gloss|mirror|shiny/.test(v)) {
        return 0.5;
    }
    if (/hone|matte|satin|soft/.test(v)) {
        return 1.25;
    }
    if (/brush|leather|textured|rough/.test(v)) {
        return 0.85;
    }
    return undefined;
}

/**
 * Maps current option selections to 3D viewer parameters.
 */
export function buildProductModelViewerCustomization(
    options: ProductOption[],
    selectedSpecs: Record<string, string>
): ProductModelViewerCustomization {
    let materialTintHex: string | undefined;
    let materialTintBlend: number | undefined;
    let scaleUniform = 1;
    let finishRoughnessMultiplier: number | undefined;

    for (const opt of options) {
        const raw = selectedSpecs[opt.id]?.trim();
        if (!raw) {
            continue;
        }
        const name = opt.name;

        if (DIMENSION_OPTION.test(name)) {
            scaleUniform *= dimensionScaleFromSelection(raw, opt.values);
        }

        if (FINISH_OPTION.test(name)) {
            const m = valueToFinishRoughnessMultiplier(raw);
            if (m !== undefined) {
                finishRoughnessMultiplier = m;
            }
        }

        if (COLOR_OPTION.test(name) && !DIMENSION_OPTION.test(name)) {
            if (!parseDimensionPair(raw)) {
                const resolved = valueToResolvedMaterialTint(raw);
                materialTintHex = resolved.hex;
                materialTintBlend = resolved.blend;
            }
        }
    }

    return {
        materialTintHex,
        materialTintBlend,
        scaleUniform,
        finishRoughnessMultiplier
    };
}
