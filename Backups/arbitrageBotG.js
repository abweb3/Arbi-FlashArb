require("dotenv").config();
const { createAlchemyWeb3 } = require("@alch/alchemy-web3");
const ethers = require("ethers");
const { ChainId, Token, WETH, Fetcher, Route } = require("@uniswap/sdk");
const FlashLoanReceiverABI = require("./flashloanreceive.abi");

const web3 = createAlchemyWeb3(process.env.ALCHEMY_RPC_URL);
const provider = new ethers.providers.JsonRpcProvider(
  process.env.ALCHEMY_RPC_URL
);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY).connect(provider);

const uniswap = "Uniswap V3";
const sushiswap = "SushiSwap";
const camelot = "Camelot";
const tokenAddress = "0xC31E54c7a869B9FcBEcc14363CF510d1c41fa443";

const poolAddressesProviderAddress =
  process.env.POOL_ADDRESSES_PROVIDER_ADDRESS;
const flashLoanReceiverContractAddress =
  process.env.FLASH_LOAN_RECEIVER_CONTRACT_ADDRESS;

const token = new Token(ChainId.MAINNET, tokenAddress, 18);

const gasPrice = ethers.utils.parseUnits("50", "gwei");
const gasLimit = 500000;

const slippageTolerance = 0.005;

const config = {
  gasPrice,
  gasLimit,
  slippageTolerance,
};

const analyzeAndArbitrage = async () => {
  try {
    const uniswapReserves = await getReserves(uniswap);
    const sushiswapReserves = await getReserves(sushiswap);
    const camelotReserves = await getReserves(camelot);

    const uniswapPrice = calculatePrice(token, uniswapReserves);
    const sushiswapPrice = calculatePrice(token, sushiswapReserves);
    const camelotPrice = calculatePrice(token, camelotReserves);

    const dexes = [uniswap, sushiswap, camelot];
    const prices = [uniswapPrice, sushiswapPrice, camelotPrice];
    const maxPrice = Math.max(...prices);
    const dexWithMaxPrice = dexes[prices.indexOf(maxPrice)];

    if (maxPrice > Math.min(...prices)) {
      const profit = calculateProfit(
        maxPrice,
        ...prices.filter((price) => price !== maxPrice)
      );
      const { amount1, amount2 } = calculateTradeAmounts(
        profit,
        maxPrice,
        ...prices.filter((price) => price !== maxPrice)
      );

      console.log(
        `Arbitrage opportunity detected on ${dexWithMaxPrice}! Profit: ${profit}`
      );
      console.log("Executing flash loan...");

      await executeFlashLoan(
        amount1,
        poolAddressesProviderAddress,
        tokenAddress
      );

      await performTrade(dexWithMaxPrice, amount1, config);
    } else {
      console.log("No arbitrage opportunity detected.");
    }
  } catch (error) {
    console.error("Error:", error);
  }
};

const getReserves = async (dex) => {
  const pair = await Fetcher.fetchPairData(
    token,
    WETH[ChainId.MAINNET],
    provider
  );
  const route = new Route([pair], WETH[ChainId.MAINNET]);

  return dex === uniswap ? pair.reserve0 : pair.reserve1;
};

const calculatePrice = (token, reserves) => reserves / 10 ** token.decimals;

const calculateProfit = (sourcePrice, targetPrice1, targetPrice2) => {
  const amount = ethers.utils.parseEther("1");
  const fee = amount.mul(5).div(10000);
  const targetAmount1 = amount
    .div(sourcePrice)
    .mul(1 - config.slippageTolerance);
  const targetAmount2 = targetAmount1
    .div(targetPrice1)
    .mul(1 - config.slippageTolerance);

  const profit = targetAmount2.mul(targetPrice2).sub(amount.sub(fee));

  return profit;
};

const executeFlashLoan = async (
  amount,
  poolAddressesProviderAddress,
  tokenAddress
) => {
  const flashLoanReceiver = new ethers.Contract(
    flashLoanReceiverContractAddress,
    FlashLoanReceiverABI,
    signer
  );

  const overrides = {
    gasLimit: config.gasLimit,
    gasPrice: config.gasPrice,
  };

  const transaction = await flashLoanReceiver.executeOperation(
    [tokenAddress],
    [amount],
    [0],
    signer.address,
    "0x",
    overrides
  );

  console.log("Flash loan transaction hash:", transaction.hash);
};

const calculateTradeAmounts = (amount, sourcePrice, targetPrice) => {
  const targetAmount = amount
    .div(sourcePrice)
    .mul(1 - config.slippageTolerance);
  const sourceAmount = targetAmount
    .div(targetPrice)
    .mul(1 - config.slippageTolerance);

  return {
    amount1: sourceAmount,
    amount2: targetAmount,
  };
};

const performTrade = async (dex, amount, config) => {
  console.log(`Performing ${dex} trade with amount: ${amount}`);
};

setInterval(analyzeAndArbitrage, 5000);
