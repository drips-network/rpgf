import { config } from "../../config.ts";

const IPFS_GATEWAY_URL = config.ipfs.gatewayUrl;

export async function getIpfsFile(cid: string): Promise<string> {
  const ipfsGatewayUrl = IPFS_GATEWAY_URL.endsWith('/') ? IPFS_GATEWAY_URL.slice(0, -1) : IPFS_GATEWAY_URL;

  const url = `${ipfsGatewayUrl}/${cid}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch IPFS file: ${response.statusText}`);
  }

  return response.text();
}
