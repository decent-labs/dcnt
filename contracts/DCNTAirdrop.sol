//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract DCNTAirdrop {
    bytes32 private immutable merkleRoot;
    uint256 public immutable totalClaimable;
    IERC20 public immutable dcntToken;
    address public immutable returnAddress;
    uint64 public immutable endDate;

    mapping(address => bool) public claimed;

    event AirdropClaimed(address claimant, uint256 amount);

    error AlreadyClaimed();
    error NotEligible();
    error AirdropStillActive();

    constructor(
        IERC20 _dcntToken,
        bytes32 _merkleRoot,
        uint256 _totalClaimable,
        uint64 _endDate,
        address _returnAddress
    ) {
        dcntToken = _dcntToken;
        merkleRoot = _merkleRoot;
        totalClaimable = _totalClaimable;
        returnAddress = _returnAddress;
        endDate = _endDate;
    }

    function claim(
        address _claimant,
        uint256 _amount,
        bytes32[] memory _proof
    ) public {
        if (claimed[_claimant] == true) {
            revert AlreadyClaimed();
        }
        if (!verify(_claimant, _amount, _proof)) {
            revert NotEligible();
        }

        claimed[_claimant] = true;
        dcntToken.transfer(_claimant, _amount);

        emit AirdropClaimed(_claimant, _amount);
    }

    function endAirdrop() public {
        if (block.timestamp < endDate) {
            revert AirdropStillActive();
        }

        dcntToken.transfer(returnAddress, dcntToken.balanceOf(address(this)));
    }

    function verify(
        address _claimant,
        uint256 _amount,
        bytes32[] memory _proof
    ) public view returns (bool) {
        return
            MerkleProof.verify(
                _proof,
                merkleRoot,
                keccak256(abi.encodePacked(_claimant, _amount))
            );
    }
}
