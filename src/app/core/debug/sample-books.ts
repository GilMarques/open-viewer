import type { Book } from '../models/book.model';

/**
 * Debug-only sample books used when no SAF / file system is wired yet.
 *
 * These point at `src/assets/sample/` paths, which are gitignored — the
 * data lives only on your local machine. When shipping to a real user,
 * gate this behind `environment.production === false` (TODO when we add
 * environments config) or strip it via a build flag.
 *
 * Treat the asset list as best-effort: it lists every file at build time
 * so you don't need to update this constant when you add pages. But that
 * means a missing page silently disappears from the book, so the empty
 * list below is the safe default.
 *
 * To use:
 *   import { SAMPLE_BOOKS, buildKingdomSample } from './sample-books';
 *   bookstore.openBook(buildKingdomSample()); // runtime, dev only
 */
export const SAMPLE_BOOKS: readonly Book[] = [];

/**
 * Build a `Book` from the local Kingdom/c001 sample folder.
 *
 * Files are listed 001..063. URL pattern is `/assets/sample/Kingdom/c001/XXX.jpg`.
 * Page index is 0-based; label is the original filename for debugging.
 */
export function buildKingdomSample(): Book {
  const filenames: readonly string[] = [
    '001.jpg', '002.jpg', '003.jpg', '004.jpg', '005.jpg', '006.jpg', '007.jpg',
    '008.jpg', '009.jpg', '010.jpg', '011.jpg', '012.jpg', '013.jpg', '014.jpg',
    '015.jpg', '016.jpg', '017.jpg', '018.jpg', '019.jpg', '020.jpg', '021.jpg',
    '022.jpg', '023.jpg', '024.jpg', '025.jpg', '026.jpg', '027.jpg', '028.jpg',
    '029.jpg', '030.jpg', '031.jpg', '032.jpg', '033.jpg', '034.jpg', '035.jpg',
    '036.jpg', '037.jpg', '038.jpg', '039.jpg', '040.jpg', '041.jpg', '042.jpg',
    '043.jpg', '044.jpg', '045.jpg', '046.jpg', '047.jpg', '048.jpg', '049.jpg',
    '050.jpg', '051.jpg', '052.jpg', '053.jpg', '054.jpg', '055.jpg', '056.jpg',
    '057.jpg', '058.jpg', '059.jpg', '060.jpg', '061.jpg', '062.jpg', '063.jpg',
  ];
  return {
    id: 'sample:kingdom:c001',
    title: 'Kingdom — Chapter 1 (sample)',
    pages: filenames.map((name, index) => ({
      index,
      url: `assets/sample/Kingdom/c001/${name}`,
      label: name,
    })),
  };
}