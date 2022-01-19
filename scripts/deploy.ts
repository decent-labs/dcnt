import { ethers } from "hardhat";
import { DCNTToken__factory } from "../typechain";

async function main() {
  const [owner] = await ethers.getSigners();

  const freeMintWhole = 1_000_000_000; // 1 billion
  const freeMintTotal = ethers.utils.parseEther(freeMintWhole.toString());

  const dcnt = await new DCNTToken__factory(owner).deploy(freeMintTotal);
  await dcnt.deployed();

  console.log("DCNT deployed to:", dcnt.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
