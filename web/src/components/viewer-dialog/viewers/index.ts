import { FC, lazy, LazyExoticComponent } from 'react';
import { ViewerProps } from './type';

type ViewerComponentMapEntry = [
  mimetype: `${string}/${string}` | '*',
  extname: string,
  Component: LazyExoticComponent<FC<ViewerProps>>,
];

const viewerComponentMap: ViewerComponentMapEntry[] = [
  [
    'text/plain',
    'txt',
    lazy(() =>
      import('./text-viewer').then((mod) => ({ default: mod.TextViewer })),
    ),
  ],
  [
    'image/*',
    '*',
    lazy(() =>
      import('./image-viewer').then((mod) => ({ default: mod.ImageViewer })),
    ),
  ],
  [
    'application/pdf',
    '*',
    lazy(() =>
      import('./pdf-viewer').then((mod) => ({ default: mod.PdfViewer })),
    ),
  ],
];

export const loadViewerComponent = (
  mimetype: string,
  extname: string,
): ViewerComponentMapEntry[2] => {
  const mapping = viewerComponentMap.find(
    ([s_mime, s_ext]) =>
      mimetype_eq(s_mime, mimetype) && (s_ext == extname || s_ext == '*'),
  );
  return (
    mapping?.[2] ||
    lazy(() =>
      import('./unknown-viewer').then((mod) => ({
        default: mod.UnknownViewer,
      })),
    )
  );
};

const mimetype_eq = (a: string, b: string): boolean => {
  if (a == b) return true;
  if (a == '*') return true;
  const [maintype, subtype] = a.split('/');
  if (subtype == '*') {
    return b.split('/')[0] == maintype;
  }
  return false;
};

export const supportsFileViewer = (
  filename: string,
  mimetype: string,
): boolean => {
  const extname = filename.split('.').pop() || '';
  return viewerComponentMap.some(
    ([s_mime, s_ext]) =>
      mimetype_eq(s_mime, mimetype) && (s_ext == extname || s_ext == '*'),
  );
};
