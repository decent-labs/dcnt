//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";

/// @notice the dcnt token
contract DCNTToken is ERC20Votes, Ownable {
    uint128 public nextMint; // Timestamp
    uint32 public constant MINIMUM_MINT_INTERVAL = 365 days;
    uint8 public constant MINT_CAP_BPS = 200; // 2%

    error MintExceedsMaximum();
    error MintTooSoon();

    /// @param _supply amount of tokens to mint at Token Generation Event
    constructor(uint256 _supply) ERC20("Decent", "DCNT") ERC20Permit("Decent") {
        _mint(msg.sender, _supply);
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

    /// @dev holders can burn their own tokens
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}
