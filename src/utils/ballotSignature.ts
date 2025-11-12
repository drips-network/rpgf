import { verifyTypedData, keccak256, toUtf8Bytes } from "ethers";
import { Ballot } from "../types/ballot.ts";

export const ballotTypedData = (chainId?: number) => ({
  primaryType: "Ballot",
  domain: {
    name: "Sign votes",
    version: "1",
    chainId,
  },
  types: {
    Ballot: [
      { name: "total_votes", type: "uint256" },
      { name: "project_count", type: "uint256" },
      { name: "hashed_votes", type: "string" },
    ],
  },
});

/**
 * Hashes the ballot votes using keccak256
 * @param ballot - The ballot object containing project IDs and vote counts
 * @returns The keccak256 hash of the ballot JSON string
 */
export function hashBallotVotes(ballot: Ballot): string {
  // Convert ballot to a deterministic JSON string
  // Sort keys to ensure consistent hashing
  const sortedBallot = Object.keys(ballot)
    .sort()
    .reduce((acc, key) => {
      acc[key] = ballot[key];
      return acc;
    }, {} as Ballot);

  const ballotJson = JSON.stringify(sortedBallot);
  return keccak256(toUtf8Bytes(ballotJson));
}

/**
 * Verifies a ballot signature using EIP-712 typed data
 * @param walletAddress - The expected signer's wallet address
 * @param ballot - The ballot object
 * @param signature - The signature to verify
 * @param chainId - The chain ID for the typed data domain
 * @returns The recovered address from the signature
 * @throws Error if signature verification fails
 */
export function verifyBallotSignature(
  walletAddress: string,
  ballot: Ballot,
  signature: string,
  chainId: number,
): string {
  const totalVotes = Object.values(ballot).reduce(
    (acc, voteCount) => acc + voteCount,
    0,
  );
  const projectCount = Object.keys(ballot).length;
  const hashedVotes = hashBallotVotes(ballot);

  const typedData = ballotTypedData(chainId);

  const ballotMessage = {
    total_votes: BigInt(totalVotes),
    project_count: BigInt(projectCount),
    hashed_votes: hashedVotes,
  };

  const recoveredAddress = verifyTypedData(
    typedData.domain,
    typedData.types,
    ballotMessage,
    signature,
  );

  if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new Error(
      `Signature verification failed: expected ${walletAddress}, got ${recoveredAddress}`,
    );
  }

  return recoveredAddress;
}
