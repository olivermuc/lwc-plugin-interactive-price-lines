// Dev server and preview build for the example page. @author Oliver Seidel (Apache-2.0)
import { defineConfig } from 'vite';

const input = {
	main: './src/example/index.html',
};

export default defineConfig({
	build: {
		rollupOptions: {
			input,
		},
	},
});
