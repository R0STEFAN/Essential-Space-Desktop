/**
 * Browser-native image optimization and WebP conversion using HTML5 Canvas.
 */
export async function convertToWebP(
  file: File | Blob,
  maxDimension: number = 1920,
  quality: number = 0.85
): Promise<{ blob: Blob; width: number; height: number }> {
  if (typeof window === 'undefined') {
    throw new Error('Image optimization must run in a browser environment');
  }

  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;

  if (width > maxDimension || height > maxDimension) {
    if (width > height) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D canvas context');
  }

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      b => {
        if (b) resolve(b);
        else reject(new Error('Canvas WebP export failed'));
      },
      'image/webp',
      quality
    );
  });

  return { blob, width, height };
}
