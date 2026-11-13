import { readFileSync } from "node:fs";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import { lawfiveDark, lawfiveLight } from "./src/code-themes.mjs";

// The docs stay out of search engines, with a banner, until the code is public. Set DOCS_PUBLIC=true
// in the Cloudflare Pages project to lift both (see README.md).
const live = process.env.DOCS_PUBLIC === "true";
const repo = "https://github.com/lawfive/lawfive";

// DESIGN.md: Phosphor icons only. Starlight's own icons are swapped by name, and a few are added for
// the cards. Its icon component draws on a 24 unit grid, and Phosphor's on 256.
const phosphor = (name) => {
    const svg = readFileSync(new URL(`node_modules/@phosphor-icons/core/assets/regular/${name}.svg`, import.meta.url), "utf8");
    return `<g transform="scale(.09375)">${svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "")}</g>`;
};
const icons = {
    close: "x", bars: "list", magnifier: "magnifying-glass", sun: "sun", moon: "moon", laptop: "laptop",
    pencil: "pencil-simple", translate: "translate", sidebar: "sidebar-simple", "right-sidebar": "sidebar-simple",
    "right-arrow": "arrow-right", "left-arrow": "arrow-left", "right-caret": "caret-right", "left-caret": "caret-left",
    "down-caret": "caret-down", "up-caret": "caret-up", warning: "warning", error: "warning-octagon",
    information: "info", rocket: "lightbulb", external: "arrow-square-out", github: "github-logo",
    server: "hard-drives", plug: "plug", code: "code", branch: "git-branch", watch: "watch",
};
const iconOverrides = Object.fromEntries(Object.entries(icons).map(([name, file]) => [name, phosphor(file)]));
const phosphorIcons = {
    name: "lawfive-phosphor-icons",
    enforce: "pre",
    transform(code, id) {
        if (!id.split("?")[0].endsWith("components-internals/Icons.js")) return;
        return `${code}\nObject.assign(Icons, ${JSON.stringify(iconOverrides)});`;
    },
};
const maskIcon = (name) => {
    const svg = readFileSync(new URL(`node_modules/@phosphor-icons/core/assets/regular/${name}.svg`, import.meta.url), "utf8");
    return `url("data:image/svg+xml,${encodeURIComponent(svg.replace('fill="currentColor"', 'fill="black"'))}")`;
};

export default defineConfig({
    site: "https://lawfive.dev",
    vite: { plugins: [phosphorIcons] },
    integrations: [
        starlight({
            title: "LawFive docs",
            description: "Run your own LawFive server, connect the apps and watches, use the API, and build LawFive from source.",
            // The L5 mark on the board (WEB-25), copies of web/public's, the same in light and dark: the
            // SVG, the .ico for browsers without SVG icons (a fixed size, as "any" makes Chromium browsers
            // pick the .ico) and the home-screen icon. The phone's bars take the board, as the website's.
            favicon: "/icon.svg",
            head: [
                { tag: "link", attrs: { rel: "icon", href: "/favicon.ico", sizes: "32x32" } },
                { tag: "link", attrs: { rel: "apple-touch-icon", href: "/apple-touch-icon.png" } },
                { tag: "meta", attrs: { name: "theme-color", media: "(prefers-color-scheme: light)", content: "#0b0e0d" } },
                { tag: "meta", attrs: { name: "theme-color", media: "(prefers-color-scheme: dark)", content: "#121614" } },
                ...(live ? [] : [{ tag: "meta", attrs: { name: "robots", content: "noindex" } }]),
            ],
            social: [{ icon: "github", label: "GitHub", href: repo }],
            editLink: { baseUrl: `${repo}/edit/main/docs-site/` },
            lastUpdated: false,
            customCss: [
                "@fontsource/barlow/400.css",
                "@fontsource/barlow/500.css",
                "@fontsource/barlow/600.css",
                "@fontsource/barlow/700.css",
                "@fontsource/barlow-condensed/700.css",
                "@fontsource/barlow-condensed/800.css",
                "@fontsource/barlow-condensed/800-italic.css",
                "@fontsource/barlow-condensed/900-italic.css",
                "@fontsource/jetbrains-mono/400.css",
                "@fontsource/jetbrains-mono/700.css",
                "./src/styles/lawfive.css",
            ],
            components: {
                Banner: "./src/components/Banner.astro",
                Hero: "./src/components/Hero.astro",
                SiteTitle: "./src/components/SiteTitle.astro",
            },
            expressiveCode: {
                // A dark and a light theme, which follow Starlight's switch (src/code-themes.mjs).
                themes: [lawfiveDark, lawfiveLight],
                styleOverrides: {
                    codeFontFamily: '"JetBrains Mono", ui-monospace, Menlo, monospace',
                    uiFontFamily: '"Barlow", "Helvetica Neue", sans-serif',
                    borderRadius: "6px",
                    borderColor: "var(--lf-ink-border)",
                    frames: {
                        copyIcon: maskIcon("copy"),
                        frameBoxShadowCssValue: "none",
                        // A terminal's title bar is a strip of the stadium board.
                        terminalTitlebarDotsForeground: "var(--lf-on-board-dim)",
                        terminalTitlebarDotsOpacity: "1",
                        terminalTitlebarBorderBottomColor: "transparent",
                        inlineButtonForeground: "var(--sl-color-text)",
                        inlineButtonBorder: "var(--lf-ink-border)",
                        tooltipSuccessBackground: "var(--lf-brand)",
                        tooltipSuccessForeground: "var(--lf-on-brand)",
                    },
                },
            },
            sidebar: [
                {
                    label: "Run a server",
                    items: [
                        { slug: "run/requirements" },
                        { slug: "run/install" },
                        { slug: "run/first-run" },
                        { slug: "run/https" },
                        { slug: "run/people" },
                        { slug: "run/responsibilities" },
                        { slug: "run/settings" },
                        { slug: "run/services" },
                        { slug: "run/notifications" },
                        { slug: "run/backups" },
                        { slug: "run/upgrades" },
                        { slug: "run/troubleshooting" },
                    ],
                },
                { label: "Connect apps and watches", items: [{ slug: "apps/phones" }, { slug: "apps/watches" }] },
                {
                    label: "Use the API",
                    items: [{ slug: "api/overview" }, { slug: "api/keys" }, { slug: "api/webhooks" }, { slug: "api/sync" }, { slug: "api/examples" }, { slug: "api/reference" }],
                },
                {
                    label: "Contribute",
                    items: [
                        { slug: "contribute/overview" },
                        { slug: "contribute/architecture" },
                        { slug: "contribute/server-web" },
                        { slug: "contribute/garmin" },
                        { slug: "contribute/android" },
                        { slug: "contribute/iphone" },
                        { slug: "contribute/relay" },
                        { slug: "contribute/license-security" },
                    ],
                },
            ],
        }),
    ],
});
