import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// lawfive.app's playable parts (SITE-1): pnpm build:site writes src/site/ to site/public/play/
// (not in git; Cloudflare Pages builds it). The website's styles are scoped to each part's element
// (data-lawfive), so they can't touch the site's own: :root, html and body become the element, and
// every other rule is kept to inside it. The site's content security policy allows only its own
// scripts and styles, so the CSS stays in files (no inline styles).

const scope = "[data-lawfive]";

function scoped(selector: string): string {
    const s = selector.trim();
    if (s === ":root" || s === "html" || s === "body" || s === "html, body") {
        return scope;
    }
    const top = /^(:root|html|body)(?=[\s.[:>]|$)/;
    if (top.test(s)) {
        return s.replace(top, scope);
    }
    return `${scope} ${s}`;
}

/** The little of PostCSS's rules this needs (PostCSS comes with Vite). */
interface CssRule {
    selectors: string[];
    parent?: { type: string; name?: string };
}

const scopeStyles = {
    postcssPlugin: "lawfive-scope",
    Once(root: { walkRules: (each: (rule: CssRule) => void) => void }) {
        root.walkRules((rule) => {
            const parent = rule.parent;
            if (parent?.type === "atrule" && /keyframes$/.test(parent.name ?? "")) {
                return;
            }
            rule.selectors = rule.selectors.map(scoped);
        });
    },
};

export default defineConfig({
    plugins: [react()],
    base: "/play/",
    publicDir: false,
    css: { postcss: { plugins: [scopeStyles] } },
    build: {
        outDir: "../site/public/play",
        emptyOutDir: true,
        assetsInlineLimit: 0,
        // The map library is most of it, and loads only with the replay.
        chunkSizeWarningLimit: 1200,
        rollupOptions: {
            input: "src/site/main.tsx",
            output: { entryFileNames: "site.js", chunkFileNames: "[name]-[hash].js", assetFileNames: "[name]-[hash][extname]" },
        },
    },
});
