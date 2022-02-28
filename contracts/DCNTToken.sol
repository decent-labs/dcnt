//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";

/// @notice the dcnt token
contract DCNTToken is ERC20Votes, Ownable {
    uint128 public nextMint; // Timestamp
    uint32 public constant MINIMUM_MINT_INTERVAL = 365 days;
    uint8 public constant MINT_CAP_BPS = 200; // 2%

    bytes32 public immutable merkleRoot;
    uint64 public immutable endDate;

    mapping(address => bool) public claimed;

    event AirdropClaimed(address claimant, uint256 amount);
    event AirdropEnded();

    error AlreadyClaimed();
    error NotEligible();
    error AirdropStillActive();

    error MintExceedsMaximum();
    error MintTooSoon();

    /// @param _freeSupply amount of tokens to mint at Token Generation Event
    /// @param _airdropSupply amount of tokens to allocated for airdrop
    /// @param _merkleRoot The root of a merkle tree constructed from
    ///  a dataset containing eligible addresses and their claims.
    ///   See
    ///       - https://github.com/miguelmota/merkletreejs for generating tree in JS
    ///       - https://github.com/miguelmota/merkletreejs-solidity#example for example usage
    /// @param _endDate timestamp before which claimants may continue to claim airdrop
    ///
    /// @dev The 'leaves' param in (https://github.com/miguelmota/merkletreejs) should be a list of
    ///  keccak256 hashes of "abi.encodePacked(claimantAddress, claim)"s for this contract's verification
    ///  to work. Pair sorting should be enabled.
    constructor(
        uint256 _freeSupply,
        uint256 _airdropSupply,
        bytes32 _merkleRoot,
        uint64 _endDate
    ) ERC20("Decent", "DCNT") ERC20Permit("Decent") {
        merkleRoot = _merkleRoot;
        endDate = _endDate;
        _mint(msg.sender, _freeSupply);
        transfer(address(this), _airdropSupply);
        nextMint = uint128(block.timestamp + MINIMUM_MINT_INTERVAL);
    }

    /// @notice mint can be called at most once every 365 days,
    ///  and with an amount no more than 2% of the current supply
    /// @param dest address to assign newly minted tokens to
    /// @param amount amount of tokens to mint
    /// @dev only the `owner` is authorized to mint more tokens
    function mint(address dest, uint256 amount) external onlyOwner {
        if (amount > (totalSupply() * MINT_CAP_BPS) / 10000) {
            revert MintExceedsMaximum();
        }

        if (block.timestamp < nextMint) {
            revert MintTooSoon();
        }

        nextMint = uint128(block.timestamp + MINIMUM_MINT_INTERVAL);
        _mint(dest, amount);
    }

    /// @notice Claim an airdrop if eligigle
    /// @param _amount to claim; must necessarily be equal to the amount allocated to claimant
    /// @param _proof Merkle Proof to validate claim
    /// @param _delegatee The address to delegate the claimant's voting power to
    function claim(
        uint256 _amount,
        address _delegatee,
        bytes32[] memory _proof
    ) public {
        if (claimed[msg.sender] == true) {
            revert AlreadyClaimed();
        }
        if (!verify(msg.sender, _amount, _proof)) {
            revert NotEligible();
        }

        claimed[msg.sender] = true;
        emit AirdropClaimed(msg.sender, _amount);

        _delegate(msg.sender, _delegatee);
        ERC20Votes(this).transfer(msg.sender, _amount);
    }

    /// @notice Transfer unclaimed tokens to pre-designated address. Emits AirdropEnded()
    /// @param _returnAddress unclaimed tokens will be sent to this address after endAirdrop is called
    function endAirdrop(address _returnAddress) public onlyOwner {
        if (block.timestamp < endDate) {
            revert AirdropStillActive();
        }

        ERC20Votes(this).transfer(_returnAddress, balanceOf(address(this)));
        emit AirdropEnded();
    }

    /// @notice Verify an airdrop claim. Does not transfer tokens.
    /// @param _claimant the account making the claim, to which airdrop will be sent
    /// @param _amount to claim; must necessarily be equal to the amount allocated to _claimant
    /// @param _proof Merkle Proof to validate claim
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
