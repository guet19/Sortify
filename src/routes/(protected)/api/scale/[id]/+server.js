import { json } from '@sveltejs/kit';
import db from '$lib/server/db.js';

export async function GET({ params }) {
    try {
        const request = await db.getScaleRequest(params.id);
        if (!request) {
            return json({ error: 'Request not found' }, { status: 404 });
        }
        return json(request);
    } catch (error) {
        return json({ error: 'Database error' }, { status: 500 });
    }
}