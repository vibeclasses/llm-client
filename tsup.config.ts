import { defineConfig } from 'tsup';

export default defineConfig({
  // Entry points
  entry: ['src/index.ts'],
  
  // Output formats
  format: ['esm', 'cjs'],
  
  // Generate TypeScript declaration files
  dts: true,
  
  // Clean output directory before build
  clean: true,
  
  // Output directory structure
  outDir: 'dist',
  
  // Target Node.js environment
  target: 'es2020',
  platform: 'node',
  
  // Handle ESM properly
  splitting: false,
  
  // External dependencies
  external: ['fastify', 'express', 'fastify-plugin', 'eventemitter3'],
  
  // Output configuration
  outExtension({ format }) {
    return {
      js: format === 'esm' ? '.mjs' : '.cjs',
    };
  },
  
  // ESBuild options
  esbuildOptions(options) {
    // Preserve import.meta usage
    options.supported = {
      ...options.supported,
      'import-meta': true
    };
  }
});
