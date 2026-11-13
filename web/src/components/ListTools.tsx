import { useSearchParams } from "react-router";
import { type ListSort, listSorts } from "../search.ts";
import { Icon } from "./ui.tsx";

// Search and sort for the venue, referee, competition and template lists, kept in the address
// (?q=…&sort=…) so going back to the list keeps them. Most matches first unless chosen otherwise.

export function useListTools() {
    const [params, setParams] = useSearchParams();
    const query = params.get("q") ?? "";
    const sort = (listSorts.find(([key]) => key === params.get("sort"))?.[0] ?? "matches-desc") as ListSort;
    const set = (key: string, value: string | undefined) => setParams((current) => {
        const next = new URLSearchParams(current);
        if (value) {
            next.set(key, value);
        } else {
            next.delete(key);
        }
        return next;
    }, { replace: true });
    return { query, sort, setQuery: (q: string) => set("q", q || undefined), setSort: (s: ListSort) => set("sort", s === "matches-desc" ? undefined : s) };
}

export function ListTools({ tools, placeholder, label }: { tools: ReturnType<typeof useListTools>; placeholder: string; label: string }) {
    return (
        <div className="list-tools list-tools-gap">
            <label className="search">
                <Icon name="search" size={17} />
                <input type="search" value={tools.query} placeholder={placeholder} aria-label={`Search ${label}`} onChange={(e) => tools.setQuery(e.target.value)} />
                {tools.query && <button type="button" className="search-clear" aria-label="Clear the search" onClick={() => tools.setQuery("")}><Icon name="close" size={15} /></button>}
            </label>
            <select className="input sort-select" value={tools.sort} aria-label={`Sort ${label}`} onChange={(e) => tools.setSort(e.target.value as ListSort)}>
                {listSorts.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
            </select>
        </div>
    );
}
