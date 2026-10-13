// Macht aus dem Browser-Kennzeichen (User-Agent) eine lesbare Gerätebezeichnung, z.B. "Chrome auf Windows"
export function describeUserAgent(ua) {
    if (!ua) return 'Unbekanntes Gerät';
    const os = /iPhone/.test(ua) ? 'iPhone'
        : /iPad/.test(ua) ? 'iPad'
        : /Android/.test(ua) ? 'Android'
        : /Raspbian|armv7l|aarch64.*Linux/.test(ua) ? 'Raspberry Pi'
        : /Mac OS X|Macintosh/.test(ua) ? 'Mac'
        : /Windows/.test(ua) ? 'Windows'
        : /Linux/.test(ua) ? 'Linux' : 'Unbekanntes System';
    const browser = /Edg\//.test(ua) ? 'Edge'
        : /OPR\/|Opera/.test(ua) ? 'Opera'
        : /Firefox\//.test(ua) ? 'Firefox'
        : /Chrome\//.test(ua) ? 'Chrome'
        : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    return `${browser} auf ${os}`;
}
