// Names as they're compared, so "José Núñez" and "jose nunez" are one name: by the server's
// duplicate finder and merges (DUP-2), imports (IMP-4), and the web app's counts and searches.

/** A name as it's compared: no accents, punctuation or case, single spaces. */
export function normaliseName(name: string): string {
    return name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
