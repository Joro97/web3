const ethers = require("ethers");

task("balance", "Prints an account's balance")
    .addParam("address", "Address to check")
    .setAction(async (taskArgs, hre) => {
        const balance = await hre.ethers.provider.getBalance(taskArgs.address);
        console.log('Balance WEI', balance);
        console.log('Balance ETH', hre.ethers.formatEther(balance));
    });

task("mint", "Mints X amount of tokens to address Y")
    .addParam("address", "Address to mint to")
    .addParam("amount", "ETH amount of tokens to be minted")
    .setAction(async (taskArgs, hre) => {
        const { address, amount } = taskArgs;

        const deployment = await hre.deployments.get('SimpleToken');
        const contractAddress = await deployment.address;
        console.log('deployment address', contractAddress);

        const factory = await hre.ethers.getContractFactory('SimpleToken');
        const token = await factory.deploy();

        const balanceBefore = await token.balanceOf(address);
        console.log('token balance before mint', balanceBefore);
        const tx = await token.mint(address, hre.ethers.parseEther(amount));
        await tx.wait();

        const balanceAfter = await token.balanceOf(address);
        console.log('token balance after mint:', hre.ethers.formatEther(balanceAfter));

        console.log(`Minted ${amount} tokens to ${address}`);

    });

task("transfer", "Mints tokens from the deployer and transfers them")
    .addParam("from", "The address to transfer tokens from")
    .addParam("to", "The address to transfer tokens to")
    .addParam("amount", "The amount of tokens to mint and transfer (in ETH format)")
    .setAction(async (taskArgs, hre) => {
        const { from, to, amount } = taskArgs;

        const { deployer } = await hre.getNamedAccounts();
        const deployerSigner = await hre.ethers.getSigner(deployer);
        const fromSigner = await hre.ethers.getSigner(from);
        const parsedAmount = await hre.ethers.parseEther(amount);

        const factory = await hre.ethers.getContractFactory('SimpleToken');
        const token = await factory.deploy();

        const fromBalanceBefore = await token.connect(fromSigner).balanceOf(fromSigner);
        console.log('From Address token balance before mint', fromBalanceBefore);
        await token.connect(deployerSigner).mint(fromSigner, parsedAmount);
        const fromBalanceAfter = await token.connect(fromSigner).balanceOf(fromSigner);
        console.log('From token balance after mint:', hre.ethers.formatEther(fromBalanceAfter));


        const toBalanceBefore = await token.connect(fromSigner).balanceOf(to);
        console.log('To Address token balance before transfer', hre.ethers.formatEther(toBalanceBefore));
        await token.connect(fromSigner).transfer(to, parsedAmount);
        const toBalanceAfter = await token.connect(fromSigner).balanceOf(to);
        console.log('To Address token balance after transfer:', hre.ethers.formatEther(toBalanceAfter));
    });