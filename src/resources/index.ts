/**
 * MCP Resources
 *
 * Resources expose data that Claude can read.
 */

export interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

/** Available resources */
export const resources: MCPResource[] = [
  {
    uri: 'site://current',
    name: 'Current Site Configuration',
    description: 'Active site configuration and credentials status',
    mimeType: 'application/json',
  },
  {
    uri: 'site://list',
    name: 'All Sites',
    description: 'List of all configured sites',
    mimeType: 'application/json',
  },
  {
    uri: 'credentials://status',
    name: 'Credentials Status',
    description: 'Status of all API credentials and tokens',
    mimeType: 'application/json',
  },
];

/**
 * Get resource by URI
 */
export function getResource(uri: string): MCPResource | undefined {
  return resources.find((r) => r.uri === uri);
}
