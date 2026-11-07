import { describe, it, expect } from 'vitest';
import { SCAN_FRAME, frameCrop } from '../scanFrame.js';

const half = { left: 0.25, top: 0.25, width: 0.5, height: 0.5 };

describe('Ausschnitt des Zielrahmens', () => {
    it('rechnet die Vorschaugrösse auf die Videogrösse um', () => {
        expect(frameCrop(640, 480, 320, 240, half)).toEqual({ x: 160, y: 120, width: 320, height: 240 });
    });

    it('berücksichtigt, was oben und unten abgeschnitten wird (Handy hochkant)', () => {
        // 720x1280 in 400x300: Breite passt, von der Höhe sind nur die mittleren 540 px sichtbar
        expect(frameCrop(720, 1280, 400, 300, half)).toEqual({ x: 180, y: 505, width: 360, height: 270 });
    });

    it('berücksichtigt, was links und rechts abgeschnitten wird (Handy quer)', () => {
        // 1280x720 in 400x300: Höhe passt, von der Breite sind nur die mittleren 960 px sichtbar
        expect(frameCrop(1280, 720, 400, 300, half)).toEqual({ x: 400, y: 180, width: 480, height: 360 });
    });

    it('bleibt immer innerhalb des Videos', () => {
        for (const [w, h] of [[640, 480], [720, 1280], [1280, 720], [1920, 1080], [1080, 1920]]) {
            for (const [vw, vh] of [[334, 250], [456, 164], [320, 240]]) {
                const r = frameCrop(w, h, vw, vh);
                expect(r.x).toBeGreaterThanOrEqual(0);
                expect(r.y).toBeGreaterThanOrEqual(0);
                expect(r.x + r.width).toBeLessThanOrEqual(w);
                expect(r.y + r.height).toBeLessThanOrEqual(h);
            }
        }
    });

    it('der Rahmen liegt mittig in der Vorschau', () => {
        expect(SCAN_FRAME.left * 2 + SCAN_FRAME.width).toBeCloseTo(1);
        expect(SCAN_FRAME.top * 2 + SCAN_FRAME.height).toBeCloseTo(1);
    });
});
