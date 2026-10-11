import {defineConfig} from 'vite';
export default defineConfig({build:{target:'es2022',lib:{entry:'index.js',formats:['es'],fileName:'index'},rollupOptions:{external:id=>!id.startsWith('.')&&!id.startsWith('/')&&!id.startsWith('\0')}}});
