/// <reference types="vite/client" />

declare module '*.svg' {
  const uri: string;
  export const ReactComponent: React.FC<React.SVGProps<SVGElement>>;
  export default uri;
}

declare const __ENDPOINT: string;
