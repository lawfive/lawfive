/**
 * A new random ID (a version 4 UUID) for something made in the browser. Browsers only offer
 * `crypto.randomUUID` on HTTPS or localhost, and a self-hosted server can be reached over plain HTTP
 * on its network address, so without it the ID is made from `crypto.getRandomValues`, which is there
 * on any page.
 */
export function newId(): string {
    if (typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const hex = [...b].map((n) => n.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
