//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @notice Controller for the DCNT token airdrop 💰
 */
contract DCNTAirdrop {
    bytes32 public immutable merkleRoot;
    uint256 public immutable totalClaimable;
    IERC20 public immutable dcntToken;
    address public immutable returnAddress;
    uint64 public immutable endDate;

    mapping(address => bool) public claimed;

    event AirdropClaimed(address claimant, uint256 amount);
    event AirdropEnded();

    error AlreadyClaimed();
    error NotEligible();
    error AirdropStillActive();

    /**
     * @param _dcntToken token address
     * @param _merkleRoot The root of a merkle tree constructed from
     *  a dataset containing eligible addresses and their claims.
     *   See
            - https://github.com/miguelmota/merkletreejs for generating tree in JS
            - https://github.com/miguelmota/merkletreejs-solidity#example for example usage
     * @param _endDate timestamp before which claimants may continue to claim airdrop
     * @param _returnAddress unclaimed tokens will be sent to this address after endAirdrop is called
     *
     * @dev The 'leaves' param in (https://github.com/miguelmota/merkletreejs) should be a list of
     *  keccak256 hashes of "abi.encodePacked(claimantAddress, claim)"s for this contract's verification
     *  to work. Pair sorting should be enabled.
     */
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

    /**
     * @notice Claim an airdrop if claimant is eligigle
     * @param _claimant the account making the claim, to which airdrop will be sent
     * @param _amount to claim; must necessarily be equal to the amount allocated to _claimant
     * @param _proof Merkle Proof to validate claim
     */
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

    /**
     * @notice Transfer unclaimed tokens to pre-designated address. Emits AirdropEnded()
     */
    function endAirdrop() public {
        if (block.timestamp < endDate) {
            revert AirdropStillActive();
        }

        dcntToken.transfer(returnAddress, dcntToken.balanceOf(address(this)));
        emit AirdropEnded();
    }

    /**
     * @notice Verify an airdrop claim. Does not transfer tokens.
     * @param _claimant the account making the claim, to which airdrop will be sent
     * @param _amount to claim; must necessarily be equal to the amount allocated to _claimant
     * @param _proof Merkle Proof to validate claim
     */
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
