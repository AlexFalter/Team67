// A portrait preview and QR detection must use exactly the same crop.
export function bikePreviewCrop(width: number, height: number) {
  const w = Math.min(width, height * .75), h = w / .75;
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}
export function bikePreviewTarget(x: number, y: number, aspect: number) {
  const crop = bikePreviewCrop(aspect, 1);
  return { x: ((x + 1) * aspect / 2 - crop.x) / crop.w, y: ((1 - y) / 2 - crop.y) / crop.h };
}
export function bikePreviewFov(aspect: number) {
  return 2 * Math.atan(Math.tan(72 * Math.PI / 360) * .75 / Math.min(aspect, .75)) * 180 / Math.PI;
}
