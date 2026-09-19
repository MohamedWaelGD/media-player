import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'element/index': 'src/element/index.ts',
    'hls/index': 'src/hls/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  minify: true,
  target: 'es2020',
  splitting: false,
  external: ['hls.js'],
  noExternal: ['@phosphor-icons/webcomponents', 'lit'],
});
