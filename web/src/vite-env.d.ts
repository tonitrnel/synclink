/// <reference types="vite/client" />
/// <reference types="./constants/wicg-file-system-access" />

declare module '*.svg' {
  import * as React from 'react';

  export const ReactComponent: React.FunctionComponent<
    React.SVGProps<SVGSVGElement> & { title?: string }
  >;

  export default ReactComponent;
}

declare const __ENDPOINT__: string;
declare const __VERSION__: string;
declare const __BUILD_TIMESTAMP__: number;
