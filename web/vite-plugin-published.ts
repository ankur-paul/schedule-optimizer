// Serves published.html for public timetable links (/gndec/k7f3q9xa2m) in `npm run dev` and `npm run preview`.
// The host does the same with a rewrite in production (docs/v2-roadmap.md, deploy section).
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { Connect, Plugin } from 'vite'
import { isPublishedRewrite } from './src/published/path.ts'

/** Answers a public link with published.html, unless a real file sits at that path under one of `roots`. */
function rewrite(roots: string[]): Connect.NextHandleFunction {
  return (req, _res, next) => {
    const url = req.url ?? '/'
    const pathname = url.split(/[?#]/)[0]
    if (isPublishedRewrite(url) && !roots.some((root) => existsSync(path.join(root, pathname)))) {
      req.url = '/published.html'
    }
    next()
  }
}

export function publishedPage(): Plugin {
  let devRoots: string[] = []
  let previewRoots: string[] = []
  return {
    name: 'lattice-published-page',
    configResolved(config) {
      devRoots = [config.root, config.publicDir].filter(Boolean)
      previewRoots = [path.resolve(config.root, config.build.outDir)]
    },
    configureServer(server) {
      server.middlewares.use(rewrite(devRoots))
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite(previewRoots))
    },
  }
}
