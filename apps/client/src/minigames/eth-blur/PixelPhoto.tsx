import { useEffect, useRef } from 'react';

import { loadPhoto } from './photos';

export function PixelPhoto({ src, columns, onReady, onError, background = '#151819' }: {
  src: string; columns: number; onReady: () => void; onError: () => void; background?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    void loadPhoto(src).then(image => {
      if (cancelled || !canvas.current) return;
      const target = canvas.current;
      // Always render the complete source into a stable 16:9 frame.
      target.width = 1280; target.height = 720;
      const context = target.getContext('2d');
      if (!context) { onError(); return; }
      context.fillStyle = background; context.fillRect(0, 0, target.width, target.height);
      const scale = Math.min(target.width / image.naturalWidth, target.height / image.naturalHeight);
      const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
      const x = (target.width - width) / 2, y = (target.height - height) / 2;
      if (columns === 0) {
        context.imageSmoothingEnabled = true;
        context.drawImage(image, x, y, width, height);
      } else {
        const tiny = document.createElement('canvas');
        tiny.width = columns; tiny.height = Math.max(1, Math.round(columns * image.naturalHeight / image.naturalWidth));
        const sample = tiny.getContext('2d');
        if (!sample) { onError(); return; }
        sample.imageSmoothingEnabled = true; sample.imageSmoothingQuality = 'high';
        sample.drawImage(image, 0, 0, tiny.width, tiny.height);
        context.imageSmoothingEnabled = false;
        context.drawImage(tiny, x, y, width, height);
      }
      onReady();
    }).catch(() => { if (!cancelled) onError(); });
    return () => { cancelled = true; };
  }, [src, columns, onReady, onError, background]);
  return <canvas ref={canvas} role="img" aria-label="Full ETH building photograph, progressively pixelated" />;
}
