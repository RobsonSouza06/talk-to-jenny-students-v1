export type AudioProvider = "preview" | "firebase" | "supabase" | "r2" | "other";
export type AudioStatus = "uploading" | "ready" | "failed";

export type AudioAsset = {
  id: string;
  bookId: string;
  lessonId: string;
  targetId: string;
  provider: AudioProvider;
  storageKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  status: AudioStatus;
  playbackUrl?: string;
  createdAt: string;
};

export type AudioUploadInput = {
  bookId: string;
  lessonId: string;
  targetId: string;
  file: File;
};

export interface AudioStorageProvider {
  upload(input: AudioUploadInput): Promise<AudioAsset>;
  remove(asset: AudioAsset): Promise<void>;
  resolvePlaybackUrl(asset: AudioAsset): Promise<string | null>;
}

export function buildAudioTargetId(
  lessonId: string,
  sectionId: string,
  itemLabel: string,
) {
  return `${lessonId}:${sectionId}:${slug(itemLabel)}`;
}

export function buildAudioStorageKey(input: AudioUploadInput) {
  const extension = input.file.name.split(".").pop()?.toLowerCase() || "audio";
  return `lesson-audio/${input.bookId}/${input.lessonId}/${slug(input.targetId)}.${extension}`;
}

export function isAudioAvailableToStudent(
  asset?: AudioAsset | null,
): asset is AudioAsset & { playbackUrl: string } {
  return Boolean(
    asset
      && asset.status === "ready"
      && asset.storageKey
      && asset.playbackUrl,
  );
}

export function createPreviewAudioAsset(input: AudioUploadInput): AudioAsset {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `audio-${Date.now()}`,
    bookId: input.bookId,
    lessonId: input.lessonId,
    targetId: input.targetId,
    provider: "preview",
    storageKey: buildAudioStorageKey(input),
    fileName: input.file.name,
    contentType: input.file.type,
    sizeBytes: input.file.size,
    status: "ready",
    playbackUrl: URL.createObjectURL(input.file),
    createdAt: new Date().toISOString(),
  };
}

function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}
