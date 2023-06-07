/// <reference types="vite/client" />

declare module '*.svg' {
  const uri: string;
  export const ReactComponent: React.FC<React.SVGProps<SVGElement>>;
  export default uri;
}

declare const __ENDPOINT: string;
declare const __VERSION: string;
declare const __BUILD_TIMESTAMP: number;
