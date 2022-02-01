import ethProvider from "eth-provider";
import { ethers } from "hardhat";

async function main() {
  const frame = ethProvider("frame");

  const freeMintWhole = 1_000_000_000; // 1 billion
  const freeMintTotal = ethers.utils.parseEther(freeMintWhole.toString());

  const DCNTToken = await ethers.getContractFactory("DCNTToken");
  const dcntTx = await DCNTToken.getDeployTransaction(freeMintTotal);

  const deployer: string = (
    await frame.request({ method: "eth_requestAccounts" })
  )[0];

  dcntTx.from = deployer;

  await frame.request({ method: "eth_sendTransaction", params: [dcntTx] });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
