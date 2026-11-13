import { type ImportColumn, importColumns, importColumnsNote } from "@lawfive/schema";
import { Icon, PageHead } from "../components/ui.tsx";
import { examples } from "./Import.tsx";

// The column guide for importing matches (IMP-9): every column, what it's for, how to write it, an
// example, and which a new match needs. Opened in its own tab from the import dialog, to keep open
// beside a spreadsheet; the same list is the Excel example's Columns sheet.

export function ImportColumns() {
    return (
        <>
            <PageHead
                title="Import columns"
                sub="What each column in a file of matches is for, and how to fill it in. Use the headings below, in any case or spacing (home_colour and homeColour work too); leave out any you don't need."
                back={{ to: "/matches", label: "Matches" }}
            />
            <div className="import-examples">
                <span className="muted">Example files:</span>
                {examples.map((e) => <a key={e.label} className="btn btn-sm" href={e.href} download><Icon name={e.icon} />{e.label}</a>)}
            </div>
            <div className="card guide">
                <table className="guide-table">
                    <thead>
                        <tr><th>Column</th><th>What it's for</th><th>Example</th><th>Needed</th></tr>
                    </thead>
                    <tbody>
                        {(importColumns as readonly ImportColumn[]).map((c) => (
                            <tr key={c.id}>
                                <th scope="row">
                                    <span className="guide-name">{c.header}</span>
                                    <code>{c.json}</code>
                                </th>
                                <td>{c.about}</td>
                                <td className="guide-example">{c.example}</td>
                                <td>{c.newMatch ? <span className="chip chip-brand">New matches*</span> : <span className="muted">Optional</span>}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="muted guide-note">* {importColumnsNote} In JSON, use the keys shown under each heading.</p>
        </>
    );
}
