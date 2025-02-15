// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract GovernanceToken is ERC20, Ownable, Pausable {
    error GovernanceToken__CanOnlyTransferToSimpleDaoWhileOngoingVote();

    uint256 public constant INITIAL_VOTING_POWER = 100 * 10**18;

    constructor(address[] memory recipients)
        ERC20("GovernanceToken", "GOV")
        Ownable(msg.sender)
    {
        for (uint i = 0; i < recipients.length; i += 1) {
            _mint(recipients[i], INITIAL_VOTING_POWER);
        }
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    // The following functions are overrides required by Solidity.

    function _update(address from, address to, uint256 value)
        internal
        override(ERC20)
    {
        if (paused() && to != owner()) {
            revert GovernanceToken__CanOnlyTransferToSimpleDaoWhileOngoingVote();
        }
        super._update(from, to, value);
    }
}