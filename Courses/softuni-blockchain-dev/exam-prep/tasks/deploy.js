// Add this to your hardhat.config.js

require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
require("@nomicfoundation/hardhat-verify");

task("deploy-sepolia", "Deploys SimpleDao amd GovernanceToken on Sepolia and verifies it")
    .addOptionalParam("holders", "Comma-separated list of initial token holders")
    .setAction(async (taskArgs) => {
        const [deployer] = await hre.ethers.getSigners();
        console.log("Deploying contracts with account:", deployer.address);

        // Auto-fetch first 2 Hardhat accounts if no holders provided and on localhost
        let initialHolders;
        if (!taskArgs.holders && hre.network.name === "localhost") {
            const accounts = await hre.ethers.getSigners();
            initialHolders = accounts.slice(0, 2).map(acc => acc.address); // Use first 2 accounts
            console.log("Using default holders:", initialHolders);
        } else {
            initialHolders = taskArgs.holders ? taskArgs.holders.split(",") : [];
        }

        // Deploy
        const SimpleDao = await hre.ethers.getContractFactory("SimpleDao");
        const dao = await SimpleDao.deploy(initialHolders);
        await dao.waitForDeployment();

        console.log("SimpleDao deployed to:", await dao.getAddress());

        // Skip verification on localhost
        if (hre.network.name === "sepolia") {
            await dao.deploymentTransaction().wait(5);
            await hre.run("verify:verify", {
                address: await dao.getAddress(),
                constructorArguments: [initialHolders],
            });
        }
    });