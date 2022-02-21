//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./DCNTToken.sol";

contract DCNTAirdrop is ReentrancyGuard {
    bytes32 private immutable merkleRoot;
    uint256 public immutable totalClaimable;
    address public immutable dcntToken;
    address payable public immutable returnAddress;
    uint64 public immutable endDate;

    mapping(address => bool) public claimed;

    event AirdropClaimed(address claimant, uint256 amount);

    constructor(
        address _dcntToken,
        bytes32 _merkleRoot,
        uint256 _totalClaimable,
        uint64 _endDate,
        address _returnAddress
    ) {
        dcntToken = _dcntToken;
        merkleRoot = _merkleRoot;
        totalClaimable = _totalClaimable;
        returnAddress = payable(_returnAddress);
        endDate = _endDate;
    }

    function claim(
        address _claimant,
        uint256 _amount,
        bytes32[] memory _proof
    ) public nonReentrant {
        require(claimed[_claimant] != true, "Already claimed");
        require(
            _verify(_claimant, _amount, _proof),
            "Not eligible for airdrop"
        );

        // Use require instead?
        // require(
        //     DCNTToken(dcntToken).transfer(_claimant, _amount),
        //     "Failed to transfer tokens"
        // );
        // claimed[_claimant] = true;
        // emit AirdropClaimed(_claimant, _amount);

        if (DCNTToken(dcntToken).transfer(_claimant, _amount)) {
            claimed[_claimant] = true;
            emit AirdropClaimed(_claimant, _amount);
        }
    }

    function endAirdrop() public {
        require(block.timestamp >= endDate, "Cannot end active airdrop");

        DCNTToken(dcntToken).transfer(
            returnAddress,
            DCNTToken(dcntToken).balanceOf(address(this))
        );
    }

    function _verify(
        address _claimant,
        uint256 _amount,
        bytes32[] memory _proof
    ) private view returns (bool) {
        return
            MerkleProof.verify(
                _proof,
                merkleRoot,
                keccak256(abi.encodePacked(_claimant, _amount))
            );
    }
}
