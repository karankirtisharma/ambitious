// Vite resolves `*.glsl?raw` imports to the file's text at build time; this
// ambient declaration is what lets TypeScript type them as strings.
declare module '*.glsl?raw' {
  const content: string;
  export default content;
}
