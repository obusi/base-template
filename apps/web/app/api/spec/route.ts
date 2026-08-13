// The OpenAPI document, generated from the contract rather than written by
// hand. There is no second description of the API to fall out of date: change
// an input schema and this changes with it.

import { OpenAPIGenerator } from "@orpc/openapi"
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4"

import { router } from "@packages/api"

// `/zod4`, not the package root — that one reads Zod 3 schemas and silently
// produces empty ones for v4.
const generator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
})

export async function GET() {
  const spec = await generator.generate(router, {
    info: {
      title: "base-template API",
      version: "0.0.0",
    },
    servers: [{ url: "/api/v1" }],
  })

  return Response.json(spec)
}
