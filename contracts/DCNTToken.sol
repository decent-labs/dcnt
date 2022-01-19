//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";

contract DCNTToken is ERC20, ERC20Permit, ERC20Votes, Ownable {
    uint256 public constant MINIMUM_MINT_INTERVAL = 365 days;
    uint256 public constant MINT_CAP_BPS = 200; // 2%
    uint256 public nextMint; // Timestamp

    error MintExceedsMaximum();
    error MintTooSoon();

    constructor(uint256 freeSupply)
        ERC20("Decent", "DCNT")
        ERC20Permit("Decent")
    {
        _mint(msg.sender, freeSupply);
        nextMint = block.timestamp + MINIMUM_MINT_INTERVAL;
    }

    function mint(address dest, uint256 amount) external onlyOwner {
        if (amount > (totalSupply() * MINT_CAP_BPS) / 10000) {
            revert MintExceedsMaximum();
        }

        if (block.timestamp < nextMint) {
            revert MintTooSoon();
        }

        nextMint = block.timestamp + MINIMUM_MINT_INTERVAL;
        _mint(dest, amount);
    }

    // The functions below are overrides required by Solidity.

    function _afterTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20, ERC20Votes) {
        super._afterTokenTransfer(from, to, amount);
    }

    function _mint(address to, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._mint(to, amount);
    }

    function _burn(address account, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._burn(account, amount);
    }
}
