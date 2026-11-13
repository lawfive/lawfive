import { useState } from "react";
import { type Place, geocode, useMeta } from "../api.ts";

// Looking up a venue's address and placing it on the map: the venue form's Find on map, and (WEB-12)
// the new venue made from the match form, which does the same so its forecast and directions
// work from the start.

export interface AddressLookUp {
    /** Whether this server has an address search (ADM-1). */
    available: boolean;
    looking: boolean;
    /** The places found, while there's more than one to choose from (or none). */
    found?: Place[];
    error?: string;
    /** Looks the address up; one place found is chosen straight away. Says what it chose, if anything. */
    lookUp: (address: string) => Promise<Place | undefined>;
    choose: (place: Place) => void;
    clear: () => void;
}

/** The address search, choosing for itself when it finds one place; `onChoose` places the venue. */
export function useAddressLookUp(onChoose: (place: Place) => void): AddressLookUp {
    const meta = useMeta();
    const [found, setFound] = useState<Place[]>();
    const [looking, setLooking] = useState(false);
    const [error, setError] = useState<string>();
    const choose = (place: Place) => {
        onChoose(place);
        setFound(undefined);
    };
    const lookUp = async (address: string) => {
        setLooking(true);
        setError(undefined);
        try {
            // The same place can come back twice under one name, a few meters apart; it's offered once.
            const places = (await geocode(address)).filter((p, i, all) =>
                all.findIndex((q) => q.name === p.name && Math.abs(q.lat - p.lat) < 0.002 && Math.abs(q.lon - p.lon) < 0.002) === i);
            if (places.length === 1) {
                choose(places[0]);
                return places[0];
            }
            setFound(places);
            return undefined;
        } catch (e) {
            // PLAN-11: the plan's searches for today, or the service not answering; the pin still works.
            setFound(undefined);
            setError(e instanceof Error ? e.message : "The address search didn't answer.");
            return undefined;
        } finally {
            setLooking(false);
        }
    };
    return {
        available: meta.data?.capabilities.includes("geocode") ?? false,
        looking, found, error, lookUp, choose,
        clear: () => { setFound(undefined); setError(undefined); },
    };
}

/** What the search found, under the address: the places to choose from, or why there are none. `instead` says what to do then. */
export function FoundPlaces({ search, instead }: { search: AddressLookUp; instead: string }) {
    const { found, error } = search;
    return (
        <>
            {error && (
                <div className="found"><span className="error">{/place .* by hand|map/i.test(error) ? error : `${error} ${instead}`}</span></div>
            )}
            {found && (
                <div className="found">
                    {found.length === 0 && <span className="muted">Nothing found for that address. {instead}</span>}
                    {found.length > 1 && <span className="muted found-ask">Which one is it?</span>}
                    {found.length > 1 && found.map((p) => (
                        <button type="button" key={`${p.lat},${p.lon},${p.name}`} className="found-item" onClick={() => search.choose(p)}>{p.name}</button>
                    ))}
                </div>
            )}
        </>
    );
}
