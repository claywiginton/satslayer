import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.proofofwork.app',
  appName: 'Proof of Work',
  webDir: 'out',
  server: {
    // Point to the live Vercel app — no need to bundle static files
    url: 'https://powfitness.vercel.app',
    cleartext: false,
  },
  ios: {
    scheme: 'Proof of Work',
    contentInset: 'automatic',
    backgroundColor: '#08080a',
  },
};

export default config;
