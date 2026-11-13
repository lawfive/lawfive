import type * as schema from "@lawfive/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { ApiError, request, type AccountStorage } from "./api.ts";

// Photos on matches, venues and referees (FILE-1 to FILE-5): made smaller in the browser before
// they're uploaded, which also leaves out where they were taken and the camera's details (FILE-2),
// then kept by the server.

export type Attachment = z.infer<typeof schema.Attachment>;
export type PhotoOwner = z.infer<typeof schema.AttachmentRecordType>;

/** The longest side of an uploaded photo and of its thumbnail, in pixels. */
const fullEdge = 2000;
const thumbEdge = 480;

/** A JPEG of the image at most `edge` pixels on its longest side, turned the way the camera held it. */
async function shrink(image: ImageBitmap, edge: number, quality: number): Promise<{ blob: Blob; width: number; height: number }> {
    const scale = Math.min(1, edge / Math.max(image.width, image.height));
    const width = Math.round(image.width * scale);
    const height = Math.round(image.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext("2d")!;
    // White behind a transparent PNG, as a JPEG can't be see-through.
    g.fillStyle = "#fff";
    g.fillRect(0, 0, width, height);
    g.imageSmoothingQuality = "high";
    g.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) {
        throw new Error("This photo couldn't be made smaller.");
    }
    return { blob, width, height };
}

/** FILE-7: known not to fit before it's sent, once the server has refused another. */
export class NoRoomForPhoto extends Error {}

/**
 * Uploads a photo: made smaller, with a thumbnail, as a JPEG with nothing but the picture in it.
 * With `room`, one bigger than that isn't sent.
 */
export async function uploadPhoto(recordType: PhotoOwner, recordId: string, file: File, room?: number): Promise<Attachment> {
    let image: ImageBitmap;
    try {
        image = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
        throw new Error(`${file.name} couldn't be read. Try a JPEG or PNG.`);
    }
    const full = await shrink(image, fullEdge, 0.85);
    const thumb = await shrink(image, thumbEdge, 0.8);
    image.close();
    if (room !== undefined && full.blob.size > room) {
        throw new NoRoomForPhoto();
    }
    const form = new FormData();
    form.set("recordType", recordType);
    form.set("recordId", recordId);
    form.set("width", String(full.width));
    form.set("height", String(full.height));
    form.set("file", full.blob, "photo.jpg");
    form.set("thumb", thumb.blob, "thumb.jpg");
    const res = await fetch("/v1/attachments", { method: "POST", credentials: "include", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new ApiError(res.status, data);
    }
    return data as Attachment;
}

/** FILE-8: a part of a photo, as fractions of its width and height once turned. */
export interface CropFrame {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** The photo turned a number of quarter turns clockwise, on a canvas. */
export function turned(image: ImageBitmap, quarters: number): HTMLCanvasElement {
    const sideways = quarters % 2 === 1;
    const canvas = document.createElement("canvas");
    canvas.width = sideways ? image.height : image.width;
    canvas.height = sideways ? image.width : image.height;
    const g = canvas.getContext("2d")!;
    g.translate(canvas.width / 2, canvas.height / 2);
    g.rotate((quarters * Math.PI) / 2);
    g.drawImage(image, -image.width / 2, -image.height / 2);
    return canvas;
}

/**
 * FILE-8: a photo cropped and turned in the browser, sent in place of the old one with a new
 * thumbnail, made the way an upload is (FILE-2).
 */
export async function replacePhoto(photo: Attachment, image: ImageBitmap, quarters: number, frame: CropFrame): Promise<Attachment> {
    const whole = turned(image, quarters);
    const left = Math.round(frame.x * whole.width);
    const top = Math.round(frame.y * whole.height);
    const width = Math.max(1, Math.round(frame.w * whole.width));
    const height = Math.max(1, Math.round(frame.h * whole.height));
    const cropped = await createImageBitmap(whole, left, top, width, height);
    const full = await shrink(cropped, fullEdge, 0.85);
    const thumb = await shrink(cropped, thumbEdge, 0.8);
    cropped.close();
    const form = new FormData();
    form.set("width", String(full.width));
    form.set("height", String(full.height));
    form.set("file", full.blob, "photo.jpg");
    form.set("thumb", thumb.blob, "thumb.jpg");
    const res = await fetch(`/v1/attachments/${photo.id}/file`, { method: "PUT", credentials: "include", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new ApiError(res.status, data);
    }
    return data as Attachment;
}

/** How much of its room the account is using (SEC-6). */
export function useAccountStorage() {
    return useQuery({ queryKey: ["account-storage"], queryFn: () => request<AccountStorage>("GET", "/account/storage") });
}

/** A record's photos, in order. */
export function usePhotos(recordType: PhotoOwner, recordId: string | undefined) {
    return useQuery({
        queryKey: ["attachments", recordType, recordId],
        enabled: recordId !== undefined,
        queryFn: async () => (await request<{ attachments: Attachment[] }>("GET", `/attachments?recordType=${recordType}&recordId=${recordId}`)).attachments,
    });
}

/** Each referee's picture: their first photo (FILE-5), by referee. */
export function useRefereePictures() {
    const pictures = useQuery({
        queryKey: ["attachments", "referee", "first"],
        queryFn: async () => (await request<{ attachments: Attachment[] }>("GET", "/attachments?recordType=referee&first=true")).attachments,
        staleTime: 60_000,
    });
    return new Map((pictures.data ?? []).map((a) => [a.recordId, a]));
}

/** Changing and deleting a photo; every list of photos is fetched again afterwards. */
export function usePhotoChanges() {
    const client = useQueryClient();
    const refresh = () => Promise.all([client.invalidateQueries({ queryKey: ["attachments"] }), client.invalidateQueries({ queryKey: ["account-storage"] })]);
    return {
        refresh,
        change: useMutation({
            mutationFn: ({ id, ...change }: { id: string; caption?: string | null; position?: number }) => request<Attachment>("PUT", `/attachments/${id}`, change),
            onSuccess: refresh,
        }),
        remove: useMutation({
            mutationFn: (id: string) => request("DELETE", `/attachments/${id}`),
            onSuccess: refresh,
        }),
    };
}
