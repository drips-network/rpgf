import { HDNodeWallet, Wallet } from "ethers";
import { Ballot } from "../../src/types/ballot.ts";
import { ballotTypedData, hashBallotVotes } from "../../src/utils/ballotSignature.ts";

/**
 * Signs a ballot using EIP-712 typed data
 * @param wallet - The wallet to sign with
 * @param ballot - The ballot to sign
 * @param chainId - The chain ID
 * @returns The signature
 */
export async function signBallot(
  wallet: Wallet | HDNodeWallet,
  ballot: Ballot,
  chainId: number,
): Promise<string> {
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

  const signature = await wallet.signTypedData(
    typedData.domain,
    typedData.types,
    ballotMessage,
  );

  return signature;
}
