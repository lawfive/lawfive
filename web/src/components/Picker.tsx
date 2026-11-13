import { useContext, useEffect, useRef, useState } from "react";
import { Button, ComboBox, ComboBoxStateContext, Input, ListBox, ListBoxItem, Popover } from "react-aria-components";
import { fold } from "../search.ts";
import { Icon } from "./ui.tsx";

// A searchable list for picking a related record (a venue, competition, referee, template): type
// to filter, pick with the mouse, touch or keyboard. Optionally offers to create a new record
// from what was typed, or to use the text as is (a crew member who isn't a saved referee).

export interface PickerItem {
    id: string;
    name: string;
    detail?: string;
    /** Other names it's found by (a referee's, DUP-6); the one that matched is shown under it. */
    also?: string[];
}

interface PickerProps {
    label: string;
    items: PickerItem[];
    value: string | undefined;
    onChange: (id: string | undefined) => void;
    placeholder?: string;
    /** "New venue", shown as `New venue "<typed text>"`. */
    createLabel?: string;
    onCreate?: (text: string) => void;
    /** Offer the typed text itself, for example `Just a name: "<typed text>"`. */
    textLabel?: string;
    onUseText?: (text: string) => void;
    /** For a picker that runs an action rather than holding a value ("Fill from a template"): empty again after each pick. */
    clearAfterPick?: boolean;
    /** False for a value that must always be set (no clear button). */
    clearable?: boolean;
}

export function Picker({ label, items, value, onChange, placeholder, createLabel, onCreate, textLabel, onUseText, clearAfterPick, clearable = true }: PickerProps) {
    // When the selection changes from outside (a record just created from this picker, the list
    // loading, Clear), the combo box is started afresh to show the new name. Setting its text
    // directly instead would look like typing and pop the list open.
    const selectedName = items.find((i) => i.id === value)?.name ?? "";
    const [typed, setTyped] = useState(selectedName);
    const [generation, setGeneration] = useState(0);
    const shown = useRef(selectedName);
    useEffect(() => {
        if (selectedName !== shown.current) {
            shown.current = selectedName;
            setTyped(selectedName);
            setGeneration((g) => g + 1);
        }
    }, [selectedName]);
    const hasActions = Boolean(onCreate || onUseText);
    // Filtered here rather than by the combo box, so other names count; the selected name shown
    // in the box isn't a search, so it shows everything.
    const query = fold(typed.trim());
    const filtered = !query || typed === selectedName ? items : items.flatMap((item) => {
        if (fold(item.name).includes(query)) {
            return [item];
        }
        const other = item.also?.find((name) => fold(name).includes(query));
        return other ? [{ ...item, detail: `Also ${other}${item.detail ? ` · ${item.detail}` : ""}` }] : [];
    });
    return (
        <ComboBox
            key={generation}
            aria-label={label}
            className="picker"
            items={filtered}
            selectedKey={value ?? null}
            onSelectionChange={(key) => {
                if (clearAfterPick) {
                    if (key !== null) {
                        setTyped("");
                        setGeneration((g) => g + 1);
                        onChange(String(key));
                    }
                    return;
                }
                // Picked here: the combo box already shows the name.
                shown.current = items.find((i) => i.id === key)?.name ?? "";
                onChange(key === null ? undefined : String(key));
            }}
            onInputChange={setTyped}
            menuTrigger="focus"
            allowsEmptyCollection={hasActions}
        >
            <div className="picker-field">
                <PickerInput placeholder={placeholder ?? "Search…"} />
                {value && clearable && (
                    <Button className="picker-clear" aria-label={`Clear ${label}`} onPress={() => onChange(undefined)}><Icon name="close" size={15} /></Button>
                )}
                <Button className="picker-button" aria-label={`Show ${label} choices`}><Icon name="chevron" size={16} /></Button>
            </div>
            <Popover className="picker-popover" offset={4}>
                <ListBox<PickerItem> className="picker-list" renderEmptyState={() => <div className="picker-empty">No matches</div>}>
                    {(item) => (
                        <ListBoxItem id={item.id} textValue={item.name} className="picker-item">
                            <span>{item.name}</span>
                            {item.detail && <small>{item.detail}</small>}
                        </ListBoxItem>
                    )}
                </ListBox>
                {hasActions && (
                    <PickerActions typed={typed} items={items} value={value}
                        createLabel={createLabel} onCreate={onCreate} textLabel={textLabel} onUseText={onUseText} />
                )}
            </Popover>
        </ComboBox>
    );
}

/**
 * The text box. Focusing it opens the list; a click when it already had focus (after picking, or
 * after closing the list with Escape) opens it again. Only then: opening it twice on the first
 * click could lose a letter typed straight away.
 */
function PickerInput({ placeholder }: { placeholder: string }) {
    const state = useContext(ComboBoxStateContext);
    const hadFocus = useRef(false);
    return (
        <Input className="input" placeholder={placeholder}
            onPointerDown={(e) => { hadFocus.current = document.activeElement === e.currentTarget; }}
            onClick={() => { if (hadFocus.current && state && !state.isOpen) state.open(null, "manual"); }} />
    );
}

/** "New venue …" and "Just a name …" at the foot of the list. */
function PickerActions({ typed, items, value, createLabel, onCreate, textLabel, onUseText }: Pick<PickerProps, "items" | "value" | "createLabel" | "onCreate" | "textLabel" | "onUseText"> & { typed: string }) {
    const state = useContext(ComboBoxStateContext);
    // While a record is selected the box shows its name; that isn't a search.
    const selectedName = items.find((i) => i.id === value)?.name;
    const text = typed.trim() === selectedName ? "" : typed.trim();
    const exact = items.some((i) => i.name.toLowerCase() === text.toLowerCase());
    const run = (action: (text: string) => void) => {
        state?.close();
        action(text);
    };
    return (
        <div className="picker-actions">
            {onCreate && (
                <Button className="picker-action" onPress={() => run(onCreate)}>
                    <Icon name="plus" size={15} />
                    {text && !exact ? <>{createLabel ?? "New"} “{text}”</> : <>{createLabel ?? "New"}…</>}
                </Button>
            )}
            {onUseText && text && !exact && (
                <Button className="picker-action" onPress={() => run(onUseText)}>
                    <Icon name="edit" size={15} />{textLabel ?? "Use"} “{text}”
                </Button>
            )}
        </div>
    );
}
