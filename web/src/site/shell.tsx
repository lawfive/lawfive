import "../styles.css";
import "./site.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ScreenSetup, WatchScreen, defaultScreen, savedScreen, screenSetup } from "@lawfive/schema";
import { type ReactNode, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { PortalContainer } from "../components/ui.tsx";

// What every playable part on lawfive.app shares (SITE-1, SITE-9): the website's own styles, in its
// Pitch & Scoreboard look (WEB-24), scoped to the part's element at build (vite.site.config.ts), with
// site.css's few changes for sitting on the site's grass; and React with no server behind it. The
// fonts are the site's own (site/public/styles.css: Barlow, Barlow Condensed and JetBrains Mono, the
// weights the website loads), so the parts bring none.

const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
// The map the website uses by default, OpenFreeMap's, which needs no key (the server's /v1/meta).
client.setQueryData(["meta"], {
    maps: {
        style: {
            url: "https://tiles.openfreemap.org/styles/liberty",
            darkUrl: "https://tiles.openfreemap.org/styles/dark",
            attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        },
    },
});

/** Puts a part in place of the page's picture. */
export function render(el: HTMLElement, part: ReactNode) {
    el.replaceChildren();
    el.classList.add("lf-live");
    createRoot(el).render(
        <StrictMode>
            <QueryClientProvider client={client}>
                <MemoryRouter>
                    <PortalContainer.Provider value={el}>{part}</PortalContainer.Provider>
                </MemoryRouter>
            </QueryClientProvider>
        </StrictMode>,
    );
}

const screenKey = "lawfive.screen";

/** The visitor's match screen, kept in their browser between the setup and Try a match; nothing leaves it. */
export function storedScreen(): { screen: ScreenSetup; step: number } {
    try {
        const kept = JSON.parse(localStorage.getItem(screenKey) ?? "null") as { screen?: ScreenSetup; step?: number } | null;
        const saved = kept?.screen && WatchScreen.safeParse(savedScreen(kept.screen, new Date(0).toISOString()));
        if (saved?.success) {
            return { screen: screenSetup(saved.data), step: Math.min(Math.max(kept?.step ?? 0, 0), 4) };
        }
    } catch {
        // Storage can be unavailable (private windows), or hold something else: start from the default.
    }
    return { screen: defaultScreen, step: 0 };
}

export function storeScreen(screen: ScreenSetup, step: number) {
    try {
        localStorage.setItem(screenKey, JSON.stringify({ screen, step }));
    } catch {
        // Not remembered, then.
    }
}

/** The hosted web app, where an account's match screen is saved. */
export const appUrl = "https://app.lawfive.app";
