const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SimpleDao", function () {
  const initialMintAmount = ethers.parseEther("100");

  async function deploySimpleDaoFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, user1, user2, user3] = await ethers.getSigners();

    const SimpleDao = await ethers.getContractFactory("SimpleDao");
    const dao = await SimpleDao.deploy([user1, user3]);
    await dao.waitForDeployment();
    const daoAddress = await dao.getAddress();
    const token = await ethers.getContractAt("GovernanceToken", await dao.govToken());

    // Approve DAO to spend tokens for initial holders (user1 and user3)
    await token.connect(user1).approve(daoAddress, initialMintAmount);
    await token.connect(user3).approve(daoAddress, initialMintAmount);

    return { dao, token, owner, user1, user2, user3 };
  }

  describe("Deployment", function () {
    it("Should make provided users have expected Governance Token balance", async function () {
      const { dao, token, owner, user1, user2, user3 } = await loadFixture(deploySimpleDaoFixture);

      expect(await token.balanceOf(user1)).to.equal(initialMintAmount);
      expect(await token.balanceOf(user3)).to.equal(initialMintAmount);
    });

    it("Should set the right owner", async function () {
      const { dao, token } = await loadFixture(deploySimpleDaoFixture);

      expect(await token.owner()).to.equal(await dao.getAddress());
    });
  });

  describe("Proposal Creation", function () {
    it("Should revert for non-token holders", async function () {
      const { dao, user2 } = await loadFixture(deploySimpleDaoFixture);
      const now = await time.latest();
      const validDuration = now + time.duration.days(5);

      await expect(
        dao.connect(user2).createProposal("Title", "Description", validDuration, 100, true)
      ).to.be.revertedWithCustomError(dao, "SimpleDao__NonTokenHolder"); // Update error name if different
    });

    it("Should properly create a proposal and revert if another proposal is active", async function () {
      const { dao, token, user1 } = await loadFixture(deploySimpleDaoFixture);
      const now = await time.latest();
      const validDuration = now + time.duration.days(5);

      // Create first proposal (ensure token is unpaused initially)
      await dao.connect(user1).createProposal(
        "Valid Title",
        "A sufficiently long description to pass validation",
        validDuration,
        100,
        true
      );

      // Attempt to create another proposal
      await expect(
        dao.connect(user1).createProposal(
          "Another Title",
          "Another valid description",
          validDuration,
          100,
          true
        )
      ).to.be.revertedWithCustomError(dao, "SimpleDao__AlreadyActiveProposal");
    });

    it("Should revert for too short voting duration", async function () {
      const { dao, user1 } = await loadFixture(deploySimpleDaoFixture);
      const now = await time.latest();
      const tooShortDuration = now + time.duration.days(3) - 1; // 3 days - 1 second

      await expect(
        dao.connect(user1).createProposal(
          "Valid Title",
          "Valid description length here",
          tooShortDuration,
          100,
          true
        )
      ).to.be.revertedWithCustomError(dao, "SimpleDao__TooShortVotingDuration");
    });

    it("Should revert for too long voting duration", async function () {
      const { dao, user1 } = await loadFixture(deploySimpleDaoFixture);
      const now = await time.latest();
      const tooLongDuration = now + time.duration.days(34) + 1; // 33 days + 1 second

      await expect(
        dao.connect(user1).createProposal(
          "Valid Title",
          "Valid description length here",
          tooLongDuration,
          100,
          true
        )
      ).to.be.revertedWithCustomError(dao, "SimpleDao__TooLongVotingDuration");
    });

    it("Should revert for too short title", async function () {
      const { dao, user1 } = await loadFixture(deploySimpleDaoFixture);
      const now = await time.latest();
      const validDuration = now + time.duration.days(5);
      const shortTitle = "A"; // One character too short

      await expect(
        dao.connect(user1).createProposal(
          shortTitle,
          "A sufficiently long description",
          validDuration,
          100,
          true
        )
      ).to.be.revertedWithCustomError(dao, "SimpleDao__TooShortTitle");
    });

    it("Should revert for too short description", async function () {
      const { dao, user1 } = await loadFixture(deploySimpleDaoFixture);
      const now = await time.latest();
      const validDuration = now + time.duration.days(5);
      const shortDescription = "AAAAAAAAAAAA";

      await expect(
        dao.connect(user1).createProposal(
          "Valid Title",
          shortDescription,
          validDuration,
          100,
          true
        )
      ).to.be.revertedWithCustomError(dao, "SimpleDao__TooShortDescription");
    });
  });

  describe("Voting", function () {
    const voteAmount = ethers.parseEther("10");
    let proposalDuration;

    before(async () => {
      const now = await time.latest();
      proposalDuration = now + time.duration.days(5);
    });

    describe("Successful Votes", function () {
      it("Should cast FOR vote and update proposal state", async function () {
        const { dao, token, user1 } = await loadFixture(deploySimpleDaoFixture);

        // Create proposal first
        await dao.connect(user1).createProposal(
          "Valid Title",
          "A sufficiently long description to pass validation",
          proposalDuration,
          voteAmount,
          true
        );

        const initialBalance = await token.balanceOf(user1.address);
        const initialProposal = await dao.activeProposal();

        // Cast vote
        await expect(dao.connect(user1).castVote(voteAmount, true))
          .to.emit(dao, "VoteCast")
          .withArgs(user1.address, true, voteAmount);

        // Verify proposal state
        const updatedProposal = await dao.activeProposal();
        expect(updatedProposal.votesFor).to.equal(
          initialProposal.votesFor + voteAmount
        );
        expect(updatedProposal.votesAgainst).to.equal(
          initialProposal.votesAgainst
        );

        // Verify user state
        expect(await dao.userToCastedVotes(user1.address))
          .to.equal(voteAmount + voteAmount); // One voteAmount when creating + one when casting the vote

        // Verify token transfers
        expect(await token.balanceOf(user1.address))
          .to.equal(initialBalance - voteAmount);
      });

      it("Should cast AGAINST vote and update proposal state", async function () {
        const { dao, token, user1 } = await loadFixture(deploySimpleDaoFixture);

        await dao.connect(user1).createProposal(
          "Valid Title",
          "A sufficiently long description to pass validation",
          proposalDuration,
          voteAmount,
          false
        );

        const initialProposal = await dao.activeProposal();

        await expect(dao.connect(user1).castVote(voteAmount, false))
          .to.emit(dao, "VoteCast")
          .withArgs(user1.address, false, voteAmount);

        const updatedProposal = await dao.activeProposal();
        expect(updatedProposal.votesAgainst).to.equal(
          initialProposal.votesAgainst + voteAmount
        );
        expect(updatedProposal.votesFor).to.equal(
          initialProposal.votesFor
        );
      });
    });
    describe("Failure Cases", function () {
      it("Should revert for insufficient token balance", async function () {
        const { dao, token, user1, user2 } = await loadFixture(deploySimpleDaoFixture);

        // Create proposal with user1 first
        await dao.connect(user1).createProposal(
          "Valid Title",
          "A sufficiently long description to pass validation",
          proposalDuration,
          voteAmount,
          true
        );

        await expect(dao.connect(user2).castVote(voteAmount, true))
          .to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
      });
    });
  });

  describe("Finalization of Proposals", function () {
    it("Should revert finalizeProposal if no active proposal exists", async function () {
      const { dao, user1 } = await loadFixture(deploySimpleDaoFixture);
      await expect(dao.connect(user1).finalizeProposal())
        .to.be.revertedWithCustomError(dao, "SimpleDao__NotActiveProposalCurrently");
    });

    it("Should revert finalizeProposal if voting period is not over", async function () {
      const { dao, user1 } = await loadFixture(deploySimpleDaoFixture);
      const now = await time.latest();
      // Set voting end to now + 5 days (>= MIN_VOTING_WINDOW)
      const votingEnd = now + time.duration.days(5);
      await dao.connect(user1).createProposal(
        "Valid Title",
        "A sufficiently long description",
        votingEnd,
        ethers.parseEther("10"),
        true
      );
      await expect(dao.connect(user1).finalizeProposal())
        .to.be.revertedWithCustomError(dao, "SimpleDao__VotingDurationNotOverYet");
    });

    it("Should finalize proposal with quorum met and voteFor > voteAgainst (PASSED)", async function () {
      const { dao, token, user1, user3 } = await loadFixture(deploySimpleDaoFixture);
      const now = await time.latest();
      const votingEnd = now + time.duration.days(5);

      // user1 creates a proposal voting FOR with 100 tokens.
      await dao.connect(user1).createProposal(
        "Proposal 1",
        "A sufficiently long description",
        votingEnd,
        initialMintAmount,
        true
      );

      // To meet quorum (>=60% of totalSupply = 120 tokens), user3 votes FOR with 30 tokens.
      const voteAmount = ethers.parseEther("30");
      await dao.connect(user3).castVote(voteAmount, true);

      await time.increaseTo(votingEnd + 1);

      await expect(dao.connect(user1).finalizeProposal())
        .to.emit(dao, "ProposalFinalised")
        .withArgs(user1.address, "Proposal 1");

      // Check that the stored proposal result is PASSED (enum index 0).
      const pastProposal = await dao.pastProposals(0);
      expect(pastProposal.title).to.equal("Proposal 1");
      expect(pastProposal.description).to.equal("A sufficiently long description");
      expect(pastProposal.votingDuration).to.equal(votingEnd);
      expect(pastProposal.votesFor).to.equal(initialMintAmount + voteAmount); // if user3 voted 30 tokens
      expect(pastProposal.votesAgainst).to.equal(0);
      expect(pastProposal.hasFinalised).to.equal(true);
      expect(pastProposal.result).to.equal(0); // PASSED
    });

    it("Should finalize proposal with quorum met and voteFor <= voteAgainst (FAILED)", async function () {
      const { dao, token, user1, user3 } = await loadFixture(deploySimpleDaoFixture);
      const now = await time.latest();
      const votingEnd = now + time.duration.days(5);

      // user1 creates a proposal voting AGAINST with 100 tokens.
      await dao.connect(user1).createProposal(
        "Proposal 2",
        "A sufficiently long description",
        votingEnd,
        initialMintAmount,
        false
      );

      // To meet quorum, user3 votes FOR with 30 tokens.
      await dao.connect(user3).castVote(ethers.parseEther("30"), true);

      await time.increaseTo(votingEnd + 1);

      await expect(dao.connect(user1).finalizeProposal())
        .to.emit(dao, "ProposalFinalised")
        .withArgs(user1.address, "Proposal 2");

      // Expect result to be FAILED (enum index 1) since votesFor (30) is not > votesAgainst (100).
      const pastProposal = await dao.pastProposals(0);
      expect(pastProposal.result).to.equal(1);
    });

    it("Should finalize proposal with no quorum (DID_NOT_REACH_QUORUM)", async function () {
      const { dao, user1 } = await loadFixture(deploySimpleDaoFixture);
      const now = await time.latest();
      const votingEnd = now + time.duration.days(5);

      // Create proposal with only 10 tokens, not reaching quorum (60% of totalSupply = 120 tokens).
      await dao.connect(user1).createProposal(
        "Proposal 3",
        "A sufficiently long description",
        votingEnd,
        ethers.parseEther("10"),
        true
      );

      await time.increaseTo(votingEnd + 1);

      await expect(dao.connect(user1).finalizeProposal())
        .to.emit(dao, "ProposalFinalised")
        .withArgs(user1.address, "Proposal 3");

      // Since quorum wasn't met, result remains DID_NOT_REACH_QUORUM (enum index 2).
      const pastProposal = await dao.pastProposals(0);
      expect(pastProposal.result).to.equal(2);
    });
  });

  describe("Withdrawals", function () {
    const voteAmount = ethers.parseEther("10");
    let proposalDuration;

    before(async () => {
      const now = await time.latest();
      proposalDuration = now + time.duration.days(5);
    });

    it("Should not allow withdrawing tokens when active proposal", async function () {
      const { dao, user1 } = await loadFixture(deploySimpleDaoFixture);

      // Create proposal first
      await dao.connect(user1).createProposal(
        "Valid Title",
        "A sufficiently long description to pass validation",
        proposalDuration,
        voteAmount,
        true
      );

      const initialProposal = await dao.activeProposal();

      await expect(dao.connect(user1).withdrawTokens())
        .to.be.revertedWithCustomError(dao, "SimpleDao__CantWithdrawWhileActiveProposal");
    });

    it("Should allow withdrawal of all tokens after proposal finalization", async function () {
      const { dao, user1 } = await loadFixture(deploySimpleDaoFixture);
      const now = await time.latest();
      const votingEnd = now + time.duration.days(5);
      const voteAmount = ethers.parseEther("10");

      // Create and finalize the proposal
      await dao.connect(user1).createProposal(
        "Withdrawal Proposal",
        "A sufficiently long description",
        votingEnd,
        voteAmount,
        true
      );
      await time.increaseTo(votingEnd + 1);
      await dao.connect(user1).finalizeProposal();

      // Verify deposited tokens before withdrawal
      const deposited = await dao.userToCastedVotes(user1.address);
      expect(deposited).to.equal(voteAmount);

      // Withdraw tokens and validate the withdrawal event and state change
      await expect(dao.connect(user1).withdrawTokens())
        .to.emit(dao, "TokensWithdrawn")
        .withArgs(user1.address, voteAmount);
      const afterWithdraw = await dao.userToCastedVotes(user1.address);
      expect(afterWithdraw).to.equal(0);
    });
  });

  describe("Goverance Token Pause logic", function () {
    it("Should not allow govToken transfers between users during an active proposal", async function () {
      const { dao, token, user1, user2 } = await loadFixture(deploySimpleDaoFixture);
      const now = await time.latest();
      const votingEnd = now + time.duration.days(5);

      // Create a proposal which pauses the govToken
      await dao.connect(user1).createProposal(
        "Transfer Test Proposal",
        "A sufficiently long description",
        votingEnd,
        ethers.parseEther("10"),
        true
      );

      // Attempt to transfer tokens while the token is paused
      await expect(token.connect(user1).transfer(user2.address, ethers.parseEther("1")))
        .to.be.reverted;

      const approvalAmount = ethers.parseEther("30");
      await token.connect(user1).approve(user2, approvalAmount);
      // Validate user cant be shano
      await expect(token.connect(user2).transferFrom(user1.address, user2.address, approvalAmount))
        .to.be.reverted;
    });

    it("Should allow govToken transfers between users when there is no active proposal", async function () {
      const { dao, token, user1, user2 } = await loadFixture(deploySimpleDaoFixture);

      // Attempt to transfer tokens while the token is paused
      await token.connect(user1).transfer(user2.address, ethers.parseEther("1"));

      const approvalAmount = ethers.parseEther("30");
      await token.connect(user1).approve(user2, approvalAmount);

      await token.connect(user2).transferFrom(user1.address, user2.address, approvalAmount);
    });
  });
});
