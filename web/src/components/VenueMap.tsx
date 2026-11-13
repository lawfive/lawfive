import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { useMeta } from "../api.ts";
import { MapPlaceholder } from "./ui.tsx";

// Maps of venues: pins for where you park (P) and each pitch (1, 2, 3…). The map comes from the
// server's settings (/v1/meta), so a self-hosted server can use its own provider: a vector map
// (OpenFreeMap's by default, drawn by MapLibre inside Leaflet, with its dark style in dark mode),
// or raster tiles. When it has satellite imagery set up, a Map / Satellite switch appears (the
// choice is remembered).

export interface Pin {
    id: string;
    lat: number;
    lon: number;
    label: string;
    kind: "parking" | "pitch" | "venue";
    /** Text on the pin: P, a pitch number. */
    mark?: string;
    onClick?: () => void;
}

function icon(pin: Pin, active: boolean) {
    return L.divIcon({
        className: "",
        html: `<div class="map-pin map-pin-${pin.kind}${active ? " active" : ""}"><span>${pin.mark ?? ""}</span></div>`,
        iconSize: [30, 38],
        iconAnchor: [15, 36],
        tooltipAnchor: [0, -34],
    });
}

export function VenueMap({ pins, height = 320, activeId, onPick, onMove, center }: {
    pins: Pin[];
    height?: number;
    /** The pin a click on the map moves. */
    activeId?: string;
    onPick?: (lat: number, lon: number) => void;
    onMove?: (id: string, lat: number, lon: number) => void;
    /** Recentre here when it changes (an address just looked up). */
    center?: { lat: number; lon: number; zoom?: number };
}) {
    const [ready, setReady] = useState(false);
    const onReady = useCallback(() => setReady(true), []);
    const { tiles, switcher } = useMapTiles(onReady);
    return (
        <div className="map" style={{ height }}>
            {/* WEB-8: under the map, so the tiles cover it as they arrive; gone once they all have. */}
            {!ready && <MapPlaceholder />}
            {switcher}
            <MapContainer center={[37.4, -122]} zoom={11} maxZoom={19} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
                {tiles}
                <FitPins pins={pins} />
                {center && <Recenter {...center} />}
                {onPick && <ClickToPick onPick={onPick} />}
                {pins.map((pin) => (
                    <Marker key={pin.id} position={[pin.lat, pin.lon]} icon={icon(pin, pin.id === activeId)} draggable={Boolean(onMove)}
                        eventHandlers={{
                            click: () => pin.onClick?.(),
                            dragend: (e) => {
                                const { lat, lng } = (e.target as L.Marker).getLatLng();
                                onMove?.(pin.id, round(lat), round(lng));
                            },
                        }}>
                        <Tooltip direction="top">{pin.label}</Tooltip>
                    </Marker>
                ))}
            </MapContainer>
        </div>
    );
}

const layerKey = "lawfive.mapLayer";

/**
 * The map's tiles (inside a MapContainer) and the Map / Satellite switch (beside it), shared by
 * every map. The choice is remembered across maps and visits. `onReady` is called once the tiles
 * in view have loaded.
 */
export function useMapTiles(onReady?: () => void): { tiles: ReactNode; switcher: ReactNode } {
    const meta = useMeta();
    const maps = meta.data?.maps;
    const satellite = maps?.satellite;
    const dark = usePrefersDark();
    const [layer, setLayer] = useState<"map" | "satellite">(() => (readStored() === "satellite" ? "satellite" : "map"));
    const showSatellite = layer === "satellite" && satellite !== undefined;
    const choose = (next: "map" | "satellite") => {
        setLayer(next);
        try {
            localStorage.setItem(layerKey, next);
        } catch {
            // Storage can be unavailable (private windows); the choice just isn't remembered.
        }
    };
    let tiles: ReactNode = null;
    if (showSatellite) {
        tiles = <TileLayer key="satellite" url={satellite.tileUrl} attribution={satellite.attribution} maxZoom={19} eventHandlers={{ load: () => onReady?.() }} />;
    } else if (maps?.style) {
        tiles = <VectorMap url={(dark && maps.style.darkUrl) || maps.style.url} attribution={maps.style.attribution} onReady={onReady} />;
    } else if (maps) {
        // Raster street tiles have no dark version, so they're darkened in dark mode (.tiles-street).
        tiles = <TileLayer key="map" url={maps.tileUrl} attribution={maps.attribution} maxZoom={19} className="tiles-street" eventHandlers={{ load: () => onReady?.() }} />;
    }
    return {
        tiles,
        switcher: satellite && (
            <div className="segmented map-layers">
                <button type="button" className={showSatellite ? "" : "on"} onClick={() => choose("map")}>Map</button>
                <button type="button" className={showSatellite ? "on" : ""} onClick={() => choose("satellite")}>Satellite</button>
            </div>
        ),
    };
}

function readStored(): string | null {
    try {
        return localStorage.getItem(layerKey);
    } catch {
        return null;
    }
}

/**
 * A vector map (a MapLibre style) as a Leaflet layer, under the pins and lines. MapLibre is
 * loaded only when a map needs it, as it's most of the app's size.
 */
function VectorMap({ url, attribution, onReady }: { url: string; attribution: string; onReady?: () => void }) {
    const map = useMap();
    useEffect(() => {
        let layer: L.MaplibreGL | undefined;
        let gone = false;
        void Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl-worker.mjs?url"), import("@maplibre/maplibre-gl-leaflet")]).then(([maplibre, worker]) => {
            // Its worker is a file of its own, which the build only keeps when it's named here.
            maplibre.setWorkerUrl(worker.default);
            if (!gone) {
                layer = L.maplibreGL({ style: url, attributionControl: { customAttribution: attribution } }).addTo(map);
                layer.getMaplibreMap().once("load", () => onReady?.());
            }
        });
        return () => {
            gone = true;
            layer?.remove();
        };
    }, [map, url, attribution, onReady]);
    return null;
}

/** Whether the system is in dark mode, kept up to date. */
function usePrefersDark(): boolean {
    const query = "(prefers-color-scheme: dark)";
    const [dark, setDark] = useState(() => window.matchMedia(query).matches);
    useEffect(() => {
        const media = window.matchMedia(query);
        const change = () => setDark(media.matches);
        media.addEventListener("change", change);
        return () => media.removeEventListener("change", change);
    }, []);
    return dark;
}

/** Zooms to show every pin when the map first has some. */
function FitPins({ pins }: { pins: Pin[] }) {
    const map = useMap();
    const hasPins = pins.length > 0;
    useEffect(() => {
        if (hasPins) {
            const bounds = L.latLngBounds(pins.map((p) => [p.lat, p.lon]));
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
        }
        // Only when pins first appear, so dragging one doesn't move the map.
    }, [hasPins, map]);
    return null;
}

function Recenter({ lat, lon, zoom }: { lat: number; lon: number; zoom?: number }) {
    const map = useMap();
    useEffect(() => {
        map.setView([lat, lon], zoom ?? 17);
    }, [lat, lon, zoom, map]);
    return null;
}

function ClickToPick({ onPick }: { onPick: (lat: number, lon: number) => void }) {
    useMapEvents({ click: (e) => onPick(round(e.latlng.lat), round(e.latlng.lng)) });
    return null;
}

/** Six decimal places: about 10 cm. */
function round(n: number): number {
    return Math.round(n * 1e6) / 1e6;
}
