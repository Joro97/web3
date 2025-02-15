// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GovernanceToken} from "./GovernanceToken.sol";
import {console} from "hardhat/console.sol";

contract SimpleDao {
    error SimpleDao__ZeroAddress();
    error SimpleDao__NonTokenHolder();
    error SimpleDao__TooShortVotingDuration();
    error SimpleDao__TooLongVotingDuration();
    error SimpleDao__TooShortTitle();
    error SimpleDao__TooShortDescription();
    error SimpleDao__AlreadyActiveProposal();
    error SimpleDao__NotActiveProposalCurrently();
    error SimpleDao__VotingDurationNotOverYet();
    error SimpleDao__CantWithdrawWhileActiveProposal();

    event VoteCast(address indexed voter, bool _voteFor, uint256 amount);
    event ProposalFinalised(address indexed finaliser, string proposalTitle);
    event ProposalCreated(address indexed creator, string proposalTitle);
    event TokensWithdrawn(address indexed user, uint256 amountTokens); // Always withdraws full amount deposited ever

    enum ProposalResult {
        PASSED,
        FAILED,
        DID_NOT_REACH_QUORUM
    }

    struct Proposal {
        string title;
        string description;
        uint256 votingDuration;
        uint256 votesFor;
        uint256 votesAgainst;
        bool hasFinalised;
        ProposalResult result;
    }

    uint256 public constant MIN_VOTING_WINDOW = 3 days;
    uint256 public constant MAX_VOTING_WINDOW = 33 days;
    uint8 public constant MIN_TITLE_LENGTH = 3;
    uint8 public constant MIN_DESCRIPTION_LENGTH = 13;
    uint256 public constant MINIMUM_PERCENTAGE_THRESHOLD = 60;

    GovernanceToken public govToken;
    mapping(address user => uint256 votingPower) public userToCastedVotes;
    Proposal public activeProposal;
    Proposal[] public pastProposals;

    constructor(address[] memory recipients) {
        govToken = new GovernanceToken(recipients);
    }

    modifier onlyTokenHolder(address _caller) {
        if (govToken.balanceOf(_caller) == 0) {
            revert SimpleDao__NonTokenHolder();
        }
        _;
    }

    modifier onlyWhenNoActiveProposal() {
        if (activeProposal.votingDuration != 0) {
            revert SimpleDao__CantWithdrawWhileActiveProposal();
        }
        _;
    }

    function createProposal(
        string calldata _title,
        string calldata _description,
        uint256 _votingDuration,
        uint256 _amountTokens,
        bool _voteFor
    ) external onlyTokenHolder(msg.sender) {
        //console.log("proposal", activeProposal.votingDuration);
        //console.log("activeProposal.hasFinalised", activeProposal.hasFinalised);
        if (activeProposal.votingDuration != 0 && !activeProposal.hasFinalised) {
            revert SimpleDao__AlreadyActiveProposal();
        }

        if (_votingDuration < block.timestamp + MIN_VOTING_WINDOW) {
            revert SimpleDao__TooShortVotingDuration();
        }

        if (_votingDuration > block.timestamp + MAX_VOTING_WINDOW) {
            revert SimpleDao__TooLongVotingDuration();
        }

        if (bytes(_title).length < MIN_TITLE_LENGTH) {
            revert SimpleDao__TooShortTitle();
        }

        if (bytes(_description).length < MIN_DESCRIPTION_LENGTH) {
            revert SimpleDao__TooShortDescription();
        }

        activeProposal = Proposal({
            title: _title,
            description: _description,
            votingDuration: _votingDuration,
            votesFor: _voteFor ? _amountTokens : 0,
            votesAgainst: _voteFor ? 0 : _amountTokens,
            hasFinalised: false,
            result: ProposalResult.DID_NOT_REACH_QUORUM
        });

        userToCastedVotes[msg.sender] += _amountTokens;

        govToken.transferFrom(msg.sender, address(this), _amountTokens);
        govToken.pause();
        emit ProposalCreated(msg.sender, _title);
    }

    function castVote(uint256 _tokensAmount, bool _voteFor) external {
        if (_voteFor) {
            activeProposal.votesFor += _tokensAmount;
        } else {
            activeProposal.votesAgainst += _tokensAmount;
        }

        userToCastedVotes[msg.sender] += _tokensAmount;
        govToken.transferFrom(msg.sender, address(this), _tokensAmount);
        emit VoteCast(msg.sender, _voteFor, _tokensAmount);
    }

    function finalizeProposal() external {
        if (activeProposal.votingDuration == 0) {
            revert SimpleDao__NotActiveProposalCurrently();
        }
        if (block.timestamp < activeProposal.votingDuration) {
            revert SimpleDao__VotingDurationNotOverYet();
        }

        uint256 totalSupply = govToken.totalSupply();
        bool hasQuorum =
            (activeProposal.votesFor + activeProposal.votesAgainst) * 100 >= totalSupply * MINIMUM_PERCENTAGE_THRESHOLD;

        if (hasQuorum) {
            if (activeProposal.votesFor > activeProposal.votesAgainst) {
                activeProposal.result = ProposalResult.PASSED;
            } else {
                activeProposal.result = ProposalResult.FAILED;
            }
        }
        activeProposal.hasFinalised = true;

        emit ProposalFinalised(msg.sender, activeProposal.title);
        pastProposals.push(activeProposal);
        delete activeProposal;
        govToken.unpause();
    }

    function withdrawTokens() external onlyWhenNoActiveProposal {
        uint256 userBalance = userToCastedVotes[msg.sender];
        userToCastedVotes[msg.sender] = 0;
        govToken.transfer(msg.sender, userBalance);
        emit TokensWithdrawn(msg.sender, userBalance);
    }
}
