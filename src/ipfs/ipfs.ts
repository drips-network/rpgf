const IPFS_GATEWAY_URL = Deno.env.get("IPFS_GATEWAY_URL") || "https://drips.mypinata.cloud/ipfs";

export async function getIpfsFile(cid: string): Promise<string> {
  const ipfsGatewayUrl = IPFS_GATEWAY_URL.endsWith('/') ? IPFS_GATEWAY_URL.slice(0, -1) : IPFS_GATEWAY_URL;

  const url = `${ipfsGatewayUrl}/${cid}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch IPFS file: ${response.statusText}`);
  }

  return response.text();
}
