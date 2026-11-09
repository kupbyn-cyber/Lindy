// Metadata OAuth cho MCP: RFC 9728 (Protected Resource) và RFC 8414 (Authorization Server).
// Theo mẫu CEN WORK src/lib/mcp/metadata.server.ts.
import { MCP_PATH, publicOrigin, resourceUrl, SUPPORTED_SCOPES } from './config'
import { jsonResponse, OPEN_CORS, preflight } from './http'

const CACHE = { 'cache-control': 'public, max-age=300' }

export function protectedResourceMetadata(request: Request): Response {
  if (request.method.toUpperCase() === 'OPTIONS') return preflight()
  const origin = publicOrigin(request)
  return jsonResponse(
    {
      resource: resourceUrl(origin),
      authorization_servers: [origin],
      scopes_supported: [...SUPPORTED_SCOPES],
      bearer_methods_supported: ['header'],
      resource_name: 'LINDY OS MCP',
      resource_documentation: `${origin}${MCP_PATH}`,
    },
    200,
    { ...OPEN_CORS, ...CACHE },
  )
}

export function authorizationServerMetadata(request: Request): Response {
  if (request.method.toUpperCase() === 'OPTIONS') return preflight()
  const origin = publicOrigin(request)
  return jsonResponse(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      registration_endpoint: `${origin}/oauth/register`,
      revocation_endpoint: `${origin}/oauth/revoke`,
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      revocation_endpoint_auth_methods_supported: ['none'],
      scopes_supported: [...SUPPORTED_SCOPES],
      authorization_response_iss_parameter_supported: true,
      service_documentation: `${origin}${MCP_PATH}`,
    },
    200,
    { ...OPEN_CORS, ...CACHE },
  )
}
