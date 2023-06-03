/// <reference types="vite/client" />

declare module '*.svg' {
  const uri: string;
  export const ReactComponent: React.FC<React.SVGProps<SVGElement>>;
  export default uri;
}

interface ImportMetaEnv {
  readonly VITE_APP_ENDPOINT: string;
  // 更多环境变量...
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
