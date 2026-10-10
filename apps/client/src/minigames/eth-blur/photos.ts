const images = new Map<string, Promise<HTMLImageElement>>();
export function loadPhoto(src: string) {
  let pending = images.get(src);
  if (!pending) {
    pending = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => { images.delete(src); reject(new Error('Photo unavailable')); };
      image.src = src;
    });
    images.set(src, pending);
  }
  return pending;
}
