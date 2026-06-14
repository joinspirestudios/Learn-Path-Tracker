import { defineConfig } from 'vite';

// Vite auto-detects index.html as the entry. Output goes to /dist.
// Vercel zero-config detects "Vite" and serves /dist, while any files in
// /api are deployed as serverless functions automatically.
export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions:{
      output:{
        manualChunks(id){
          if(id.includes('/node_modules/firebase/') || id.includes('/node_modules/@firebase/')) return 'firebase';
          if(id.includes('/node_modules/')) return 'vendor';
        },
      },
    },
  }
});
