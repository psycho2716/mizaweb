import { GoogleGenAI } from "@google/genai";
import { env } from "../../config/env";

function getGeminiClient(): GoogleGenAI {
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not configured on the server");
    }
    return new GoogleGenAI({ apiKey });
}

export async function generateBuyerGuidance(prompt: string): Promise<string> {
    const client = getGeminiClient();

    const model = env.GEMINI_MODEL ?? "gemini-3-flash-preview";

    const response = await client.models.generateContent({
        model,
        // The client-side prompt already contains structure/instructions.
        contents: prompt
    });

    // Library response shape can differ by version; handle both property and method.
    const anyResponse = response as unknown as { text?: string | (() => string) };
    if (typeof anyResponse.text === "function") {
        return anyResponse.text().trim();
    }
    if (typeof anyResponse.text === "string") {
        return anyResponse.text.trim();
    }

    // Fallback to stringifying the response if text extraction fails.
    return JSON.stringify(response, null, 2).slice(0, 4000);
}

