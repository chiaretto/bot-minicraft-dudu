import { KNOWN_PLACEHOLDERS, type PlaceholderName } from './schema.js'
import type { WorldSnapshot } from '../domain/types.js'

export interface PlaceholderContext {
  owner: string
  botName: string
  originStory: string
  snapshot?: WorldSnapshot | null
}

const PLACEHOLDER_RE = /\{(\w+)\}/g

export function extractPlaceholders(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER_RE)].map((m) => m[1] as string)
}

export function isKnownPlaceholder(name: string): name is PlaceholderName {
  return (KNOWN_PLACEHOLDERS as readonly string[]).includes(name)
}

function summarizeInventory(snapshot: WorldSnapshot | null | undefined): string {
  if (!snapshot || snapshot.inventory.length === 0) return 'nada, tô de mãos vazias'
  return snapshot.inventory
    .slice(0, 5)
    .map((item) => `${item.count}x ${item.name}`)
    .join(', ')
}

function formatCoords(snapshot: WorldSnapshot | null | undefined): string {
  if (!snapshot) return 'não sei dizer'
  const { x, y, z } = snapshot.position
  return `${Math.round(x)}, ${Math.round(y)}, ${Math.round(z)}`
}

export function resolvePlaceholders(text: string, ctx: PlaceholderContext): string {
  return text.replace(PLACEHOLDER_RE, (match, rawName: string) => {
    switch (rawName) {
      case 'owner':
        return ctx.owner
      case 'botName':
        return ctx.botName
      case 'originStory':
        return ctx.originStory
      case 'health':
        return ctx.snapshot ? String(Math.round(ctx.snapshot.health)) : '?'
      case 'ownerHealth':
        return ctx.snapshot?.ownerHealth != null
          ? String(Math.round(ctx.snapshot.ownerHealth))
          : '?'
      case 'coords':
        return formatCoords(ctx.snapshot)
      case 'timeOfDay':
        return ctx.snapshot?.timeOfDay ?? 'dia'
      case 'inventorySummary':
        return summarizeInventory(ctx.snapshot)
      default:
        // Placeholder desconhecido nunca deveria chegar aqui: o catálogo é
        // validado no startup. Se chegar, devolve o literal em vez de sumir
        // com o texto.
        return match
    }
  })
}
