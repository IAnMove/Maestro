/** Validate the generated command catalog before a request is persisted or sent. */
export type CommandSchema = Record<string, unknown> & {
  anyOf?: unknown[]
  properties?: Record<string, unknown>
  required?: string[]
  additionalProperties?: boolean
  $defs?: Record<string, unknown>
  $ref?: string
  const?: unknown
  enum?: unknown[]
  type?: string
  minLength?: number
  maxLength?: number
  pattern?: string
  minimum?: number
  maximum?: number
  minItems?: number
  maxItems?: number
  items?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}


export function createCatalogValidator(
  definitions: Record<string, unknown> | undefined, operation: string,
): (value: unknown, schema: unknown, field: string) => void {
  function schemaTypeMatches(value: unknown, type: unknown): boolean {
    if (type === 'null') return value === null
    if (type === 'string') return typeof value === 'string'
    if (type === 'boolean') return typeof value === 'boolean'
    if (type === 'integer') return typeof value === 'number' && Number.isSafeInteger(value)
    if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
    if (type === 'array') return Array.isArray(value)
    if (type === 'object') return isRecord(value)
    return true
  }

  function resolveSchema(schema: unknown): CommandSchema {
    if (!isRecord(schema)) throw new Error(`The generated ${operation} catalog contains an invalid schema`)
    if (typeof schema.$ref !== 'string') return schema
    const prefix = '#/$defs/'
    if (!schema.$ref.startsWith(prefix)) throw new Error(`The generated ${operation} catalog contains an unsupported reference`)
    return resolveSchema(definitions?.[schema.$ref.slice(prefix.length)])
  }

  function assertCatalogUnion(value: unknown, schema: CommandSchema, field: string): void {
    const valid = schema.anyOf?.some(option => {
      try {
        assertCatalogValue(value, option, field)
        return true
      } catch {
        return false
      }
    })
    if (!valid) throw new Error(`${field} has an invalid native ${operation} value`)
  }

  function assertCatalogIdentity(value: unknown, schema: CommandSchema, field: string): void {
    if ('const' in schema && value !== schema.const) {
      throw new Error(`${field} must equal its native selector`)
    }
    if (Array.isArray(schema.enum) && !schema.enum.some(option => Object.is(option, value))) {
      throw new Error(`${field} has an invalid native ${operation} value`)
    }
    if (schema.type && !schemaTypeMatches(value, schema.type)) {
      throw new Error(`${field} has an invalid native ${operation} type`)
    }
  }

  function assertCatalogString(value: unknown, schema: CommandSchema, field: string): void {
    if (typeof value !== 'string') return
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      throw new Error(`${field} is too short`)
    }
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
      throw new Error(`${field} is too long`)
    }
    if (typeof schema.pattern === 'string' && !(new RegExp(schema.pattern).test(value))) {
      throw new Error(`${field} has an invalid native ${operation} value`)
    }
  }

  function assertCatalogNumber(value: unknown, schema: CommandSchema, field: string): void {
    if (typeof value !== 'number') return
    if (!Number.isFinite(value)) throw new Error(`${field} must be finite`)
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      throw new Error(`${field} is below its native minimum`)
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      throw new Error(`${field} is above its native maximum`)
    }
  }

  function assertCatalogArray(value: unknown, schema: CommandSchema, field: string): void {
    if (!Array.isArray(value)) return
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      throw new Error(`${field} has too few items`)
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
      throw new Error(`${field} has too many items`)
    }
    if (schema.items) {
      value.forEach((item, index) => assertCatalogValue(item, schema.items, `${field}[${index}]`))
    }
  }

  function assertCatalogObject(value: unknown, schema: CommandSchema, field: string): void {
    if (!isRecord(value)) return
    const properties = schema.properties || {}
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) throw new Error(`${field}.${key} is not supported by ${operation}`)
      }
    }
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!(key in value)) throw new Error(`${field}.${key} is required by ${operation}`)
      }
    }
    for (const [key, child] of Object.entries(value)) {
      const childSchema = properties[key]
      if (childSchema) assertCatalogValue(child, childSchema, `${field}.${key}`)
    }
  }

  function assertCatalogValue(value: unknown, schema: unknown, field: string): void {
    const resolved = resolveSchema(schema)
    if (Array.isArray(resolved.anyOf)) {
      assertCatalogUnion(value, resolved, field)
      return
    }
    assertCatalogIdentity(value, resolved, field)
    assertCatalogString(value, resolved, field)
    assertCatalogNumber(value, resolved, field)
    assertCatalogArray(value, resolved, field)
    assertCatalogObject(value, resolved, field)
  }

  return assertCatalogValue
}
