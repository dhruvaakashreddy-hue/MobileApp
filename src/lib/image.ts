import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { isNative } from './notifications';

/**
 * Profile photo capture.
 *
 * Every image — camera or gallery, native or web — is re-encoded through a
 * canvas to a centre-cropped square JPEG before it goes anywhere. That matters
 * because the photo is stored in Preferences (SharedPreferences / UserDefaults),
 * which is built for small values, not multi-megabyte blobs. A modern phone
 * camera produces several MB; this brings it to roughly 15-25 KB.
 *
 * The native plugin is also asked to downscale, but the canvas pass is what
 * actually guarantees the bound, since plugin resizing varies by platform and
 * the web path has no plugin at all.
 */

/** Stored avatars are square at this edge length. */
export const AVATAR_SIZE = 256;

/** JPEG quality for the stored avatar — visually fine at this size. */
const AVATAR_QUALITY = 0.72;

/** Refuse anything that would still be unreasonable after re-encoding. */
const MAX_STORED_BYTES = 200_000;

export class ImagePickError extends Error {
  cancelled: boolean;

  constructor(message: string, cancelled = false) {
    super(message);
    this.name = 'ImagePickError';
    this.cancelled = cancelled;
  }
}

export type PhotoSource = 'camera' | 'gallery';

/**
 * Opens the camera or the photo library and returns a bounded square data URI.
 * Throws `ImagePickError` with `cancelled: true` when the user backs out, which
 * callers should treat as a no-op rather than an error worth showing.
 */
export async function pickProfilePhoto(source: PhotoSource): Promise<string> {
  const raw = isNative()
    ? await pickNative(source)
    : await pickWeb(source);

  const squared = await toSquareDataUrl(raw, AVATAR_SIZE, AVATAR_QUALITY);

  if (approximateBytes(squared) > MAX_STORED_BYTES) {
    throw new ImagePickError("That image is too large to use. Try another one.");
  }
  return squared;
}

async function pickNative(source: PhotoSource): Promise<string> {
  try {
    const photo = await Camera.getPhoto({
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      resultType: CameraResultType.DataUrl,
      // Let the OS crop to a square before we ever see it — a far better
      // experience than cropping silently behind the user's back.
      allowEditing: true,
      quality: 80,
      width: AVATAR_SIZE * 2,
      height: AVATAR_SIZE * 2,
      correctOrientation: true,
    });
    if (!photo.dataUrl) throw new ImagePickError('No image was returned.');
    return photo.dataUrl;
  } catch (err) {
    throw asPickError(err, source);
  }
}

/** Web fallback for the dev preview — a plain file input. */
function pickWeb(source: PhotoSource): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (source === 'camera') input.setAttribute('capture', 'user');
    input.style.display = 'none';

    let settled = false;

    input.addEventListener('change', () => {
      settled = true;
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        reject(new ImagePickError('No image selected.', true));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new ImagePickError("Couldn't read that file."));
      reader.readAsDataURL(file);
    });

    // There is no reliable "cancelled" event on a file input; this fires when
    // focus returns without a selection.
    window.addEventListener(
      'focus',
      () => {
        setTimeout(() => {
          if (!settled) {
            input.remove();
            reject(new ImagePickError('No image selected.', true));
          }
        }, 400);
      },
      { once: true },
    );

    document.body.appendChild(input);
    input.click();
  });
}

/** Centre-crops to a square and scales to `size`, re-encoding as JPEG. */
export function toSquareDataUrl(
  dataUrl: string,
  size: number,
  quality: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no 2d context');

        // Take the largest centred square of the source, so nothing is squashed.
        const edge = Math.min(img.width, img.height);
        const sx = (img.width - edge) / 2;
        const sy = (img.height - edge) / 2;

        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, sx, sy, edge, edge, 0, 0, size, size);

        // JPEG, not PNG: a photo as PNG is several times larger for no gain.
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch {
        reject(new ImagePickError("Couldn't process that image."));
      }
    };
    img.onerror = () => reject(new ImagePickError("That doesn't look like an image."));
    img.src = dataUrl;
  });
}

/** Rough decoded size of a data URI, without allocating the bytes. */
export function approximateBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.floor((base64.length * 3) / 4);
}

function asPickError(err: unknown, source: PhotoSource): ImagePickError {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (lower.includes('cancel')) {
    return new ImagePickError('Cancelled.', true);
  }
  if (lower.includes('denied') || lower.includes('permission')) {
    return new ImagePickError(
      source === 'camera'
        ? 'Camera access is off. Turn it on in your phone settings to take a photo.'
        : 'Photo access is off. Turn it on in your phone settings to pick a picture.',
    );
  }
  return new ImagePickError("Couldn't open that. Try again?");
}
