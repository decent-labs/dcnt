import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { AbiCoder } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { MerkleTree } from "merkletreejs";

import { DCNTToken, DCNTAirdrop } from "../typechain";
import time from "./time";


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

  const freeMintWhole = 1_000_000_000;
  const totalClaimable = 10_000;

  let tree: MerkleTree;
  let leaves: (string | Buffer)[];
  let airdropClaimants: {
    addr: String;
    claim: number;
  }[];


  beforeEach(async function () {
    [deployer, recoveryDest, claimant1, claimant2, claimantN] = await ethers.getSigners();

    airdropClaimants = [
      { addr: claimant1.address, claim: 1000 },
      { addr: claimant2.address, claim: 9000 },
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
    leaves = airdropClaimants.map(x => Buffer.from(
      ethers.utils.solidityKeccak256(['address', 'uint256'], [x.addr, x.claim]).replace(/^0x/, ""),
      "hex"
    ));

    tree = new MerkleTree(leaves, ethers.utils.keccak256, { sort: true })

    // Deploy airdrop contract
    let DCNTAirdrop = await ethers.getContractFactory("DCNTAirdrop");
    let _now = new Date();
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
    beforeEach(async function () {
    });

    describe("Given valid proof", function () {
      it("Should transfer claimant's DCNT claim from airdrop to them", async function () {
        let _leaf1 = leaves[0];
        const proof = tree.getHexProof(_leaf1);

        await dnctAirdrop.claim(claimant1.address, BigNumber.from(airdropClaimants[0].claim), proof);

        let claimant1Balance = await dcnt.balanceOf(claimant1.address);
        let airdropBalance = await dcnt.balanceOf(dnctAirdrop.address);

        expect(claimant1Balance).to.equal(airdropClaimants[0].claim);
        expect(airdropBalance).to.equal(totalClaimable - airdropClaimants[0].claim);
      });

      it("Should revert with AlreadyClaimed() if already claimed", async function () {
        let _leaf1 = leaves[0];
        const proof = tree.getHexProof(_leaf1);

        let _ = await dnctAirdrop.claim(claimant1.address, BigNumber.from(airdropClaimants[0].claim), proof);
        await _.wait();

        let _reclaim = dnctAirdrop.claim(claimant1.address, BigNumber.from(airdropClaimants[0].claim), proof);
        expect(_reclaim).to.be.revertedWith('AlreadyClaimed()');

        let airdropBalance = await dcnt.balanceOf(dnctAirdrop.address);
        expect(airdropBalance).to.equal(totalClaimable - airdropClaimants[0].claim);
      });
    });

    describe("Given invalid proof", function () {
      it("Should revert with NotEligible() due to mismatching claim", async function () {
        let _leaf1 = leaves[0];
        const proof = tree.getHexProof(_leaf1);

        let attemptToClaim = dnctAirdrop.claim(claimant1.address, BigNumber.from(airdropClaimants[0].claim + 1), proof);
        expect(attemptToClaim).to.be.revertedWith('NotEligible()');

        let claimant1Balance = await dcnt.balanceOf(claimant1.address);
        let airdropBalance = await dcnt.balanceOf(dnctAirdrop.address);

        expect(claimant1Balance).to.equal(0);
        expect(airdropBalance).to.equal(totalClaimable);
      });

      it("Should revert with NotEligible() due to address not in airdrop", async function () {
        let _leaf = Buffer.from(
          ethers.utils.solidityKeccak256(['address', 'uint256'], [claimantN.address, 1]).replace(/^0x/, ""),
          "hex"
        )
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
