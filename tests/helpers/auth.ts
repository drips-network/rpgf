import { ethers, HDNodeWallet } from "ethers";
import { SiweMessage } from "siwe";
import withSuperOakApp from "./withSuperOakApp.ts";

export async function getAuthToken(
  wallet: HDNodeWallet = ethers.Wallet.createRandom()
): Promise<string> {
  const nonceRes = await withSuperOakApp((request) =>
    request.get("/api/auth/nonce").expect(200)
  );

  console.log("Nonce response body:", nonceRes.body);

  const { nonce } = nonceRes.body;

  const message = new SiweMessage({
    domain: "localhost",
    address: wallet.address,
    statement: "Sign in with Ethereum to the app.",
    uri: "http://localhost/login",
    version: "1",
    chainId: 1,
    nonce,
  });

  const signature = await wallet.signMessage(message.prepareMessage());

  const loginRes = await withSuperOakApp((request) =>
    request
      .post("/api/auth/login")
      .send({ message, signature })
      .expect(200)
  );

  return loginRes.body.accessToken;
}
