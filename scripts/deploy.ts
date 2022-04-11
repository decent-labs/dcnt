import ethProvider from "eth-provider";
import { BigNumber } from "ethers/lib/ethers";
import { ethers } from "hardhat";
import time from "../test/time";
import { constructMerkleTree, makeLeaves } from "./airdrop_helpers";

async function main() {
  const frame = ethProvider("frame");

  const freeMintWhole = 1_000_000_000; // 1 billion
  const freeMintTotal = ethers.utils.parseEther(freeMintWhole.toString());

  const airdropSupply = ethers.utils.parseEther('10000');

  const DCNTToken = await ethers.getContractFactory("DCNTToken");

  const airdropClaimants = [
    { addr: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8", claim: BigNumber.from('1000000000000000000000') },
    { addr: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc", claim: BigNumber.from('9000000000000000000000') },
  ];

  // Prepare merkle tree of claimants
  const leaves = makeLeaves(airdropClaimants);
  const tree = constructMerkleTree(leaves);

  const dcntToken = await DCNTToken.deploy(
    freeMintTotal,
    airdropSupply,
    tree.getHexRoot(),
    (await time.latest()) + time.duration.seconds(120),
  );

  await dcntToken.deployed();
  console.log("deployed to", dcntToken.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
