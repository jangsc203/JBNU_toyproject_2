import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

const frontendRoot = join(process.cwd())
const distRoot = join(frontendRoot, 'dist')

async function ensureDir(path) {
  await mkdir(path, { recursive: true })
}

async function walkFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'server' || entry.name === '_appgen_meta' || entry.name === '.openai') continue
      files.push(...(await walkFiles(fullPath)))
      continue
    }
    if (entry.isFile()) {
      files.push(fullPath)
    }
  }
  return files
}

async function main() {
  const hostingPath = join(frontendRoot, '.openai', 'hosting.json')
  const hostingRaw = await readFile(hostingPath, 'utf8')
  const hosting = JSON.parse(hostingRaw.replace(/^\uFEFF/, ''))
  const manifestEntries = []
  for (const filePath of await walkFiles(distRoot)) {
    const rel = relative(distRoot, filePath).split(sep).join('/')
    const body = await readFile(filePath, 'utf8')
    const ext = rel.includes('.') ? rel.slice(rel.lastIndexOf('.')) : ''
    manifestEntries.push([
      `/${rel}`,
      {
        body,
        type: {
          '.html': 'text/html; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.svg': 'image/svg+xml',
          '.json': 'application/json; charset=utf-8',
          '.ico': 'image/x-icon',
        }[ext] || 'application/octet-stream',
      },
    ])
  }

  await ensureDir(join(distRoot, 'server'))
  await ensureDir(join(distRoot, '_appgen_meta'))
  await ensureDir(join(distRoot, '.openai'))

  await writeFile(
    join(distRoot, '_appgen_meta', 'appgarden.json'),
    JSON.stringify(
      {
        platform: 'appgarden',
        entrypoint: 'server/index.js',
      },
      null,
      2,
    ),
  )

  await writeFile(
    join(distRoot, '.openai', 'hosting.json'),
    JSON.stringify(hosting, null, 2),
  )

  await writeFile(
    join(distRoot, 'server', 'index.js'),
    `const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
}

const files = ${JSON.stringify(Object.fromEntries(manifestEntries), null, 2)}

function getFile(pathname) {
  if (pathname === '/') return files['/index.html']
  return files[pathname] || files[\`\${pathname}/index.html\`]
}

export default {
  async fetch(request) {
    const url = new URL(request.url)
    const pathname = decodeURIComponent(url.pathname)

    if (pathname === '/health') {
      return new Response('ok', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    }

    const file = getFile(pathname) || files['/index.html']
    if (!file) {
      return new Response('Not found', { status: 404 })
    }

    return new Response(file.body, {
      headers: {
        'content-type': file.type,
      },
    })
  },
}
`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
