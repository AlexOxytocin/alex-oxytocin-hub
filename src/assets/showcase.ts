import type { ImageMetadata } from 'astro';

const images = import.meta.glob<ImageMetadata>('./showcase/*.{jpg,jpeg,png}', {
  eager: true,
  import: 'default',
});

export function showcaseImage(source: string): ImageMetadata {
  const filename = source.split('/').at(-1);
  const image = filename ? images[`./showcase/${filename}`] : undefined;
  if (!image) throw new Error(`Missing showcase image: ${source}`);
  return image;
}
