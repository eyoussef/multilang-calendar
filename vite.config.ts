import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({
      entryRoot: 'src',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.test.ts', 'src/vite-env.d.ts'],
      rollupTypes: false,
    }),
  ],
  build: {
    cssCodeSplit: false,
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        react: resolve(__dirname, 'src/react/index.ts'),
        vue: resolve(__dirname, 'src/vue/index.ts'),
        web: resolve(__dirname, 'src/web/index.ts'),
      },
      formats: ['es', 'cjs'],
      fileName: (format, name) => `${name}.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react-dom/client', 'vue'],
      output: {
        exports: 'named',
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          vue: 'Vue',
        },
        assetFileNames: (info) => {
          if (info.name && info.name.endsWith('.css')) return 'calendar.css';
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
});