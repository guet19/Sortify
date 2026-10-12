import { json } from '@sveltejs/kit';
import { getCurrentAiModel } from '$lib/server/gemini.js';

// Welches KI-Modell gerade verwendet würde (Anzeige vor einer KI-Aktion)
export async function GET() {
    return json({ aiModel: await getCurrentAiModel() });
}
