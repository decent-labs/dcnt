
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { MerkleTree } from "merkletreejs";


export function makeLeaves(airdropClaimants: { addr: string, claim: BigNumber }[]): Buffer[] {
    return airdropClaimants.map(x => makeLeaf(x.addr, x.claim));
}

export function constructMerkleTree(leaves: (string | Buffer)[]): MerkleTree {
    return new MerkleTree(
        leaves,
        ethers.utils.keccak256,
        { sort: true },
    )

}

export function makeLeaf(claimant: string, claim: BigNumber): Buffer {
    return Buffer.from(
        ethers.utils.solidityKeccak256(['address', 'uint256'], [claimant, claim]).replace(/^0x/, ""),
        "hex"
    )
}