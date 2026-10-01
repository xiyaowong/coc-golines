import process from 'node:process'
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'lib',
  target: 'es2020',
  platform: 'node',
  minify: true,
  sourcemap: process.env.NODE_ENV === 'development',
  dts: false,
  deps: {
    neverBundle: ['coc.nvim'],
    onlyBundle: false,
  },
  outputOptions: {
    codeSplitting: false,
  },
  outExtensions: () => ({ js: '.js' }),
})
