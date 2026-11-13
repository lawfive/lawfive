// Code blocks in LawFive's colors (DESIGN.md: the tokens, as src/styles/lawfive.css has them): a
// well on the chalk page by day and on the dark slab at night, keywords in pitch green, strings in
// the notices' blue, numbers in their amber (never the cards' yellow or red), comments muted. Every
// color is 4.5:1 or more on its well; Expressive Code also lifts any that fall under 5.5:1. They're
// plain objects, not ExpressiveCodeTheme instances: each build pass then makes its own, and the
// pages and the stylesheet they link to agree.
const theme = (name, type, c) =>
    ({
        name,
        type,
        colors: {
            "editor.background": c.well,
            "editor.foreground": c.text,
            "editor.selectionBackground": c.selection,
            "titleBar.activeBackground": c.board,
            "titleBar.activeForeground": c.onBoard,
            "titleBar.border": c.board,
            "editorGroupHeader.tabsBackground": c.board,
            "editorGroupHeader.tabsBorder": c.board,
            "tab.activeBackground": c.well,
            "tab.activeForeground": c.text,
            "tab.activeBorder": "#00000000",
            "tab.activeBorderTop": c.mint,
            "tab.inactiveForeground": c.onBoard,
            "scrollbarSlider.background": c.selection,
            "scrollbarSlider.hoverBackground": c.muted,
        },
        tokenColors: [
            { settings: { foreground: c.text } },
            { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: c.muted } },
            {
                scope: ["keyword", "storage", "storage.type", "keyword.operator.new", "support.function.builtin", "entity.name.function.shell"],
                settings: { foreground: c.brand },
            },
            { scope: ["string", "string.quoted", "punctuation.definition.string", "markup.inline.raw"], settings: { foreground: c.blue } },
            { scope: ["constant.numeric", "constant.language", "constant.character", "variable.other.constant"], settings: { foreground: c.amber } },
            {
                scope: ["support.type.property-name", "entity.name.tag", "entity.other.attribute-name", "meta.object-literal.key", "variable.other.property"],
                settings: { foreground: c.brand },
            },
            { scope: ["entity.name.function", "support.function", "meta.function-call"], settings: { foreground: c.strong } },
            { scope: ["variable.parameter", "variable.other.readwrite"], settings: { foreground: c.text } },
            { scope: ["punctuation", "meta.brace"], settings: { foreground: c.text } },
            { scope: ["markup.heading", "markup.bold"], settings: { foreground: c.strong, fontStyle: "bold" } },
            { scope: ["markup.italic"], settings: { fontStyle: "italic" } },
            { scope: ["markup.inserted"], settings: { foreground: c.brand } },
            { scope: ["markup.deleted", "invalid"], settings: { foreground: c.red } },
        ],
    });

// Light: --panel-2 under --ink, as a well on a chalk panel.
export const lawfiveLight = theme("lawfive-light", "light", {
    well: "#e9e7dc", text: "#0e1311", strong: "#0e1311", muted: "#4d5650", selection: "#d6d4c8",
    brand: "#0b6b47", blue: "#1a5699", amber: "#6f5400", red: "#b8232a",
    board: "#0b0e0d", onBoard: "#b6bfba", mint: "#2fae7a",
});

// Dark: --ink-field at a night match, a little darker than the slab around it.
export const lawfiveDark = theme("lawfive-dark", "dark", {
    well: "#0b130f", text: "#e6e9e3", strong: "#ffffff", muted: "#a3aea7", selection: "#26332c",
    brand: "#5cc999", blue: "#8ab8ea", amber: "#f0cd5a", red: "#ff8589",
    board: "#121614", onBoard: "#a7b1ab", mint: "#2fae7a",
});
