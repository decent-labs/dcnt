import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { DCNTToken } from "../typechain";
import { MerkleTree } from "merkletreejs";

import time from "./time";
import {
  makeLeaf,
  makeLeaves,
  constructMerkleTree,
} from "../scripts/airdrop_helpers";

describe("DCNTToken", function () {
  let owner: SignerWithAddress,
    nonOwner: SignerWithAddress,
    recoveryDest: SignerWithAddress,
    claimant1: SignerWithAddress,
    claimantN: SignerWithAddress,
    claimant2: SignerWithAddress;

  let dcnt: DCNTToken;
  let freeMintWhole: number;
  const airdropSupply: BigNumber = BigNumber.from(10_000);
  let freeMintTotal: BigNumber;

  let tree: MerkleTree;
  let leaves: string[];
  let airdropClaimants: {
    addr: string;
    claim: BigNumber;
  }[];

  let airdropEndDate: number;

  beforeEach(async function () {
    [owner, nonOwner, recoveryDest, claimant1, claimant2, claimantN] =
      await ethers.getSigners();

    airdropClaimants = [
      { addr: claimant1.address, claim: BigNumber.from(1000) },
      { addr: claimant2.address, claim: BigNumber.from(9000) },
    ];

    // Prepare merkle tree of claimants
    leaves = makeLeaves(airdropClaimants);
    tree = constructMerkleTree(leaves);

    airdropEndDate = (await time.latest()) + time.duration.years(1);

    freeMintWhole = 1_000_000_000;
    freeMintTotal = ethers.utils.parseEther(freeMintWhole.toString());

    // Deploy token contract
    const _DCNTToken = await ethers.getContractFactory("DCNTToken");
    dcnt = await _DCNTToken.deploy(
      freeMintTotal,
      airdropSupply,
      tree.getHexRoot(),
      airdropEndDate
    );
    await dcnt.deployed();
  });

  describe("Token features", function () {
    describe("Minting the correct amount of initial free tokens", function () {
      let totalSupply: BigNumber;

      beforeEach(async function () {
        totalSupply = await dcnt.totalSupply();
      });

      it("Should mint the correct amount of initial tokens in wei (decimals)", async function () {
        expect(totalSupply).to.equal(freeMintTotal);
      });

      it("Should mint the correct amount of initial tokens in whole numbers", async function () {
        expect(parseInt(ethers.utils.formatEther(totalSupply))).to.eq(
          freeMintWhole
        );
      });
    });

    describe("Minting more tokens", function () {
      let originalTotalSupply: BigNumber,
        minimumMintInterval: number,
        mintCapBPs: number,
        nextMint: BigNumber;

      beforeEach(async function () {
        [originalTotalSupply, minimumMintInterval, mintCapBPs, nextMint] =
          await Promise.all([
            dcnt.totalSupply(),
            dcnt.MINIMUM_MINT_INTERVAL(),
            dcnt.MINT_CAP_BPS(),
            dcnt.nextMint(),
          ]);

        await time.increaseTo(nextMint.toNumber());
      });

      describe("Depending on the caller address", function () {
        let oneWei: number;

        beforeEach(function () {
          oneWei = 1;
        });

        it("Should allow owner to mint 1 wei", async function () {
          await dcnt.mint(owner.address, oneWei);
          expect(await dcnt.totalSupply()).to.eq(
            originalTotalSupply.add(oneWei)
          );
        });

        it("Should not allow non-owner to mint 1 wei", async function () {
          await expect(
            dcnt.connect(nonOwner).mint(owner.address, oneWei)
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });
      });

      describe("Depending on the amount", function () {
        let maxToMint: BigNumber;

        beforeEach(async function () {
          // calculate the max amount of tokens that can be minted
          maxToMint = originalTotalSupply.mul(mintCapBPs).div(10000);
        });

        describe("Max mint amount", function () {
          it("Should allow the owner to mint more tokens", async function () {
            await dcnt.mint(owner.address, maxToMint);
            expect(await dcnt.totalSupply()).to.eq(
              originalTotalSupply.add(maxToMint)
            );
          });
        });

        describe("Over max mint amount", function () {
          let overMaxToMint: BigNumber;

          beforeEach(function () {
            overMaxToMint = maxToMint.add(1);
          });

          it("Should not allow the owner to mint more tokens", async function () {
            await expect(
              dcnt.mint(owner.address, overMaxToMint)
            ).to.be.revertedWith("MintExceedsMaximum()");
          });
        });
      });

      describe("Depending on the time", function () {
        beforeEach(async function () {
          // dummy mint to set the timeout interval
          await dcnt.mint(owner.address, 0);
        });

        it("Should not allow the owner to mint after having just minted", async function () {
          await expect(dcnt.mint(owner.address, 1)).to.be.revertedWith(
            "MintTooSoon()"
          );
        });

        it("Should allow the owner to mint after the minimum mint interval", async function () {
          await time.increase(minimumMintInterval);
          const toMint = 1;
          await dcnt.mint(owner.address, toMint);
          expect(await dcnt.totalSupply()).to.eq(
            originalTotalSupply.add(toMint)
          );
        });
      });
    });
  });

  describe("Airdrop features", function () {
    describe("Initial deployment state", function () {
      it("Should have totalClaimable DCNT tokens allocated for airdrop", async function () {
        const airdropBalance = await dcnt.balanceOf(dcnt.address);
        expect(airdropBalance).to.equal(airdropSupply);
      });

      it("Should have correctly set all initial state vars", async function () {
        const _endDate = await dcnt.endDate();
        const _root = await dcnt.merkleRoot();

        expect(_endDate).to.equal(airdropEndDate);
        expect(_root).to.equal(tree.getHexRoot());
      });
    });

    describe("Airdrop claims", function () {
      describe("Given valid proof", function () {
        it("Should transfer claimant's DCNT claim from airdrop to them, and emit AirdropClaimed", async function () {
          const _leaf1 = leaves[0];
          const proof = tree.getHexProof(_leaf1);

          const eligibleClaim = dcnt
            .connect(claimant1)
            .claim(
              BigNumber.from(airdropClaimants[0].claim),
              claimant1.address,
              proof
            );

          expect(eligibleClaim).to.emit(dcnt, "AirdropClaimed");

          await eligibleClaim;

          const claimant1Balance = await dcnt.balanceOf(claimant1.address);
          const airdropBalance = await dcnt.balanceOf(dcnt.address);

          expect(claimant1Balance).to.equal(airdropClaimants[0].claim);
          expect(airdropBalance).to.equal(
            airdropSupply.sub(airdropClaimants[0].claim)
          );
        });

        it("Should revert with AlreadyClaimed() if already claimed", async function () {
          const _leaf1 = leaves[0];
          const proof = tree.getHexProof(_leaf1);

          const _ = await dcnt
            .connect(claimant1)
            .claim(
              BigNumber.from(airdropClaimants[0].claim),
              claimant1.address,
              proof
            );
          await _.wait();

          const _reclaim = dcnt
            .connect(claimant1)
            .claim(
              BigNumber.from(airdropClaimants[0].claim),
              claimant1.address,
              proof
            );
          expect(_reclaim).to.be.revertedWith("AlreadyClaimed()");

          const airdropBalance = await dcnt.balanceOf(dcnt.address);
          expect(airdropBalance).to.equal(
            airdropSupply.sub(airdropClaimants[0].claim)
          );
        });

        it("Should allow eligible transfers after end date as long as endAirdrop has not been called", async function () {
          const _leaf1 = leaves[0];
          const proof = tree.getHexProof(_leaf1);

          await time.increase(time.duration.years(10));

          await dcnt
            .connect(claimant1)
            .claim(
              BigNumber.from(airdropClaimants[0].claim),
              claimant1.address,
              proof
            );

          const claimant1Balance = await dcnt.balanceOf(claimant1.address);
          const airdropBalance = await dcnt.balanceOf(dcnt.address);

          expect(claimant1Balance).to.equal(airdropClaimants[0].claim);
          expect(airdropBalance).to.equal(
            airdropSupply.sub(airdropClaimants[0].claim)
          );
        });

        it("Should revert after endAirdrop has been called", async function () {
          const _leaf1 = leaves[0];
          const proof = tree.getHexProof(_leaf1);

          await time.increase(time.duration.years(1));
          await dcnt.endAirdrop(recoveryDest.address);

          const lateClaim = dcnt.claim(
            BigNumber.from(airdropClaimants[0].claim),
            claimant1.address,
            proof
          );

          /* eslint-disable-next-line no-unused-expressions */
          expect(lateClaim).to.be.reverted;
        });

        describe("Delegation at claim", function () {
          it("Should delegate voting power to provided address", async function () {
            const _leaf1 = leaves[0];
            const proof = tree.getHexProof(_leaf1);

            const eligibleClaim = dcnt
              .connect(claimant1)
              .claim(
                BigNumber.from(airdropClaimants[0].claim),
                claimantN.address,
                proof
              );

            await expect(eligibleClaim)
              .to.emit(dcnt, "DelegateChanged")
              .withArgs(
                claimant1.address,
                ethers.constants.AddressZero,
                claimantN.address
              );
          });

          it("Should be possible to delegate voting power to claimant", async function () {
            const _leaf1 = leaves[0];
            const proof = tree.getHexProof(_leaf1);

            const eligibleClaim = dcnt
              .connect(claimant1)
              .claim(
                BigNumber.from(airdropClaimants[0].claim),
                claimant1.address,
                proof
              );

            await expect(eligibleClaim)
              .to.emit(dcnt, "DelegateChanged")
              .withArgs(
                claimant1.address,
                ethers.constants.AddressZero,
                claimant1.address
              );
          });
        });
      });

      describe("Given invalid proof", function () {
        it("Should revert with NotEligible() due to mismatching claim", async function () {
          const _leaf1 = leaves[0];
          const proof = tree.getHexProof(_leaf1);

          const attemptToClaim = dcnt
            .connect(claimant1)
            .claim(
              BigNumber.from(airdropClaimants[0].claim.add(1)),
              claimant1.address,
              proof
            );

          expect(attemptToClaim).to.be.revertedWith("NotEligible()");

          const claimant1Balance = await dcnt.balanceOf(claimant1.address);
          const airdropBalance = await dcnt.balanceOf(dcnt.address);

          expect(claimant1Balance).to.equal(0);
          expect(airdropBalance).to.equal(airdropSupply);
        });

        it("Should revert with NotEligible() due to address not in airdrop", async function () {
          const _leaf = makeLeaf(claimantN.address, BigNumber.from(1));
          const proof = tree.getHexProof(_leaf);

          const attemptToClaim = dcnt
            .connect(claimant1)
            .claim(BigNumber.from(1), claimant1.address, proof);
          expect(attemptToClaim).to.be.revertedWith("NotEligible()");

          const claimantBalance = await dcnt.balanceOf(claimantN.address);
          const airdropBalance = await dcnt.balanceOf(dcnt.address);

          expect(claimantBalance).to.equal(0);
          expect(airdropBalance).to.equal(airdropSupply);
        });
      });
    });

    describe("End airdrop", function () {
      describe("When called before end date", function () {
        it("Should revert with AirdropStillActive()", async function () {
          expect(dcnt.endAirdrop(recoveryDest.address)).to.be.revertedWith(
            "AirdropStillActive()"
          );
        });
      });

      describe("When called after end date", function () {
        it("Should transfer all unclaimed airdrops to recovery address, and emit AirdropEnded", async function () {
          await time.increase(time.duration.years(1));
          const endAirdrop = dcnt.endAirdrop(recoveryDest.address);

          expect(endAirdrop).to.emit(dcnt, "AirdropEnded");

          await endAirdrop;

          const revoveryDestBalance = await dcnt.balanceOf(
            recoveryDest.address
          );
          expect(revoveryDestBalance).to.equal(airdropSupply);

          const airdropBalance = await dcnt.balanceOf(dcnt.address);
          expect(airdropBalance).to.equal(0);
        });

        it("Should not allow non owner to end airdrop", async function () {
          await time.increase(time.duration.years(1));

          /* eslint-disable-next-line no-unused-expressions */
          expect(dcnt.connect(claimant1).endAirdrop(recoveryDest.address)).to.be
            .reverted;
        });

        it("Should not allow non owner to end airdrop", async function () {
          /* eslint-disable-next-line no-unused-expressions */
          expect(dcnt.connect(claimant1).endAirdrop(recoveryDest.address)).to.be
            .reverted;
        });
      });
    });
  });
});
