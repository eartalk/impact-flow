import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../..', '');
  return {
    envDir: '../..',
    plugins: [
      vue(),
      Components({
        dts: 'src/components.d.ts',
        resolvers: [ElementPlusResolver()],
      }),
    ],
    resolve: {
      alias: {
        '@vue/shared': fileURLToPath(
          new URL('./node_modules/@vue/shared/dist/shared.esm-bundler.js', import.meta.url),
        ),
      },
    },
    server: {
      host: env.VITE_HOST || '0.0.0.0',
      port: Number(env.VITE_PORT || 5173),
      proxy: {
        '/api': env.VITE_API_TARGET || 'http://localhost:3000',
      },
    },
  };
});
