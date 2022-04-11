import { constructMerkleTree, makeLeaves } from "./airdrop_helpers";
import fs from "fs";
import { BigNumber } from "ethers";

function writeJson() {
  const airdropClaimants = [
    { addr: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8", claim: BigNumber.from('1000000000000000000000') },
    { addr: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc", claim: BigNumber.from('9000000000000000000000') },
  ];

  let proofs: any = {};

  const leaves = makeLeaves(airdropClaimants);
  const tree = constructMerkleTree(leaves);

  leaves.forEach((l, i) => {
    proofs[airdropClaimants[i].addr] = {
      claimant: airdropClaimants[i].addr,
      claim: airdropClaimants[i].claim.toString(),
      proof: tree.getHexProof(l),
    };
  });

  const jsonStr = JSON.stringify(proofs);
  fs.writeFile('./claimants.json', jsonStr, err => {
    if (err) {
      console.log('Error writing to file', err)
    } else {
      console.log('Successfully wrote file')
    }
  })
}

async function main() {
  writeJson();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
