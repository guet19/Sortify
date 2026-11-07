// Zielrahmen der Kamera-Vorschau, als Anteil der Vorschau. Gelesen wird nur, was darin liegt.
export const SCAN_FRAME = { left: 0.1, top: 0.2, width: 0.8, height: 0.6 };

// Welcher Ausschnitt des Videos liegt im Rahmen? Die Vorschau füllt ihre Fläche (object-fit: cover) und
// schneidet das Video dabei je nach Format oben/unten oder links/rechts ab. Handys liefern im
// Hochformat ein hochkant stehendes Video, die Vorschau ist aber breiter als hoch.
export function frameCrop(videoWidth, videoHeight, viewWidth, viewHeight, frame = SCAN_FRAME) {
    const scale = Math.max(viewWidth / videoWidth, viewHeight / videoHeight);
    const cutX = (videoWidth * scale - viewWidth) / 2;
    const cutY = (videoHeight * scale - viewHeight) / 2;
    return {
        x: Math.round((cutX + frame.left * viewWidth) / scale),
        y: Math.round((cutY + frame.top * viewHeight) / scale),
        width: Math.round((frame.width * viewWidth) / scale),
        height: Math.round((frame.height * viewHeight) / scale)
    };
}
