import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { expect, it } from 'vitest'

const root = fileURLToPath(new URL('../..', import.meta.url))

// Vercel runs each function as unbundled Node ESM, so a relative import without .js fails only after deploy.
// ponytail: roots are api/*.ts and foo.js resolves only to foo.ts; extend if functions move into folders or import index/.tsx files.
function importsWithoutExtension(): string[] {
  const missing: string[] = []
  const seen = new Set<string>()
  const visit = (file: string) => {
    if (seen.has(file)) return
    seen.add(file)
    const specifiers: string[] = []
    const collect = (node: ts.Node) => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
        && !(ts.isImportDeclaration(node) ? node.importClause?.isTypeOnly : node.isTypeOnly)) specifiers.push(node.moduleSpecifier.text)
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
        && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) specifiers.push(node.arguments[0].text)
      ts.forEachChild(node, collect)
    }
    collect(ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest))
    for (const specifier of specifiers) {
      if (!specifier.startsWith('.')) continue
      if (!specifier.endsWith('.js')) missing.push(`${relative(root, file)}: ${specifier}`)
      const target = join(dirname(file), specifier.replace(/\.js$/, '') + '.ts')
      if (existsSync(target)) visit(target)
    }
  }
  for (const name of readdirSync(join(root, 'api'))) if (name.endsWith('.ts')) visit(join(root, 'api', name))
  return missing
}

it('API functions import local modules with the .js extension Node ESM needs', () => {
  expect(importsWithoutExtension()).toEqual([])
})
