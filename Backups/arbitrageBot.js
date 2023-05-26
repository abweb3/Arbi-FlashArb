require('dotenv').config();
const ethers = require('ethers');
const { ChainId, Token, WETH, Fetcher, Route } = require('@uniswap/sdk');
const FlashLoanReceiverABI = require('./flashloanreceive.abi'); // Import the FlashLoanReceiver contract ABI

// Set up provider and signer
const { AlchemyWeb3Provider } = require('@alch/alchemy-web3');
const provider = new AlchemyWeb3Provider(process.env.ALCHEMY_RPC_URL, 'arb-mainnet');
const signer = new ethers.Wallet(process.env.PRIVATE_KEY).connect(provider);

// Set up addresses and tokens
const uniswap = 'Uniswap V3'; // Replace with the actual Uniswap DEX name
const sushiswap = 'SushiSwap'; // Replace with the actual SushiSwap DEX name
const pancakeSwap = 'PancakeSwap'; // Replace with the actual PancakeSwap DEX name
const tokenAddress = 'token-address'; // Replace with the actual token address

// Set up contract addresses
const poolAddressesProviderAddress = process.env.POOL_ADDRESSES_PROVIDER_ADDRESS;
const flashLoanReceiverContractAddress = process.env.FLASH_LOAN_RECEIVER_CONTRACT_ADDRESS;

// Set up tokens for Uniswap, SushiSwap, and PancakeSwap
const token = new Token(ChainId.MAINNET, tokenAddress, 18);

// Gas optimization settings
const gasPrice = ethers.utils.parseUnits('50', 'gwei'); // Adjust the gas price as desired
const gasLimit = 500000; // Adjust the gas limit as desired

// Slippage tolerance settings
const slippageTolerance = 0.005; // 0.5% slippage tolerance, adjust as desired

async function analyzeAndArbitrage() {
  try {
    // Fetch reserves and prices from Uniswap, SushiSwap, and PancakeSwap
    const uniswapReserves = await getReserves(uniswap);
    const sushiswapReserves = await getReserves(sushiswap);
    const pancakeSwapReserves = await getReserves(pancakeSwap);

    const uniswapPrice = calculatePrice(token, uniswapReserves);
    const sushiswapPrice = calculatePrice(token, sushiswapReserves);
    const pancakeSwapPrice = calculatePrice(token, pancakeSwapReserves);

    // Compare prices and check for arbitrage opportunity
    if (uniswapPrice > sushiswapPrice && uniswapPrice > pancakeSwapPrice) {
      const profit = calculateProfit(uniswapPrice, sushiswapPrice, pancakeSwapPrice);
      const { uniswapAmount, sushiswapAmount } = calculateTradeAmounts(profit, uniswapPrice, sushiswapPrice);

      console.log(`Arbitrage opportunity detected on Uniswap! Profit: ${profit}`);
      console.log('Executing flash loan...');

      // Execute flash loan with adjusted trade amounts
      await executeFlashLoan(uniswapAmount, poolAddressesProviderAddress, tokenAddress);

      // ... perform Uniswap trade with uniswapAmount ...
    } else if (sushiswapPrice > uniswapPrice && sushiswapPrice > pancakeSwapPrice) {
      const profit = calculateProfit(sushiswapPrice, uniswapPrice, pancakeSwapPrice);
      const { sushiswapAmount, uniswapAmount } = calculateTradeAmounts(profit, sushiswapPrice, uniswapPrice);

      console.log(`Arbitrage opportunity detected on SushiSwap! Profit: ${profit}`);
      console.log('Executing flash loan...');

      // Execute flash loan with adjusted trade amounts
      await executeFlashLoan(sushiswapAmount, poolAddressesProviderAddress, tokenAddress);

      // ... perform SushiSwap trade with sushiswapAmount ...
    } else if (pancakeSwapPrice > uniswapPrice && pancakeSwapPrice > sushiswapPrice) {
      const profit = calculateProfit(pancakeSwapPrice, uniswapPrice, sushiswapPrice);
      const { pancakeSwapAmount, uniswapAmount } = calculateTradeAmounts(profit, pancakeSwapPrice, uniswapPrice);

      console.log(`Arbitrage opportunity detected on PancakeSwap! Profit: ${profit}`);
      console.log('Executing flash loan...');

      // Execute flash loan with adjusted trade amounts
      await executeFlashLoan(pancakeSwapAmount, poolAddressesProviderAddress, tokenAddress);

      // ... perform PancakeSwap trade with pancakeSwapAmount ...
    } else {
      console.log('No arbitrage opportunity detected.');
    }
  } catch (error) {
    console.error('Error:', error);
    // Implement error handling logic here, such as retrying failed transactions or providing meaningful error messages
  }
}

async function getReserves(dex) {
  const pair = await Fetcher.fetchPairData(token, WETH[ChainId.MAINNET], provider);
  const route = new Route([pair], WETH[ChainId.MAINNET]);

  return dex === uniswap ? pair.reserve0 : pair.reserve1;
}

function calculatePrice(token, reserves) {
  return reserves / (10 ** token.decimals);
}

function calculateProfit(sourcePrice, targetPrice1, targetPrice2) {
  const amount = ethers.utils.parseEther('1'); // Amount to be borrowed in the flash loan
  const fee = amount.mul(5).div(10000); // Flash loan fee of 0.05%

  const targetAmount1 = amount.div(sourcePrice).mul(1 - slippageTolerance);
  const targetAmount2 = targetAmount1.div(targetPrice1).mul(1 - slippageTolerance);

  const profit = targetAmount2.mul(targetPrice2).sub(amount.sub(fee));

  return profit;
}

async function executeFlashLoan(amount, poolAddressesProviderAddress, tokenAddress) {
  const flashLoanReceiver = new ethers.Contract(
    flashLoanReceiverContractAddress,
    FlashLoanReceiverABI,
    signer
  );

  const overrides = {
    gasLimit: gasLimit,
    gasPrice: gasPrice,
  };

  const transaction = await flashLoanReceiver.executeOperation(
    [tokenAddress], // assets
    [amount], // amounts
    [0], // premiums (set to 0 for simplicity, adjust if needed)
    signer.address, // initiator
    '0x' // empty params (replace with actual params if needed)
  );

  console.log('Flash loan transaction hash:', transaction.hash);
}

function calculateTradeAmounts(amount, sourcePrice, targetPrice) {
  const targetAmount = amount.div(sourcePrice).mul(1 - slippageTolerance);
  const sourceAmount = targetAmount.div(targetPrice).mul(1 - slippageTolerance);

  return {
    uniswapAmount: sourceAmount,
    sushiswapAmount: targetAmount,
  };
}

// Execute the bot at a specified interval
setInterval(analyzeAndArbitrage, 5000); // Adjust the interval as desired
