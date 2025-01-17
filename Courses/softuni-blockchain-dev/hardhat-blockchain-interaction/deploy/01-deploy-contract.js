module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    await deploy("SimpleToken", {
        from: deployer,
        args: [], // Constructor arguments
        log: true,
    });
};