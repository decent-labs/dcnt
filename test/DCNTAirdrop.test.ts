import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { MerkleTree } from "merkletreejs";

import { DCNTToken, DCNTAirdrop } from "../typechain";
import time from "./time";
import { makeLeaf, makeLeaves, constructMerkeTree } from "../scripts/airdrop_helpers";


// Test airdrop deployment.
// Test claim: eligible, ineligible paths, after end date, after end has been called
// Test end airdrop, verify it withdraws all available balance

describe("DCNTAirdrop", function () {
  let deployer: SignerWithAddress,
    recoveryDest: SignerWithAddress,
    claimant1: SignerWithAddress,
    claimantN: SignerWithAddress,
    claimant2: SignerWithAddress;

  let dcnt: DCNTToken;
  let dnctAirdrop: DCNTAirdrop;

  const freeMintWhole = BigNumber.from(1_000_000_000);
  const totalClaimable: BigNumber = BigNumber.from(10_000);

  let tree: MerkleTree;
  let leaves: (string | Buffer)[];
  let airdropClaimants: {
    addr: string;
    claim: BigNumber;
  }[];


  beforeEach(async function () {
    [deployer, recoveryDest, claimant1, claimant2, claimantN] = await ethers.getSigners();

    airdropClaimants = [
      { addr: claimant1.address, claim: BigNumber.from(1000) },
      { addr: claimant2.address, claim: BigNumber.from(9000) },
    ];

    // DCNT Token should be deployed first
    // 
    // deployer (as the 'owner' account wrt hardhat) will be used as default
    // signer for contract deployment and interaction, and thus have all initial 
    // DCNT tokens minted to it
    let DCNTToken = await ethers.getContractFactory("DCNTToken");
    dcnt = await DCNTToken.deploy(freeMintWhole);
    await dcnt.deployed();

    // Prepare merkle tree of claimants
    leaves = makeLeaves(airdropClaimants);
    tree = constructMerkeTree(leaves);

    // Deploy airdrop contract
    let DCNTAirdrop = await ethers.getContractFactory("DCNTAirdrop");
    dnctAirdrop = await DCNTAirdrop.deploy(
      dcnt.address,
      tree.getHexRoot(),
      totalClaimable,
      await time.latest() + time.duration.years(1),
      recoveryDest.address,
    );

    // Send over airdrop's total claimable to airdrop contract (transfers from deployer's balance)
    let _transaction = await dcnt.transfer(dnctAirdrop.address, totalClaimable);
    await _transaction.wait();
  });

  describe("Initial deployment state", function () {
    it("Should have totalClaimable DCNT tokens", async function () {
      let airdropBalance = await dcnt.balanceOf(dnctAirdrop.address);
      expect(airdropBalance).to.equal(totalClaimable);
    });
  });

  describe("Airdrop claims", function () {
    describe("Given valid proof", function () {
      it("Should transfer claimant's DCNT claim from airdrop to them", async function () {
        let _leaf1 = leaves[0];
        const proof = tree.getHexProof(_leaf1);

        await dnctAirdrop.claim(claimant1.address, BigNumber.from(airdropClaimants[0].claim), proof);

        let claimant1Balance = await dcnt.balanceOf(claimant1.address);
        let airdropBalance = await dcnt.balanceOf(dnctAirdrop.address);

        expect(claimant1Balance).to.equal(airdropClaimants[0].claim);
        expect(airdropBalance).to.equal(totalClaimable.sub(airdropClaimants[0].claim));
      });

      it("Should revert with AlreadyClaimed() if already claimed", async function () {
        let _leaf1 = leaves[0];
        const proof = tree.getHexProof(_leaf1);

        let _ = await dnctAirdrop.claim(claimant1.address, BigNumber.from(airdropClaimants[0].claim), proof);
        await _.wait();

        let _reclaim = dnctAirdrop.claim(claimant1.address, BigNumber.from(airdropClaimants[0].claim), proof);
        expect(_reclaim).to.be.revertedWith('AlreadyClaimed()');

        let airdropBalance = await dcnt.balanceOf(dnctAirdrop.address);
        expect(airdropBalance).to.equal(totalClaimable.sub(airdropClaimants[0].claim));
      });
    });

    describe("Given invalid proof", function () {
      it("Should revert with NotEligible() due to mismatching claim", async function () {
        let _leaf1 = leaves[0];
        const proof = tree.getHexProof(_leaf1);

        let attemptToClaim = dnctAirdrop.claim(
          claimant1.address, BigNumber.from(airdropClaimants[0].claim.add(1)), proof
        )

        expect(attemptToClaim).to.be.revertedWith('NotEligible()');

        let claimant1Balance = await dcnt.balanceOf(claimant1.address);
        let airdropBalance = await dcnt.balanceOf(dnctAirdrop.address);

        expect(claimant1Balance).to.equal(0);
        expect(airdropBalance).to.equal(totalClaimable);
      });

      it("Should revert with NotEligible() due to address not in airdrop", async function () {
        let _leaf = makeLeaf(claimantN.address, BigNumber.from(1));
        const proof = tree.getHexProof(_leaf);

        let attemptToClaim = dnctAirdrop.claim(claimant1.address, BigNumber.from(1), proof);
        expect(attemptToClaim).to.be.revertedWith('NotEligible()');

        let claimantBalance = await dcnt.balanceOf(claimantN.address);
        let airdropBalance = await dcnt.balanceOf(dnctAirdrop.address);

        expect(claimantBalance).to.equal(0);
        expect(airdropBalance).to.equal(totalClaimable);
      });
    });
  });



  describe("End airdrop", function () {
    describe("When called before end date", function () {
      it("Should revert with AirdropStillActive()", async function () {
        expect(dnctAirdrop.endAirdrop()).to.be.revertedWith("AirdropStillActive()");
      });
    });

    describe("When called after end date", function () {

      it("Should transfer all unclaimed airdrops to recovery address", async function () {
        await time.increase(time.duration.years(1));
        await dnctAirdrop.endAirdrop();

        let revoveryDestBalance = await dcnt.balanceOf(recoveryDest.address);
        expect(revoveryDestBalance).to.equal(totalClaimable);

        let airdropBalance = await dcnt.balanceOf(dnctAirdrop.address);
        expect(airdropBalance).to.equal(0);
      });
    });
  });
});
